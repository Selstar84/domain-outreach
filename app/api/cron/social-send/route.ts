/**
 * GET /api/cron/social-send
 * Scheduled daily (or multiple times/day) via Vercel Cron.
 * Protected by CRON_SECRET in middleware.
 *
 * For each queued social message (WhatsApp, LinkedIn, Instagram, Facebook):
 *  1. Respects daily limits per channel from settings
 *  2. Generates a personalized message via Claude
 *  3. Sends via the configured integration (Twilio, Phantombuster, Apify, etc.)
 *  4. Updates message status → sent | failed
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateSocialMessages } from '@/lib/ai/message-generator'
import { sendSocialMessage } from '@/lib/integrations/social-sender'
import { getEffectiveDailyLimit } from '@/lib/social/limits'
import type { IntegrationSettings } from '@/lib/integrations/types'
import type { MessageChannel } from '@/types/database'

type SocialChannel = 'whatsapp' | 'linkedin' | 'instagram' | 'facebook'
const SOCIAL_CHANNELS: SocialChannel[] = ['whatsapp', 'linkedin', 'instagram', 'facebook']

// Which prospect field provides the "to" address for each channel
const CHANNEL_TO_FIELD: Record<SocialChannel, string> = {
  whatsapp: 'whatsapp_number',
  linkedin: 'linkedin_url',
  instagram: 'instagram_url',
  facebook: 'facebook_url',
}

export async function GET() {
  const supabase = await createServiceClient()
  const now = new Date()
  const results: Record<string, { sent: number; failed: number; skipped: number }> = {
    whatsapp: { sent: 0, failed: 0, skipped: 0 },
    linkedin: { sent: 0, failed: 0, skipped: 0 },
    instagram: { sent: 0, failed: 0, skipped: 0 },
    facebook: { sent: 0, failed: 0, skipped: 0 },
  }

  // ── Load all users who have queued social messages ───────────────────────────
  const { data: userIds } = await supabase
    .from('outreach_messages')
    .select('user_id')
    .in('channel', SOCIAL_CHANNELS as MessageChannel[])
    .eq('status', 'queued')
    .lte('scheduled_for', now.toISOString())
    .limit(500)

  if (!userIds || userIds.length === 0) {
    return NextResponse.json({ ok: true, message: 'No queued social messages', results })
  }

  const uniqueUserIds = [...new Set(userIds.map(r => r.user_id))]

  for (const userId of uniqueUserIds) {
    // ── Load user settings ─────────────────────────────────────────────────────
    const { data: rawSettings } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!rawSettings) continue

    const s = rawSettings as any
    const settings: IntegrationSettings = {
      prospect_finder_tool: s.prospect_finder_tool ?? null,
      apollo_api_key: s.apollo_api_key ?? null,
      snov_api_key: s.snov_api_key ?? null,
      hunter_api_key: s.hunter_api_key ?? null,
      dropcontact_api_key: s.dropcontact_api_key ?? null,
      linkedin_tool: s.linkedin_tool ?? null,
      phantombuster_api_key: s.phantombuster_api_key ?? null,
      phantombuster_linkedin_agent_id: s.phantombuster_linkedin_agent_id ?? null,
      lemlist_api_key: s.lemlist_api_key ?? null,
      whatsapp_tool: s.whatsapp_tool ?? null,
      twilio_account_sid: s.twilio_account_sid ?? null,
      twilio_auth_token: s.twilio_auth_token ?? null,
      twilio_whatsapp_number: s.twilio_whatsapp_number ?? null,
      apify_api_key: s.apify_api_key ?? null,
      instagram_session_cookie: s.instagram_session_cookie ?? null,
      facebook_session_cookie: s.facebook_session_cookie ?? null,
    }

    const anthropicApiKey: string | null = s.anthropic_api_key ?? null
    if (!anthropicApiKey) continue // can't generate messages without Claude

    const dailyLimit = getEffectiveDailyLimit({
      social_daily_limit: s.social_daily_limit ?? 15,
      social_warmup_enabled: s.social_warmup_enabled ?? false,
      social_warmup_start_date: s.social_warmup_start_date ?? null,
      social_warmup_start_count: s.social_warmup_start_count ?? 5,
      social_warmup_increment: s.social_warmup_increment ?? 2,
    })

    // ── Process each channel separately ───────────────────────────────────────
    for (const channel of SOCIAL_CHANNELS) {
      // Count already-sent messages today for this channel
      const todayStart = new Date()
      todayStart.setUTCHours(0, 0, 0, 0)

      const { count: sentToday } = await supabase
        .from('outreach_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('channel', channel)
        .eq('status', 'sent')
        .gte('sent_at', todayStart.toISOString())

      const remainingSlots = dailyLimit - (sentToday ?? 0)
      if (remainingSlots <= 0) {
        results[channel].skipped += 0 // will be counted below
        continue
      }

      // Fetch queued messages for this user + channel
      const { data: messages } = await supabase
        .from('outreach_messages')
        .select(`
          id,
          prospect_id,
          campaign_id,
          sequence_step,
          prospect:prospect_id (
            domain,
            tld,
            domain_type,
            company_name,
            owner_name,
            website_description,
            whatsapp_number,
            linkedin_url,
            instagram_url,
            facebook_url
          ),
          campaign:campaign_id (
            asking_price,
            owned_domain:owned_domain_id (
              domain
            )
          )
        `)
        .eq('user_id', userId)
        .eq('channel', channel)
        .eq('status', 'queued')
        .lte('scheduled_for', now.toISOString())
        .order('created_at', { ascending: true })
        .limit(remainingSlots)

      if (!messages || messages.length === 0) continue

      for (const msg of messages) {
        const prospect = (msg as any).prospect
        const campaign = (msg as any).campaign
        if (!prospect || !campaign) continue

        const toAddress: string | null = prospect[CHANNEL_TO_FIELD[channel]] ?? null
        if (!toAddress) {
          // Mark as failed — no contact info
          await supabase
            .from('outreach_messages')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', msg.id)
          results[channel].failed++
          continue
        }

        const ownedDomain = campaign?.owned_domain?.domain ?? ''

        // ── Mark as sending ──────────────────────────────────────────────────
        await supabase
          .from('outreach_messages')
          .update({ status: 'sending', updated_at: new Date().toISOString() })
          .eq('id', msg.id)

        try {
          // ── Generate personalized message ──────────────────────────────────
          const generated = await generateSocialMessages(
            {
              domainForSale: ownedDomain,
              askingPrice: campaign.asking_price,
              prospectDomain: prospect.domain,
              prospectTld: prospect.tld,
              domainType: prospect.domain_type ?? 'other',
              companyName: prospect.company_name,
              websiteDescription: prospect.website_description,
              prospectFirstName: extractFirstName(prospect.owner_name),
              sequenceStep: (msg.sequence_step ?? 1) as 1 | 2 | 3,
            },
            channel,
            anthropicApiKey,
          )

          const messageBody = generated[0]?.body ?? ''
          if (!messageBody) throw new Error('Empty message generated')

          // ── Send via integration ───────────────────────────────────────────
          const sendResult = await sendSocialMessage(channel, {
            to: toAddress,
            message: messageBody,
            prospect_name: prospect.owner_name ?? undefined,
          }, settings)

          if (sendResult.success) {
            await supabase
              .from('outreach_messages')
              .update({
                status: 'sent',
                body: messageBody,
                sent_at: new Date().toISOString(),
                social_platform_used: channel,
                updated_at: new Date().toISOString(),
              })
              .eq('id', msg.id)
            results[channel].sent++
          } else {
            await supabase
              .from('outreach_messages')
              .update({
                status: 'failed',
                body: messageBody,
                updated_at: new Date().toISOString(),
              })
              .eq('id', msg.id)
            console.error(`[social-send] ${channel} failed for prospect ${msg.prospect_id}:`, sendResult.error)
            results[channel].failed++
          }
        } catch (err: any) {
          await supabase
            .from('outreach_messages')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', msg.id)
          console.error(`[social-send] Error processing ${channel} message ${msg.id}:`, err.message)
          results[channel].failed++
        }

        // Small delay between sends to be human-like
        await delay(2000 + Math.random() * 3000)
      }
    }
  }

  const totalSent = Object.values(results).reduce((s, r) => s + r.sent, 0)
  const totalFailed = Object.values(results).reduce((s, r) => s + r.failed, 0)

  return NextResponse.json({
    ok: true,
    total_sent: totalSent,
    total_failed: totalFailed,
    by_channel: results,
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractFirstName(fullName: string | null): string | null {
  if (!fullName) return null
  return fullName.trim().split(/\s+/)[0] ?? null
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
