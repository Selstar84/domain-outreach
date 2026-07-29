import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAnthropicClient, MODELS } from '@/lib/ai/claude-client'
import { searchApolloProspects } from '@/lib/apollo'
import { searchGooglePlaces } from '@/lib/google-places'
import { extractEmails } from '@/lib/scraping/email-extractor'

function scheduledDateForDay(baseDate: Date, dayOffset: number): string {
  const d = new Date(baseDate)
  d.setUTCDate(d.getUTCDate() + dayOffset)
  d.setUTCHours(9, 0, 0, 0)
  return d.toISOString()
}

// POST /api/campaigns/[id]/auto-run
// Full pipeline: analyze → generate templates → save sequences → launch
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: campaign_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { email_account_id } = body

  if (!email_account_id) {
    return NextResponse.json({ error: 'email_account_id requis' }, { status: 400 })
  }

  // Load campaign + domain + settings in parallel
  const [{ data: campaign }, { data: settings }, { data: account }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('*, owned_domain:owned_domains(*)')
      .eq('id', campaign_id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('settings')
      .select('anthropic_api_key, apollo_api_key, google_places_api_key')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('email_accounts')
      .select('id, is_active, daily_limit')
      .eq('id', email_account_id)
      .eq('user_id', user.id)
      .single(),
  ])

  if (!campaign) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })
  if (!account?.is_active) return NextResponse.json({ error: 'Compte email inactif' }, { status: 400 })

  const apiKey = (settings as any)?.anthropic_api_key as string | null
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Clé API Anthropic manquante. Ajoutez-la dans les Paramètres.' },
      { status: 400 },
    )
  }

  const domainName: string = (campaign as any).owned_domain?.domain ?? ''
  if (!domainName) return NextResponse.json({ error: 'Domaine introuvable' }, { status: 400 })

  const claude = getAnthropicClient(apiKey)
  const steps: { step: string; status: 'done' | 'skipped' }[] = []

  // ── Step 1: Analyze domain ──────────────────────────────────────────────────
  if (!campaign.domain_analyzed_at) {
    const prompt = `You are a domain name expert and B2B sales strategist.
Analyze this domain name: **${domainName}**

Return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{
  "domain_type": "geo" | "industry" | "keyword" | "brandable",
  "city": string or null,
  "province": string or null,
  "country": string or null,
  "country_code": string or null,
  "tld": string,
  "main_keyword": string,
  "language": "fr" | "en" | "es" | "other",
  "industries": [2-4 relevant industries],
  "ideal_buyers": [3-5 job titles],
  "apollo_searches": [{"keywords": [...], "location": "...", "titles": [...]}],
  "value_proposition": "1-2 sentences in the domain's language",
  "pitch_angle": "1 sentence why a business would want this domain",
  "google_search_query": "ready-to-use Google Places search query"
}

Rules:
- For geo-domains: extract city, province, country from the domain name
- For .ca: assume Canada. For .com with English word: Canada or USA
- main_keyword is the core word without city/TLD
- value_proposition in the same language as the domain`

    const msg = await claude.messages.create({
      model: MODELS.smart,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = msg.content.filter(b => b.type === 'text').map(b => (b as any).text).join('').trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0])
      await supabase
        .from('campaigns')
        .update({ domain_analysis: analysis, domain_analyzed_at: new Date().toISOString() })
        .eq('id', campaign_id)
    }
    steps.push({ step: 'Analyse du domaine', status: 'done' })
  } else {
    steps.push({ step: 'Analyse du domaine', status: 'skipped' })
  }

  // ── Step 1.5: Apollo auto-discovery (if API key configured) ────────────────
  const apolloKey = (settings as any)?.apollo_api_key as string | null
  if (apolloKey) {
    try {
      // Reload campaign to get fresh analysis (may have just been saved above)
      const { data: freshCampaign } = await supabase
        .from('campaigns')
        .select('domain_analysis')
        .eq('id', campaign_id)
        .single()

      const analysis = (freshCampaign as any)?.domain_analysis
      const apolloSearches: Array<{ keywords: string[]; location: string; titles: string[] }> =
        analysis?.apollo_searches ?? []

      if (apolloSearches.length > 0) {
        const firstSearch = apolloSearches[0]
        const prospects = await searchApolloProspects(
          {
            keywords: firstSearch.keywords,
            location: firstSearch.location ?? '',
            titles: firstSearch.titles,
            maxResults: 25,
          },
          apolloKey,
        )

        // Only import prospects that have an email
        const withEmail = prospects.filter(p => p.email)

        if (withEmail.length > 0) {
          function extractDomain(website: string | null, name: string | null, id: string): string {
            if (website) {
              try { return new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '') }
              catch { return website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] }
            }
            const slug = (name ?? id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63)
            return `${slug || id.slice(-8)}.no-site`
          }

          const inserts = withEmail.map(p => {
            const domain = extractDomain(p.company_website, p.company_name, p.id)
            const dot = domain.indexOf('.')
            return {
              campaign_id,
              user_id: user.id,
              domain,
              tld: dot !== -1 ? domain.slice(dot) : '.no-site',
              domain_type: 'other' as const,
              company_name: p.company_name ?? null,
              owner_name: p.name || null,
              email: p.email!,
              email_source: 'hunter' as const,
              linkedin_url: p.linkedin_url ?? null,
              phone: p.phone ?? null,
              website_active: !!p.company_website,
              scrape_status: 'skipped' as const,
              status: 'to_contact' as const,
            }
          })

          const { data: inserted } = await supabase
            .from('prospects')
            .upsert(inserts, { onConflict: 'campaign_id,domain', ignoreDuplicates: true })
            .select('id')

          steps.push({ step: `Apollo : ${inserted?.length ?? 0} prospects trouvés avec email`, status: 'done' })
        } else {
          steps.push({ step: 'Apollo : aucun prospect avec email trouvé', status: 'skipped' })
        }
      } else {
        steps.push({ step: 'Apollo : analyse insuffisante pour la recherche', status: 'skipped' })
      }
    } catch {
      // Apollo failure is non-blocking — continue pipeline
      steps.push({ step: 'Apollo : recherche ignorée (erreur API)', status: 'skipped' })
    }
  }

  // ── Step 1.6: Google Places auto-discovery (if API key configured) ──────────
  const googleKey = (settings as any)?.google_places_api_key as string | null
  if (googleKey) {
    try {
      const { data: freshCampaign2 } = await supabase
        .from('campaigns')
        .select('domain_analysis')
        .eq('id', campaign_id)
        .single()

      const googleQuery: string = (freshCampaign2 as any)?.domain_analysis?.google_search_query ?? ''

      if (googleQuery) {
        const places = await searchGooglePlaces(googleQuery, googleKey, 20)
        const withWebsite = places.filter(p => p.website)

        // Quick parallel homepage fetch to extract emails (3s timeout per site)
        async function quickFetchEmail(website: string): Promise<string | null> {
          try {
            const controller = new AbortController()
            setTimeout(() => controller.abort(), 3000)
            const res = await fetch(website.startsWith('http') ? website : `https://${website}`, {
              signal: controller.signal,
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainBot/1.0)' },
            })
            if (!res.ok) return null
            const html = await res.text()
            const found = extractEmails(html)
            return found[0]?.email ?? null
          } catch {
            return null
          }
        }

        const enriched = await Promise.allSettled(
          withWebsite.map(async p => {
            const email = await quickFetchEmail(p.website!)
            return { place: p, email }
          })
        )

        const toInsert = enriched
          .filter(r => r.status === 'fulfilled' && r.value.email)
          .map(r => {
            const { place, email } = (r as PromiseFulfilledResult<{ place: (typeof withWebsite)[0]; email: string }>).value
            let domain = place.website!
            try { domain = new URL(place.website!.startsWith('http') ? place.website! : `https://${place.website!}`).hostname.replace(/^www\./, '') }
            catch { domain = place.website!.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] }
            const dot = domain.indexOf('.')
            return {
              campaign_id,
              user_id: user.id,
              domain,
              tld: dot !== -1 ? domain.slice(dot) : '.com',
              domain_type: 'other' as const,
              company_name: place.name,
              phone: place.phone ?? null,
              email: email!,
              email_source: 'scraped' as const,
              website_active: true,
              scrape_status: 'done' as const,
              status: 'to_contact' as const,
            }
          })

        if (toInsert.length > 0) {
          const { data: inserted } = await supabase
            .from('prospects')
            .upsert(toInsert, { onConflict: 'campaign_id,domain', ignoreDuplicates: true })
            .select('id')
          steps.push({ step: `Google Maps : ${inserted?.length ?? 0} prospects trouvés avec email`, status: 'done' })
        } else {
          steps.push({ step: `Google Maps : ${places.length} entreprises trouvées, aucun email extrait`, status: 'skipped' })
        }
      } else {
        steps.push({ step: 'Google Maps : requête manquante (analyse incomplète)', status: 'skipped' })
      }
    } catch {
      steps.push({ step: 'Google Maps : recherche ignorée (erreur API)', status: 'skipped' })
    }
  }

  // ── Step 2: Generate + save email templates ─────────────────────────────────
  const { data: existingSeq } = await supabase
    .from('follow_up_sequences')
    .select('id')
    .eq('campaign_id', campaign_id)
    .limit(1)

  if (!existingSeq || existingSeq.length === 0) {
    const askingPrice = campaign.asking_price
    const priceHint = askingPrice
      ? `Le prix demandé est $${askingPrice.toLocaleString()} (ne pas le mentionner dans les premiers emails).`
      : ''

    const genPrompt = `Tu es un courtier en noms de domaine. Génère des templates d'emails de prospection pour vendre le domaine "${domainName}".

${priceHint}

Variables disponibles (remplacées automatiquement) :
- {company_name} = nom de l'entreprise du prospect
- {my_domain} = domaine en vente (${domainName})
- {asking_price} = prix demandé

Génère exactement 3 templates :
Step 1 : Premier contact (4-5 phrases max, pas de prix, terminer par une question ouverte)
Step 2 : Première relance 3 jours après (3-4 phrases, référence à l'email précédent)
Step 3 : Deuxième relance 7 jours après (3 phrases, court et direct)

Retourne UNIQUEMENT un JSON valide (sans markdown) :
[
  {"step": 1, "subject": "...", "body": "..."},
  {"step": 2, "subject": "...", "body": "..."},
  {"step": 3, "subject": "...", "body": "..."}
]`

    const genMsg = await claude.messages.create({
      model: MODELS.fast,
      max_tokens: 2048,
      messages: [{ role: 'user', content: genPrompt }],
    })

    const genText = genMsg.content[0]
    if (genText.type === 'text') {
      const jsonMatch = genText.text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const templates = JSON.parse(jsonMatch[0]) as { step: number; subject: string; body: string }[]
        const delayMap: Record<number, number> = { 1: 0, 2: 3, 3: 7 }
        await supabase.from('follow_up_sequences').insert(
          templates.map(t => ({
            campaign_id,
            user_id: user.id,
            step_number: t.step,
            delay_days: delayMap[t.step] ?? (t.step - 1) * 3,
            subject_template: t.subject,
            body_template: t.body,
            is_active: true,
          }))
        )
      }
    }
    steps.push({ step: 'Génération templates email', status: 'done' })
  } else {
    steps.push({ step: 'Génération templates email', status: 'skipped' })
  }

  // ── Step 3: Set preferred email account ────────────────────────────────────
  await supabase
    .from('campaigns')
    .update({ preferred_email_account_id: email_account_id, status: 'active' })
    .eq('id', campaign_id)

  // ── Step 4: Queue all to_contact prospects ──────────────────────────────────
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, email')
    .eq('campaign_id', campaign_id)
    .eq('status', 'to_contact')
    .not('email', 'is', null)

  if (!prospects || prospects.length === 0) {
    return NextResponse.json({
      success: true,
      steps,
      queued: 0,
      message: 'Aucun prospect à contacter. Importez des prospects puis relancez.',
    })
  }

  const { data: existing } = await supabase
    .from('outreach_messages')
    .select('prospect_id')
    .eq('campaign_id', campaign_id)
    .eq('sequence_step', 1)
    .in('status', ['queued', 'sending', 'sent'])

  const alreadyQueued = new Set((existing ?? []).map(m => m.prospect_id))
  const toQueue = prospects.filter(p => !alreadyQueued.has(p.id))

  if (toQueue.length === 0) {
    return NextResponse.json({
      success: true,
      steps,
      queued: 0,
      message: 'Tous les prospects sont déjà dans la file d\'envoi.',
    })
  }

  const dailyLimit = account.daily_limit ?? 15
  const now = new Date()
  const isBeforeEight30 = now.getUTCHours() < 8 || (now.getUTCHours() === 8 && now.getUTCMinutes() < 30)
  const baseDate = new Date(now)
  if (!isBeforeEight30) baseDate.setUTCDate(baseDate.getUTCDate() + 1)

  const inserts = toQueue.map((p, i) => ({
    prospect_id: p.id,
    campaign_id,
    user_id: user.id,
    channel: 'email',
    sequence_step: 1,
    body: '',
    ai_generated: true,
    status: 'queued',
    scheduled_for: scheduledDateForDay(baseDate, Math.floor(i / dailyLimit)),
    email_account_id,
  }))

  const { error: insertError } = await supabase.from('outreach_messages').insert(inserts)
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  const totalDays = Math.ceil(toQueue.length / dailyLimit)
  steps.push({ step: `${toQueue.length} prospects mis en file d'envoi`, status: 'done' })

  return NextResponse.json({
    success: true,
    steps,
    queued: toQueue.length,
    daily_limit: dailyLimit,
    total_days: totalDays,
    first_send: scheduledDateForDay(baseDate, 0),
    last_send: scheduledDateForDay(baseDate, totalDays - 1),
  })
}
