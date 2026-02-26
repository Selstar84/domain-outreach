import { Resend } from 'resend'

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  fromName: string
  fromEmail: string
  resendApiKey: string
  messageDbId: string // our DB outreach_message id for webhook tracking
  replyTo?: string
}

export async function sendViaResend(params: SendEmailParams) {
  const resend = new Resend(params.resendApiKey)

  const result = await resend.emails.send({
    from: `${params.fromName} <${params.fromEmail}>`,
    to: params.to,
    subject: params.subject,
    html: params.html,
    replyTo: params.replyTo,
    tags: [{ name: 'message_id', value: params.messageDbId }],
  })

  if (result.error) {
    throw new Error(result.error.message)
  }

  return result.data?.id ?? null
}
