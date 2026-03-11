import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateVariants } from '@/lib/discovery/domain-variants'
import { checkDomainsActive } from '@/lib/discovery/http-checker'

// Runs daily at 10am via Vercel Cron
// Protected by CRON_SECRET in middleware
// Processes pending discovery jobs (created but not yet running)
export async function GET() {
  const supabase = await createServiceClient()

  // Find pending discovery jobs
  const { data: pendingJobs } = await supabase
    .from('discovery_jobs')
    .select('*, campaign:campaigns(*, owned_domain:owned_domains(*))')
    .eq('status', 'pending')
    .limit(3) // Process max 3 campaigns per run

  if (!pendingJobs || pendingJobs.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let processed = 0

  for (const job of pendingJobs) {
    const campaign = (job as any).campaign
    if (!campaign?.owned_domain) continue

    const word = campaign.owned_domain.word
    const sourceDomain = campaign.owned_domain.domain
    const variants = generateVariants(word, sourceDomain)
    const domainList = variants.map((v: { domain: string }) => v.domain)

    // Mark job as running
    await supabase
      .from('discovery_jobs')
      .update({ status: 'running', total_variants: domainList.length, started_at: new Date().toISOString() })
      .eq('id', job.id)

    await supabase
      .from('campaigns')
      .update({ discovery_status: 'running', discovery_started_at: new Date().toISOString() })
      .eq('id', campaign.id)

    try {
      const BATCH_SIZE = 20
      let checkedCount = 0
      let activeCount = 0

      for (let i = 0; i < domainList.length; i += BATCH_SIZE) {
        const batch = domainList.slice(i, i + BATCH_SIZE)
        const results = await checkDomainsActive(batch, 15, 5000)
        const activeResults = results.filter((r: { active: boolean }) => r.active)
        activeCount += activeResults.length
        checkedCount += batch.length

        if (activeResults.length > 0) {
          const prospectInserts = activeResults.map((r: { domain: string; status: number | null; active: boolean }) => {
            const variant = variants.find((v: { domain: string }) => v.domain === r.domain)
            return {
              campaign_id: campaign.id,
              user_id: campaign.user_id,
              domain: r.domain,
              tld: '.' + r.domain.split('.').slice(1).join('.'),
              domain_type: (variant as any)?.type ?? 'other',
              website_active: true,
              http_status: r.status,
            }
          })
          await supabase
            .from('prospects')
            .upsert(prospectInserts, { onConflict: 'campaign_id,domain', ignoreDuplicates: true })
        }

        await supabase
          .from('discovery_jobs')
          .update({ checked_count: checkedCount, active_count: activeCount })
          .eq('id', job.id)
      }

      await supabase
        .from('discovery_jobs')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', job.id)

      await supabase
        .from('campaigns')
        .update({ discovery_status: 'completed', discovery_completed_at: new Date().toISOString(), total_prospects: activeCount })
        .eq('id', campaign.id)

      processed++
    } catch (err) {
      await supabase.from('discovery_jobs').update({ status: 'failed', error_message: String(err) }).eq('id', job.id)
      await supabase.from('campaigns').update({ discovery_status: 'failed' }).eq('id', campaign.id)
      console.error(`Discovery job ${job.id} failed:`, err)
    }
  }

  return NextResponse.json({ processed })
}
