import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendViaResend } from '@/lib/email/resend-client'
import { sendViaBrevo } from '@/lib/email/brevo-client'
import { sendViaSmtp } from '@/lib/email/smtp-client'
import { buildFollowUpSchedule } from '@/lib/email/sequence-scheduler'
import { z } from 'zod'

const SendSchema = z.object({
  message_id: z.string().uuid(),
  email_account_id: z.string().uuid(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = SendSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { message_id, email_account_id } = parsed.data

  // Fetch message + prospect + account
  const [{ data: message }, { data: account }] = await Promise.all([
    supabase
      .from('outreach_messages')
      .select('*, prospect:prospects(*)')
      .eq('id', message_id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('email_accounts')
      .select('*')
      .eq('id', email_account_id)
      .eq('user_id', user.id)
      .single(),
  ])

  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  if (!account) return NextResponse.json({ error: 'Email account not found' }, { status: 404 })

  const prospect = (message as any).prospect
  if (!prospect?.email) return NextResponse.json({ error: 'Prospect has no email address' }, { status: 400 })

  // Mark as sending
  await supabase
    .from('outreach_messages')
    .update({ status: 'sending', email_account_id })
    .eq('id', message_id)

  try {
    let externalId: string | null = null

    const signatureHtml = account.signature
      ? `<br><br>--<br>${account.signature.replace(/\n/g, '<br>')}`
      : ''
    const emailHtml = message.body.replace(/\n/g, '<br>') + signatureHtml

    if (account.provider === 'resend' && account.resend_api_key) {
      externalId = await sendViaResend({
        to: prospect.email,
        subject: message.subject ?? `${prospect.domain} - Domain Inquiry`,
        html: emailHtml,
        fromName: account.display_name,
        fromEmail: account.email_address,
        resendApiKey: account.resend_api_key,
        messageDbId: message_id,
      })
    } else if (account.provider === 'brevo' && account.brevo_api_key) {
      externalId = await sendViaBrevo({
        to: prospect.email,
        subject: message.subject ?? `${prospect.domain} - Domain Inquiry`,
        html: emailHtml,
        fromName: account.display_name,
        fromEmail: account.email_address,
        brevoApiKey: account.brevo_api_key,
        messageDbId: message_id,
      })
    } else if (account.provider === 'smtp' && account.smtp_host) {
      externalId = await sendViaSmtp({
        to: prospect.email,
        subject: message.subject ?? `${prospect.domain} - Domain Inquiry`,
        html: emailHtml,
        fromName: account.display_name,
        fromEmail: account.email_address,
        smtpHost: account.smtp_host,
        smtpPort: account.smtp_port ?? 587,
        smtpUser: account.smtp_user ?? '',
        smtpPassword: account.smtp_password_encrypted ?? '',
        smtpSecure: account.smtp_secure ?? false,
      })
    } else {
      return NextResponse.json({ error: 'Email account not properly configured' }, { status: 400 })
    }

    const sentAt = new Date().toISOString()

    // Update message status
    await supabase
      .from('outreach_messages')
      .update({
        status: 'sent',
        sent_at: sentAt,
        resend_email_id: externalId,
        email_account_id,
      })
      .eq('id', message_id)

    // Update prospect status to contacted
    await supabase
      .from('prospects')
      .update({ status: 'contacted' })
      .eq('id', prospect.id)
      .eq('status', 'to_contact')

    // Update account counters
    await supabase
      .from('email_accounts')
      .update({
        sent_today: account.sent_today + 1,
        sent_this_hour: account.sent_this_hour + 1,
        last_sent_at: sentAt,
      })
      .eq('id', email_account_id)

    // Schedule follow-ups if this is step 1
    if (message.sequence_step === 1) {
      // Load campaign sequence config (if configured, else use defaults)
      let customSequence: { step: number; delayDays: number }[] | undefined
      if (message.campaign_id) {
        const { data: seqSteps } = await supabase
          .from('follow_up_sequences')
          .select('step_number, delay_days')
          .eq('campaign_id', message.campaign_id)
          .eq('is_active', true)
          .order('step_number')
        if (seqSteps && seqSteps.length > 0) {
          customSequence = seqSteps.map(s => ({ step: s.step_number, delayDays: s.delay_days }))
        }
      }
      const followUps = buildFollowUpSchedule(new Date(sentAt), customSequence)
      const followUpInserts = followUps.map((fu) => ({
        prospect_id: prospect.id,
        campaign_id: message.campaign_id,
        user_id: user.id,
        channel: 'email',
        sequence_step: fu.step,
        body: '', // Will be generated by cron job
        ai_generated: true,
        status: 'queued',
        scheduled_for: fu.scheduledFor.toISOString(),
        email_account_id,
      }))
      await supabase.from('outreach_messages').insert(followUpInserts)
    }

    return NextResponse.json({ success: true, external_id: externalId })
  } catch (err) {
    await supabase
      .from('outreach_messages')
      .update({ status: 'failed' })
      .eq('id', message_id)

    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
