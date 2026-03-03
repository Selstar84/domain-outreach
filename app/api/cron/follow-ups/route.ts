import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateEmailMessages } from '@/lib/ai/message-generator'
import { sendViaResend } from '@/lib/email/resend-client'
import { sendViaBrevo } from '@/lib/email/brevo-client'
import { sendViaSmtp } from '@/lib/email/smtp-client'

// Runs daily at 9am via Vercel Cron
// Protected by CRON_SECRET in middleware
export async function GET() {
  const supabase = await createServiceClient()
  const now = new Date().toISOString()

  // Find all queued follow-up emails that are due
  const { data: dueMessages } = await supabase
    .from('outreach_messages')
    .select('*, prospect:prospects(*), email_account:email_accounts(*)')
    .eq('status', 'queued')
    .eq('channel', 'email')
    .lte('scheduled_for', now)
    .limit(50)

  if (!dueMessages || dueMessages.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let processed = 0
  let skipped = 0

  for (const message of dueMessages) {
    const prospect = (message as any).prospect
    const account = (message as any).email_account

    // Skip if prospect already replied, sold, or dead
    if (['replied', 'negotiating', 'sold', 'dead'].includes(prospect?.status ?? '')) {
      await supabase
        .from('outreach_messages')
        .update({ status: 'failed' })
        .eq('id', message.id)
      skipped++
      continue
    }

    if (!prospect?.email || !account) {
      await supabase
        .from('outreach_messages')
        .update({ status: 'failed' })
        .eq('id', message.id)
      skipped++
      continue
    }

    try {
      // Get settings for API key
      const { data: settings } = await supabase
        .from('settings')
        .select('anthropic_api_key')
        .eq('user_id', message.user_id)
        .single()

      // Generate follow-up message
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('*, owned_domain:owned_domains(*)')
        .eq('id', message.campaign_id)
        .single()

      const ctx = {
        domainForSale: (campaign as any)?.owned_domain?.domain ?? '',
        askingPrice: (campaign as any)?.asking_price ?? null,
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

      // Send email
      const emailHtml = best.body.replace(/\n/g, '<br>')

      let externalId: string | null = null
      if (account.provider === 'resend' && account.resend_api_key) {
        externalId = await sendViaResend({
          to: prospect.email,
          subject: best.subject ?? `Follow-up: ${prospect.domain}`,
          html: emailHtml,
          fromName: account.display_name,
          fromEmail: account.email_address,
          resendApiKey: account.resend_api_key,
          messageDbId: message.id,
        })
      } else if (account.provider === 'brevo' && account.brevo_api_key) {
        externalId = await sendViaBrevo({
          to: prospect.email,
          subject: best.subject ?? `Follow-up: ${prospect.domain}`,
          html: emailHtml,
          fromName: account.display_name,
          fromEmail: account.email_address,
          brevoApiKey: account.brevo_api_key,
          messageDbId: message.id,
        })
      } else if (account.provider === 'smtp' && account.smtp_host) {
        externalId = await sendViaSmtp({
          to: prospect.email,
          subject: best.subject ?? `Follow-up: ${prospect.domain}`,
          html: emailHtml,
          fromName: account.display_name,
          fromEmail: account.email_address,
          smtpHost: account.smtp_host,
          smtpPort: account.smtp_port ?? 587,
          smtpUser: account.smtp_user ?? '',
          smtpPassword: account.smtp_password_encrypted ?? '',
          smtpSecure: account.smtp_secure ?? false,
        })
      }

      const sentAt = new Date().toISOString()
      await supabase
        .from('outreach_messages')
        .update({
          status: 'sent',
          body: best.body,
          subject: best.subject,
          sent_at: sentAt,
          resend_email_id: externalId,
        })
        .eq('id', message.id)

      // Update account counters
      await supabase
        .from('email_accounts')
        .update({
          sent_today: account.sent_today + 1,
          sent_this_hour: account.sent_this_hour + 1,
          last_sent_at: sentAt,
        })
        .eq('id', account.id)

      processed++
    } catch (err) {
      await supabase
        .from('outreach_messages')
        .update({ status: 'failed' })
        .eq('id', message.id)
      console.error(`Failed to send follow-up ${message.id}:`, err)
    }
  }

  return NextResponse.json({ processed, skipped })
}
