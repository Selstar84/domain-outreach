import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendViaResend } from '@/lib/email/resend-client'
import { sendViaBrevo } from '@/lib/email/brevo-client'
import { sendViaSmtp } from '@/lib/email/smtp-client'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const { to } = await request.json()
  if (!to) return NextResponse.json({ error: 'to email required' }, { status: 400 })

  try {
    if (account.provider === 'resend' && account.resend_api_key) {
      await sendViaResend({
        to,
        subject: '✅ Test email — Domain Outreach',
        html: '<p>Your Resend email account is correctly configured in Domain Outreach!</p>',
        fromName: account.display_name,
        fromEmail: account.email_address,
        resendApiKey: account.resend_api_key,
        messageDbId: 'test',
      })
    } else if (account.provider === 'brevo' && account.brevo_api_key) {
      await sendViaBrevo({
        to,
        subject: '✅ Test email — Domain Outreach',
        html: '<p>Your Brevo email account is correctly configured in Domain Outreach!</p>',
        fromName: account.display_name,
        fromEmail: account.email_address,
        brevoApiKey: account.brevo_api_key,
        messageDbId: 'test',
      })
    } else if (account.provider === 'smtp' && account.smtp_host) {
      await sendViaSmtp({
        to,
        subject: '✅ Test email — Domain Outreach',
        html: '<p>Your SMTP email account is correctly configured in Domain Outreach!</p>',
        fromName: account.display_name,
        fromEmail: account.email_address,
        smtpHost: account.smtp_host,
        smtpPort: account.smtp_port ?? 587,
        smtpUser: account.smtp_user ?? '',
        smtpPassword: account.smtp_password_encrypted ?? '',
        smtpSecure: account.smtp_secure ?? false,
      })
    } else {
      return NextResponse.json({ error: 'Account not configured' }, { status: 400 })
    }

    // Mark as verified
    await supabase.from('email_accounts').update({ is_verified: true }).eq('id', id)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
