import nodemailer from 'nodemailer'

export interface SendSmtpParams {
  to: string
  subject: string
  html: string
  fromName: string
  fromEmail: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassword: string
  smtpSecure: boolean
  replyTo?: string
}

export async function sendViaSmtp(params: SendSmtpParams): Promise<string> {
  const transporter = nodemailer.createTransport({
    host: params.smtpHost,
    port: params.smtpPort,
    secure: params.smtpSecure,
    auth: {
      user: params.smtpUser,
      pass: params.smtpPassword,
    },
  })

  const info = await transporter.sendMail({
    from: `"${params.fromName}" <${params.fromEmail}>`,
    to: params.to,
    subject: params.subject,
    html: params.html,
    replyTo: params.replyTo,
  })

  return info.messageId
}
