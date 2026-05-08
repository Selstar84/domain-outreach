/**
 * POST /api/campaigns/[id]/analyze
 * Claude analyzes a domain name and returns structured insights:
 * - What type of domain it is (geographic, industry, keyword)
 * - City / country (if geo-domain)
 * - Target industries and ideal buyer profiles
 * - Suggested Apollo search queries
 * - Value proposition and pitch angle
 */
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAnthropicClient, MODELS } from '@/lib/ai/claude-client'

export interface DomainAnalysis {
  domain_type: 'geo' | 'industry' | 'keyword' | 'brandable'
  city: string | null
  province: string | null
  country: string | null
  country_code: string | null          // ISO 3166-1 alpha-2
  tld: string                          // e.g. ".ca", ".com"
  main_keyword: string                 // core word (e.g. "plomberie")
  language: 'fr' | 'en' | 'es' | 'other'
  industries: string[]                 // 2-4 relevant industries
  ideal_buyers: string[]               // job titles to target
  apollo_searches: Array<{
    keywords: string[]
    location: string
    titles: string[]
  }>
  value_proposition: string            // 1-2 sentence pitch in the domain's language
  pitch_angle: string                  // Why THIS specific company would want this domain
  google_search_query: string          // ready-to-use query for Google Places
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify campaign + load domain info
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, owned_domain:owned_domain_id(domain, word)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const ownedDomain = (campaign as any).owned_domain
  const domainName: string = ownedDomain?.domain ?? ''
  if (!domainName) return NextResponse.json({ error: 'Domain not found' }, { status: 400 })

  // Load Anthropic API key
  const { data: settings } = await supabase
    .from('settings')
    .select('anthropic_api_key')
    .eq('user_id', user.id)
    .single()

  const apiKey = (settings as any)?.anthropic_api_key as string | null
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Clé API Anthropic non configurée. Ajoutez-la dans les Paramètres.' },
      { status: 400 },
    )
  }

  const claude = getAnthropicClient(apiKey)

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
  "industries": [2-4 relevant industries as strings],
  "ideal_buyers": [3-5 job titles, e.g. "CEO", "Owner", "Founder", "Director"],
  "apollo_searches": [
    {
      "keywords": [2-3 keywords],
      "location": "City, Province, Country",
      "titles": ["CEO", "Owner", "Founder"]
    }
  ],
  "value_proposition": "1-2 sentences in the domain's natural language explaining why this domain is valuable",
  "pitch_angle": "1 sentence explaining why a local business in this industry specifically would want this domain",
  "google_search_query": "ready-to-use Google Places search query to find businesses (e.g. 'plombiers Calgary')"
}

Rules:
- For geo-domains (city/region in name): extract the city, province, country from the domain. Use local language names.
- For .ca domains: assume Canada. For .fr: France. For .com with English word: Canada or USA.
- The main_keyword is the core word without city/TLD (e.g. "plomberie-montreal.ca" → "plomberie")
- apollo_searches: 1-3 search queries varying keywords and location specificity
- value_proposition must be in the same language as the domain (French if "plomberie", English if "plumbing")
- google_search_query: use the local language and include city if geo-domain`

  try {
    const message = await claude.messages.create({
      model: MODELS.smart,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('')
      .trim()

    // Extract JSON (handle any accidental markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in Claude response')

    const analysis: DomainAnalysis = JSON.parse(jsonMatch[0])

    // Persist to campaign
    await supabase
      .from('campaigns')
      .update({ domain_analysis: analysis as any, domain_analyzed_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({ analysis })
  } catch (err: any) {
    console.error('Domain analysis error:', err)
    return NextResponse.json({ error: err.message ?? 'Analyse échouée' }, { status: 500 })
  }
}
