import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { rows } = body as { rows: Record<string, string>[] }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Aucune ligne à importer' }, { status: 400 })
  }

  // Group rows by portfolio_domain
  const byDomain: Record<string, Record<string, string>[]> = {}
  for (const row of rows) {
    const d = (row.portfolio_domain ?? '').trim().toLowerCase().replace(/^www\./, '')
    if (!d) continue
    if (!byDomain[d]) byDomain[d] = []
    byDomain[d].push(row)
  }

  if (Object.keys(byDomain).length === 0) {
    return NextResponse.json({ error: 'Colonne portfolio_domain introuvable ou vide' }, { status: 400 })
  }

  // Load owned domains + existing campaigns in parallel
  const [{ data: ownedDomains }, { data: existingCampaigns }] = await Promise.all([
    supabase.from('owned_domains').select('id, domain').eq('user_id', user.id),
    supabase.from('campaigns').select('id, owned_domain_id, owned_domain:owned_domains(domain)').eq('user_id', user.id),
  ])

  const results: Array<{
    domain: string
    status: 'created' | 'existing' | 'error'
    campaign_id?: string
    imported: number
    skipped: number
    error?: string
  }> = []

  for (const [portfolioDomain, leads] of Object.entries(byDomain)) {
    const owned = (ownedDomains ?? []).find(
      d => d.domain.toLowerCase().replace(/^www\./, '') === portfolioDomain
    )

    if (!owned) {
      results.push({ domain: portfolioDomain, status: 'error', imported: 0, skipped: leads.length, error: 'Domaine absent du portfolio' })
      continue
    }

    // Find or create campaign for this domain
    let campaignId: string
    let campaignStatus: 'created' | 'existing' = 'existing'

    const existing = (existingCampaigns ?? []).find(
      c => (c.owned_domain as { domain: string } | null)?.domain?.toLowerCase().replace(/^www\./, '') === portfolioDomain
    )

    if (existing) {
      campaignId = existing.id
    } else {
      const { data: newCampaign, error: ce } = await supabase
        .from('campaigns')
        .insert({ owned_domain_id: owned.id, name: `Vente de ${owned.domain}`, user_id: user.id, status: 'active' })
        .select()
        .single()

      if (ce || !newCampaign) {
        results.push({ domain: portfolioDomain, status: 'error', imported: 0, skipped: leads.length, error: 'Erreur création campagne' })
        continue
      }
      campaignId = newCampaign.id
      campaignStatus = 'created'
    }

    // Build prospect inserts
    const inserts = leads.map(row => {
      const rawDomain = (row.domain ?? row.website ?? '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].trim()
      const emailDomain = row.email ? row.email.split('@')[1] ?? '' : ''
      const domain = rawDomain || emailDomain || `lead-${Math.random().toString(36).slice(2, 8)}.no-site`
      const dot = domain.indexOf('.')
      return {
        campaign_id: campaignId,
        user_id: user.id,
        domain,
        tld: dot !== -1 ? domain.slice(dot) : '.no-site',
        domain_type: 'other' as const,
        company_name: row.company_name || null,
        owner_name: row.first_name ? `${row.first_name} ${row.last_name ?? ''}`.trim() : (row.owner_name ?? null),
        email: row.email || null,
        email_source: 'imported' as const,
        linkedin_url: row.linkedin_url || null,
        phone: row.phone || null,
        website_active: !!rawDomain,
        scrape_status: 'skipped' as const,
        status: 'to_contact' as const,
        notes: row.notes || null,
      }
    })

    const { data: inserted, error: ie } = await supabase
      .from('prospects')
      .upsert(inserts, { onConflict: 'campaign_id,domain', ignoreDuplicates: true })
      .select('id')

    if (ie) {
      results.push({ domain: portfolioDomain, status: 'error', imported: 0, skipped: leads.length, error: ie.message })
    } else {
      results.push({
        domain: portfolioDomain,
        status: campaignStatus,
        campaign_id: campaignId,
        imported: inserted?.length ?? 0,
        skipped: leads.length - (inserted?.length ?? 0),
      })
    }
  }

  return NextResponse.json({ results })
}
