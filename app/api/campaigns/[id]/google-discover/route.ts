import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { searchGooglePlaces, type GooglePlace } from '@/lib/google-places'

function toDomainSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63)
}

function extractDomain(website: string | null, name: string, placeId: string): string {
  if (website) {
    try {
      return new URL(website).hostname.replace(/^www\./, '')
    } catch {
      return website
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .split('/')[0]
        .split('?')[0]
    }
  }
  const slug = toDomainSlug(name)
  return slug ? `${slug}.no-site` : `place-${placeId.slice(-8)}.no-site`
}

function extractTld(domain: string): string {
  const dot = domain.indexOf('.')
  return dot !== -1 ? domain.slice(dot) : '.no-site'
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

  // Get Google Places API key from settings
  const { data: settings } = await supabase
    .from('settings')
    .select('google_places_api_key')
    .eq('user_id', user.id)
    .single()

  const apiKey = (settings as any)?.google_places_api_key as string | null
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Clé API Google Places non configurée. Ajoutez-la dans les Paramètres.' },
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
    const { keywords, location, max_results = 20 } = body
    if (!keywords) return NextResponse.json({ error: 'keywords requis' }, { status: 400 })

    const query = location ? `${keywords} ${location}` : keywords

    try {
      const places = await searchGooglePlaces(query, apiKey, Math.min(Number(max_results), 60))
      return NextResponse.json({ places })
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  // ── IMPORT ──────────────────────────────────────────────────────────────
  if (action === 'import') {
    const { places } = body as { places: GooglePlace[] }
    if (!places || places.length === 0) {
      return NextResponse.json({ error: 'Aucun lieu à importer' }, { status: 400 })
    }

    const inserts = places.map((p) => {
      const domain = extractDomain(p.website, p.name, p.place_id)
      return {
        campaign_id: id,
        user_id: user.id,
        domain,
        tld: extractTld(domain),
        domain_type: 'other' as const,
        company_name: p.name,
        phone: p.phone ?? null,
        website_active: !!p.website,
        scrape_status: p.website ? 'pending' : 'skipped',
      }
    })

    const { data: inserted, error } = await supabase
      .from('prospects')
      .upsert(inserts, { onConflict: 'campaign_id,domain', ignoreDuplicates: true })
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Refresh total_prospects count on campaign
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
