import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateEmailMessages } from '@/lib/ai/message-generator'
import { sendViaResend } from '@/lib/email/resend-client'
import { sendViaBrevo } from '@/lib/email/brevo-client'
import { sendViaSmtp } from '@/lib/email/smtp-client'
import { buildFollowUpSchedule } from '@/lib/email/sequence-scheduler'
import { personalizeTemplate } from '@/lib/email/template-personalizer'

// Runs daily at 9am via Vercel Cron
// Protected by CRON_SECRET in middleware
// Handles both step 1 (from Launch) and follow-ups (step 2+)
export async function GET() {
  const supabase = await createServiceClient()
  const now = new Date()
  const nowIso = now.toISOString()

  // Midnight UTC today for daily count
  const todayMidnight = new Date(now)
  todayMidnight.setUTCHours(0, 0, 0, 0)
  const todayMidnightIso = todayMidnight.toISOString()

  // 1 hour ago for hourly count
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()

  // Find all queued emails that are due
  const { data: dueMessages } = await supabase
    .from('outreach_messages')
    .select('*, prospect:prospects(*), email_account:email_accounts(*)')
    .eq('status', 'queued')
    .eq('channel', 'email')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })

  if (!dueMessages || dueMessages.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  // Build per-account rate limit cache (sent today + sent this hour)
  const accountCache: Record<string, { sentToday: number; sentThisHour: number; lastSentAt: string | null; dailyLimit: number; hourlyLimit: number; minDelaySeconds: number }> = {}

  const uniqueAccountIds = [...new Set(dueMessages.map(m => (m as any).email_account?.id).filter(Boolean))]

  for (const accountId of uniqueAccountIds) {
    const account = (dueMessages.find(m => (m as any).email_account?.id === accountId) as any)?.email_account
    if (!account) continue

    // Count actual sends today from DB (source of truth)
    const { count: sentToday } = await supabase
      .from('outreach_messages')
      .select('*', { count: 'exact', head: true })
      .eq('email_account_id', accountId)
      .eq('status', 'sent')
      .gte('sent_at', todayMidnightIso)

    // Count actual sends in last hour
    const { count: sentThisHour } = await supabase
      .from('outreach_messages')
      .select('*', { count: 'exact', head: true })
      .eq('email_account_id', accountId)
      .eq('status', 'sent')
      .gte('sent_at', oneHourAgo)

    accountCache[accountId] = {
      sentToday: sentToday ?? 0,
      sentThisHour: sentThisHour ?? 0,
      lastSentAt: account.last_sent_at ?? null,
      dailyLimit: account.daily_limit ?? 50,
      hourlyLimit: account.hourly_limit ?? 10,
      minDelaySeconds: account.min_delay_seconds ?? 120,
    }
  }

  let processed = 0
  let skipped = 0
  let rateLimited = 0

  for (const message of dueMessages) {
    const prospect = (message as any).prospect
    const account = (message as any).email_account

    // Skip if prospect already replied, sold, or dead
    if (['replied', 'negotiating', 'sold', 'dead'].includes(prospect?.status ?? '')) {
      await supabase.from('outreach_messages').update({ status: 'failed' }).eq('id', message.id)
      skipped++
      continue
    }

    if (!prospect?.email || !account) {
      await supabase.from('outreach_messages').update({ status: 'failed' }).eq('id', message.id)
      skipped++
      continue
    }

    // --- Rate limiting checks ---
    const limits = accountCache[account.id]
    if (!limits) { skipped++; continue }

    // Daily limit check
    if (limits.sentToday >= limits.dailyLimit) {
      rateLimited++
      continue // leave as queued, will be picked up tomorrow
    }

    // Hourly limit check
    if (limits.sentThisHour >= limits.hourlyLimit) {
      rateLimited++
      continue // leave as queued, will be picked up next hour (if on Pro) or tomorrow
    }

    // Min delay check
    if (limits.lastSentAt) {
      const secondsSinceLast = (now.getTime() - new Date(limits.lastSentAt).getTime()) / 1000
      if (secondsSinceLast < limits.minDelaySeconds) {
        rateLimited++
        continue // leave as queued
      }
    }
    // --- End rate limiting ---

    try {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('*, owned_domain:owned_domains(*)')
        .eq('id', message.campaign_id)
        .single()

      const domainForSale = (campaign as any)?.owned_domain?.domain ?? ''
      const askingPrice = campaign?.asking_price ?? null

      let subject: string
      let body: string

      // Check for pre-approved template first
      const { data: seqStep } = await supabase
        .from('follow_up_sequences')
        .select('subject_template, body_template')
        .eq('campaign_id', message.campaign_id)
        .eq('step_number', message.sequence_step)
        .single()

      if (seqStep?.subject_template && seqStep?.body_template) {
        // Use stored template with variable substitution
        const ctx = {
          prospect_domain: prospect.domain,
          company_name: prospect.company_name,
          contact_name: prospect.owner_name,
          my_domain: domainForSale,
          asking_price: askingPrice,
        }
        subject = personalizeTemplate(seqStep.subject_template, ctx)
        body = personalizeTemplate(seqStep.body_template, ctx)
      } else {
        // Fall back to AI generation
        const { data: settings } = await supabase
          .from('settings')
          .select('anthropic_api_key')
          .eq('user_id', message.user_id)
          .single()

        const ctx = {
          domainForSale,
          askingPrice,
          prospectDomain: prospect.domain,
          prospectTld: prospect.tld,
          domainType: prospect.domain_type as 'same_word_diff_tld' | 'contains_word',
          companyName: prospect.company_name,
          websiteDescription: prospect.website_description,
          sequenceStep: message.sequence_step as 1 | 2 | 3,
        }

        const generated = await generateEmailMessages(ctx, settings?.anthropic_api_key ?? undefined)
        const best = generated[0]
        if (!best) throw new Error('No message generated')
        subject = best.subject ?? `Follow-up: ${prospect.domain}`
        body = best.body
      }

      // Send email
      const emailHtml = body.replace(/\n/g, '<br>')
      let externalId: string | null = null

      if (account.provider === 'resend' && account.resend_api_key) {
        externalId = await sendViaResend({
          to: prospect.email, subject, html: emailHtml,
          fromName: account.display_name, fromEmail: account.email_address,
          resendApiKey: account.resend_api_key, messageDbId: message.id,
        })
      } else if (account.provider === 'brevo' && account.brevo_api_key) {
        externalId = await sendViaBrevo({
          to: prospect.email, subject, html: emailHtml,
          fromName: account.display_name, fromEmail: account.email_address,
          brevoApiKey: account.brevo_api_key, messageDbId: message.id,
        })
      } else if (account.provider === 'smtp' && account.smtp_host) {
        externalId = await sendViaSmtp({
          to: prospect.email, subject, html: emailHtml,
          fromName: account.display_name, fromEmail: account.email_address,
          smtpHost: account.smtp_host, smtpPort: account.smtp_port ?? 587,
          smtpUser: account.smtp_user ?? '', smtpPassword: account.smtp_password_encrypted ?? '',
          smtpSecure: account.smtp_secure ?? false,
        })
      }

      const sentAt = new Date().toISOString()

      await supabase
        .from('outreach_messages')
        .update({ status: 'sent', body, subject, sent_at: sentAt, resend_email_id: externalId })
        .eq('id', message.id)

      // Mark prospect as contacted if this was step 1
      if (message.sequence_step === 1) {
        await supabase
          .from('prospects')
          .update({ status: 'contacted' })
          .eq('id', prospect.id)
          .eq('status', 'to_contact')
      }

      // Update account counters in DB
      await supabase
        .from('email_accounts')
        .update({ sent_today: account.sent_today + 1, sent_this_hour: account.sent_this_hour + 1, last_sent_at: sentAt })
        .eq('id', account.id)

      // Update local cache so next iteration respects the new counts
      limits.sentToday++
      limits.sentThisHour++
      limits.lastSentAt = sentAt

      // After sending step 1, schedule follow-ups (step 2, 3)
      if (message.sequence_step === 1) {
        const { data: seqSteps } = await supabase
          .from('follow_up_sequences')
          .select('step_number, delay_days')
          .eq('campaign_id', message.campaign_id)
          .eq('is_active', true)
          .order('step_number')

        const customSequence = seqSteps && seqSteps.length > 0
          ? seqSteps.map(s => ({ step: s.step_number, delayDays: s.delay_days }))
          : undefined

        const followUps = buildFollowUpSchedule(new Date(sentAt), customSequence)
        if (followUps.length > 0) {
          await supabase.from('outreach_messages').insert(
            followUps.map(fu => ({
              prospect_id: prospect.id,
              campaign_id: message.campaign_id,
              user_id: message.user_id,
              channel: 'email',
              sequence_step: fu.step,
              body: '',
              ai_generated: true,
              status: 'queued',
              scheduled_for: fu.scheduledFor.toISOString(),
              email_account_id: account.id,
            }))
          )
        }
      }

      processed++
    } catch (err) {
      await supabase.from('outreach_messages').update({ status: 'failed' }).eq('id', message.id)
      console.error(`Failed to send message ${message.id}:`, err)
    }
  }

  return NextResponse.json({ processed, skipped, rate_limited: rateLimited })
}
