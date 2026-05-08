import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { searchApolloProspects, type ApolloProspect } from '@/lib/apollo'

function extractDomain(website: string | null, name: string | null, id: string): string {
  if (website) {
    try {
      return new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '')
    } catch {
      return website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].split('?')[0]
    }
  }
  // Fallback slug from company name
  const slug = (name ?? id)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63)
  return `${slug || id.slice(-8)}.no-site`
}

function extractTld(domain: string): string {
  const dot = domain.indexOf('.')
  return dot !== -1 ? domain.slice(dot) : '.no-site'
}

function mapEmailConfidence(status: string | null): number | null {
  const map: Record<string, number> = {
    verified: 100,
    likely_to_engage: 75,
    catchall: 50,
    unverified: 30,
  }
  return status ? (map[status] ?? null) : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action } = body

  // Get Apollo API key from settings
  const { data: settings } = await supabase
    .from('settings')
    .select('apollo_api_key')
    .eq('user_id', user.id)
    .single()

  const apiKey = (settings as any)?.apollo_api_key as string | null
  if (!apiKey) {
    return NextResponse.json(
      { error: "Clé API Apollo.io non configurée. Ajoutez-la dans les Paramètres." },
      { status: 400 },
    )
  }

  // Verify campaign ownership
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  // ── SEARCH ──────────────────────────────────────────────────────────────
  if (action === 'search') {
    const { keywords, location, titles, max_results = 25 } = body
    if (!keywords || keywords.length === 0) {
      return NextResponse.json({ error: 'keywords requis' }, { status: 400 })
    }

    try {
      const prospects = await searchApolloProspects(
        {
          keywords: Array.isArray(keywords) ? keywords : [keywords],
          location: location ?? '',
          titles: Array.isArray(titles) ? titles : undefined,
          maxResults: Math.min(Number(max_results), 100),
        },
        apiKey,
      )
      return NextResponse.json({ prospects })
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  // ── IMPORT ──────────────────────────────────────────────────────────────
  if (action === 'import') {
    const { prospects } = body as { prospects: ApolloProspect[] }
    if (!prospects || prospects.length === 0) {
      return NextResponse.json({ error: 'Aucun prospect à importer' }, { status: 400 })
    }

    const inserts = prospects.map((p) => {
      const domain = extractDomain(p.company_website, p.company_name, p.id)
      return {
        campaign_id: id,
        user_id: user.id,
        domain,
        tld: extractTld(domain),
        domain_type: 'other' as const,
        company_name: p.company_name ?? null,
        owner_name: p.name || null,
        email: p.email ?? null,
        email_source: p.email ? 'hunter' : null, // closest type = verified API source
        email_confidence: mapEmailConfidence(p.email_status),
        linkedin_url: p.linkedin_url ?? null,
        phone: p.phone ?? null,
        website_active: !!p.company_website,
        scrape_status: p.company_website ? 'pending' : 'skipped',
      }
    })

    const { data: inserted, error } = await supabase
      .from('prospects')
      .upsert(inserts, { onConflict: 'campaign_id,domain', ignoreDuplicates: true })
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Refresh total_prospects
    const { count } = await supabase
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', id)
      .neq('status', 'dead')

    await supabase
      .from('campaigns')
      .update({ total_prospects: count ?? 0 })
      .eq('id', id)

    return NextResponse.json({ imported: inserted?.length ?? 0 })
  }

  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
}
