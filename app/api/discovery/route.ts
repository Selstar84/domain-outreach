import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateVariants } from '@/lib/discovery/domain-variants'
import { checkDomainsActive } from '@/lib/discovery/http-checker'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { campaign_id } = await request.json()
  if (!campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })

  // Get campaign + owned domain
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*, owned_domain:owned_domains(*)')
    .eq('id', campaign_id)
    .eq('user_id', user.id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const word = campaign.owned_domain.word
  const sourceDomain = campaign.owned_domain.domain

  // Generate variants
  const variants = generateVariants(word, sourceDomain)
  const domainList = variants.map((v) => v.domain)

  // Create discovery job
  const { data: job } = await supabase
    .from('discovery_jobs')
    .insert({
      campaign_id,
      user_id: user.id,
      status: 'running',
      total_variants: domainList.length,
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  // Update campaign status
  await supabase
    .from('campaigns')
    .update({ discovery_status: 'running', discovery_started_at: new Date().toISOString() })
    .eq('id', campaign_id)

  // Run HTTP checks in batches (async, but we return quickly after first batch starts)
  // For Vercel, we process all in this request (up to 300s timeout on Pro)
  // For large batches, use Vercel Cron or background job
  const BATCH_SIZE = 20
  let checkedCount = 0
  let activeCount = 0

  for (let i = 0; i < domainList.length; i += BATCH_SIZE) {
    const batch = domainList.slice(i, i + BATCH_SIZE)
    const results = await checkDomainsActive(batch, 15, 5000)

    const activeResults = results.filter((r) => r.active)
    activeCount += activeResults.length
    checkedCount += batch.length

    // Insert active domains as prospects
    if (activeResults.length > 0) {
      const prospectInserts = activeResults.map((r) => {
        const variant = variants.find((v) => v.domain === r.domain)
        return {
          campaign_id,
          user_id: user.id,
          domain: r.domain,
          tld: '.' + r.domain.split('.').slice(1).join('.'),
          domain_type: variant?.type ?? 'other',
          website_active: true,
          http_status: r.status,
        }
      })

      await supabase
        .from('prospects')
        .upsert(prospectInserts, { onConflict: 'campaign_id,domain', ignoreDuplicates: true })
    }

    // Update job progress
    await supabase
      .from('discovery_jobs')
      .update({ checked_count: checkedCount, active_count: activeCount })
      .eq('id', job.id)
  }

  // Finalize
  await supabase
    .from('discovery_jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', job.id)

  await supabase
    .from('campaigns')
    .update({
      discovery_status: 'completed',
      discovery_completed_at: new Date().toISOString(),
      total_prospects: activeCount,
    })
    .eq('id', campaign_id)

  return NextResponse.json({ job_id: job.id, total: domainList.length, active: activeCount })
}
