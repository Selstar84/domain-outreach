export interface SendBrevoParams {
  to: string
  subject: string
  html: string
  fromName: string
  fromEmail: string
  brevoApiKey: string
  messageDbId: string
  replyTo?: string
}

export async function sendViaBrevo(params: SendBrevoParams): Promise<string | null> {
  const body: Record<string, unknown> = {
    sender: { name: params.fromName, email: params.fromEmail },
    to: [{ email: params.to }],
    subject: params.subject,
    htmlContent: params.html,
    tags: [params.messageDbId],
  }
  if (params.replyTo) {
    body.replyTo = { email: params.replyTo }
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': params.brevoApiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any)?.message ?? `Brevo error ${res.status}`)
  }

  const data = await res.json()
  return (data as any).messageId ?? null
}
