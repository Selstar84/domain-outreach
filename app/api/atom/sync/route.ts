/**
 * POST /api/atom/sync
 * Imports all domains listed on Atom.com into owned_domains.
 * Uses Atom Seller API: GET /domains
 * Also fetches analytics and grade for each domain.
 *
 * Returns: { imported, updated, skipped, errors }
 */
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { atomGet } from '@/lib/atom/client'
import type { AtomDomainsResponse, AtomDomain, AtomAnalyticsResponse, AtomGradeResponse } from '@/lib/atom/client'

function extractWord(domain: string): string {
  return domain.replace(/\.[a-z]{2,}(\.[a-z]{2})?$/i, '').split(/[-_]/)[0].toLowerCase()
}

function parsePrice(val: unknown): number | null {
  if (typeof val === 'number' && val > 0) return Math.round(val)
  if (typeof val === 'string') {
    const n = parseFloat(val.replace(/[^0-9.]/g, ''))
    if (!isNaN(n) && n > 0) return Math.round(n)
  }
  return null
}

export async function POST(_req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load Atom API key
  const { data: settings } = await supabase
    .from('settings')
    .select('atom_api_key')
    .eq('user_id', user.id)
    .single()

  const atomKey = (settings as any)?.atom_api_key as string | null
  if (!atomKey) {
    return NextResponse.json(
      { error: 'Clé API Atom.com non configurée. Ajoutez-la dans les Paramètres.' },
      { status: 400 },
    )
  }

  // ── 1. Fetch all domains from Atom ─────────────────────────────────────────
  let atomDomains: AtomDomain[] = []
  try {
    const raw = await atomGet<AtomDomainsResponse>('/domains', atomKey, { type: 'all' })
    atomDomains = raw.domains ?? raw.data ?? []
  } catch (err: any) {
    return NextResponse.json({ error: `Atom API erreur: ${err.message}` }, { status: 502 })
  }

  if (!Array.isArray(atomDomains) || atomDomains.length === 0) {
    return NextResponse.json({ imported: 0, updated: 0, skipped: 0, errors: 0, message: 'Aucun domaine trouvé sur Atom.com' })
  }

  // ── 2. Fetch analytics for all domains in one call (best-effort) ───────────
  // Atom analytics API may accept domain list or individual calls
  // We'll try to get analytics per domain (fire-and-forget, tolerate failures)
  const analyticsMap = new Map<string, { views: number | null }>()
  await Promise.allSettled(
    atomDomains.slice(0, 50).map(async (d) => {
      try {
        const raw = await atomGet<AtomAnalyticsResponse>('/domain-analytics', atomKey, { domain: d.domain }, 5000)
        const analytics = raw.analytics ?? raw.data ?? raw
        const views =
          typeof (analytics as any).views === 'number' ? (analytics as any).views
          : typeof (analytics as any).total_views === 'number' ? (analytics as any).total_views
          : typeof raw.views === 'number' ? raw.views
          : null
        analyticsMap.set(d.domain, { views })
      } catch {
        // ignore per-domain analytics failures
      }
    })
  )

  // ── 3. Load existing domains to detect updates vs inserts ─────────────────
  const { data: existing } = await supabase
    .from('owned_domains')
    .select('id, domain')
    .eq('user_id', user.id)

  const existingMap = new Map<string, string>((existing ?? []).map(e => [e.domain, e.id]))

  // ── 4. Upsert each domain ──────────────────────────────────────────────────
  let imported = 0, updated = 0, skipped = 0, errors = 0

  for (const ad of atomDomains) {
    if (!ad.domain) { skipped++; continue }

    const domainName = ad.domain.toLowerCase().trim()
    const word = extractWord(domainName)
    const askingPrice = parsePrice(ad.price ?? ad.asking_price)
    const listingId = String(ad.listing_id ?? ad.id ?? '')
    const analytics = analyticsMap.get(domainName)

    const payload = {
      user_id: user.id,
      domain: domainName,
      word,
      asking_price: askingPrice,
      status: 'active' as const,
      notes: ad.description ?? null,
      atom_listing_id: listingId || null,
      atom_views: analytics?.views ?? (typeof ad.views === 'number' ? ad.views : null),
      atom_synced_at: new Date().toISOString(),
    }

    if (existingMap.has(domainName)) {
      // Update existing
      const { error } = await supabase
        .from('owned_domains')
        .update({
          asking_price: payload.asking_price,
          atom_listing_id: payload.atom_listing_id,
          atom_views: payload.atom_views,
          atom_synced_at: payload.atom_synced_at,
        })
        .eq('id', existingMap.get(domainName)!)

      if (error) { errors++; continue }
      updated++
    } else {
      // Insert new
      const { error } = await supabase.from('owned_domains').insert(payload)
      if (error) { errors++; continue }
      imported++
    }
  }

  return NextResponse.json({
    imported,
    updated,
    skipped,
    errors,
    total: atomDomains.length,
    message: `${imported} importé(s), ${updated} mis à jour, ${errors} erreur(s)`,
  })
}
