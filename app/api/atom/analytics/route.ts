/**
 * GET /api/atom/analytics?domain=xxx.com
 * Returns Atom.com analytics for a specific domain.
 * Also returns Atom sales history from /all-sales for context.
 */
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { atomGet } from '@/lib/atom/client'
import type { AtomAnalyticsResponse, AtomSalesResponse } from '@/lib/atom/client'

export interface AtomDomainAnalytics {
  domain: string
  views: number | null
  clicks: number | null
  leads: number | null
  offers: number | null
  last_viewed: string | null
  // From /all-sales (seller's own sales history)
  total_sales: number
  sales: Array<{
    domain: string
    price: number | null
    date: string | null
  }>
  fetched_at: string
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain')
  if (!domain) return NextResponse.json({ error: 'domain param required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: settings } = await supabase
    .from('settings')
    .select('atom_api_key')
    .eq('user_id', user.id)
    .single()

  const atomKey = (settings as any)?.atom_api_key as string | null
  if (!atomKey) {
    return NextResponse.json({ error: 'Clé API Atom.com non configurée' }, { status: 400 })
  }

  // Run analytics + sales in parallel
  const [analyticsResult, salesResult] = await Promise.allSettled([
    atomGet<AtomAnalyticsResponse>('/domain-analytics', atomKey, { domain }),
    atomGet<AtomSalesResponse>('/all-sales', atomKey),
  ])

  // ── Parse analytics ────────────────────────────────────────────────────────
  let views: number | null = null
  let clicks: number | null = null
  let leads: number | null = null
  let offers: number | null = null
  let last_viewed: string | null = null

  if (analyticsResult.status === 'fulfilled') {
    const raw = analyticsResult.value
    const a = raw.analytics ?? raw.data ?? raw
    views = typeof (a as any).views === 'number' ? (a as any).views
          : typeof (a as any).total_views === 'number' ? (a as any).total_views
          : typeof raw.views === 'number' ? raw.views
          : null
    clicks = typeof (a as any).clicks === 'number' ? (a as any).clicks : null
    leads  = typeof (a as any).leads === 'number' ? (a as any).leads : null
    offers = typeof (a as any).offers === 'number' ? (a as any).offers : null
    last_viewed = (a as any).last_viewed ?? null
  }

  // ── Parse sales history (filter to this domain's keyword or all) ──────────
  const allSales: AtomDomainAnalytics['sales'] = []
  if (salesResult.status === 'fulfilled') {
    const raw = salesResult.value
    const salesArr = raw.sales ?? raw.data ?? []
    for (const s of salesArr) {
      const price = typeof s.price === 'number' ? s.price
                  : typeof s.sale_price === 'number' ? s.sale_price
                  : typeof s.sold_price === 'number' ? s.sold_price
                  : typeof s.price === 'string' ? parseFloat(s.price) || null
                  : null
      allSales.push({
        domain: s.domain,
        price: price !== null ? Math.round(price as number) : null,
        date: s.date ?? s.sold_at ?? null,
      })
    }
  }

  // Store analytics back onto owned_domain if it exists
  await supabase
    .from('owned_domains')
    .update({ atom_views: views, atom_synced_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('domain', domain)

  const result: AtomDomainAnalytics = {
    domain,
    views,
    clicks,
    leads,
    offers,
    last_viewed,
    total_sales: allSales.length,
    sales: allSales.slice(0, 20),
    fetched_at: new Date().toISOString(),
  }

  return NextResponse.json(result)
}
