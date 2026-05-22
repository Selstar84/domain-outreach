/**
 * POST /api/campaigns/[id]/appraise
 * Runs 3 parallel agents for domain appraisal:
 *  1. NameBio — comparable past sales
 *  2. Google Trends — keyword interest over 12 months
 *  3. Claude Brandability — score breakdown + value estimate
 *
 * Results saved to campaigns.domain_appraisal (JSONB)
 */
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { searchNameBio } from '@/lib/appraisal/namebio'
import { getKeywordTrends } from '@/lib/appraisal/google-trends'
import { scoreBrandability } from '@/lib/appraisal/brandability'
import type { NameBioResult } from '@/lib/appraisal/namebio'
import type { TrendsResult } from '@/lib/appraisal/google-trends'
import type { BrandabilityScore } from '@/lib/appraisal/brandability'

export interface DomainAppraisal {
  domain: string
  keyword: string
  appraised_at: string
  namebio: NameBioResult
  trends: TrendsResult
  brandability: BrandabilityScore
}

// Strip TLD and city from domain to get the core keyword
function extractKeyword(domain: string): string {
  return domain
    .replace(/\.[a-z]{2,}(\.[a-z]{2})?$/i, '') // strip TLD
    .split(/[-_]/)
    .join(' ')
    .trim()
}

// Get ISO country code from domain analysis for trends
function getGeoCode(analysis: any): string {
  const cc = analysis?.country_code
  if (!cc) return ''
  // Google Trends uses ISO 3166-1 alpha-2
  return cc.toUpperCase()
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load campaign + owned domain + existing analysis
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, domain_analysis, owned_domain:owned_domain_id(domain, word)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const ownedDomain = (campaign as any).owned_domain
  const domainName: string = ownedDomain?.domain ?? ''
  if (!domainName) return NextResponse.json({ error: 'Domain not found' }, { status: 400 })

  // Load API key
  const { data: settings } = await supabase
    .from('settings')
    .select('anthropic_api_key')
    .eq('user_id', user.id)
    .single()

  const anthropicKey = (settings as any)?.anthropic_api_key as string | null
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'Clé API Anthropic non configurée. Ajoutez-la dans les Paramètres.' },
      { status: 400 },
    )
  }

  const analysis = (campaign as any).domain_analysis
  const keyword = (ownedDomain?.word ?? extractKeyword(domainName)).split(' ')[0]
  const geo = getGeoCode(analysis)

  // ── Run 3 agents in parallel ─────────────────────────────────────────────
  const [namebioResult, trendsResult] = await Promise.allSettled([
    searchNameBio(keyword, { maxResults: 15, maxAgeDays: 1095, minPrice: 100 }),
    getKeywordTrends(keyword, geo),
  ])

  const namebio: NameBioResult = namebioResult.status === 'fulfilled'
    ? namebioResult.value
    : { sales: [], total_found: 0, min_price: null, max_price: null, median_price: null, avg_price: null }

  const trends: TrendsResult = trendsResult.status === 'fulfilled'
    ? trendsResult.value
    : { keyword, geo, points: [], current_interest: 0, avg_interest: 0, direction: 'unknown', direction_pct: 0 }

  // Brandability uses NameBio avg to calibrate value estimate
  const brandability = await scoreBrandability(domainName, anthropicKey, namebio.avg_price)

  const appraisal: DomainAppraisal = {
    domain: domainName,
    keyword,
    appraised_at: new Date().toISOString(),
    namebio,
    trends,
    brandability,
  }

  // Persist to campaign
  await supabase
    .from('campaigns')
    .update({ domain_appraisal: appraisal as any })
    .eq('id', id)

  return NextResponse.json({ appraisal })
}
