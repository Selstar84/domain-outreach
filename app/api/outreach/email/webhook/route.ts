import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const body = await request.json()

  // Resend sends events like: email.opened, email.clicked, email.bounced, email.complained
  const { type, data } = body

  if (!type || !data) return NextResponse.json({ ok: true })

  // Find our message via the tag we set during send
  const tags: { name: string; value: string }[] = data.tags ?? []
  const messageTag = tags.find((t) => t.name === 'message_id')
  if (!messageTag) return NextResponse.json({ ok: true })

  const messageId = messageTag.value
  const supabase = await createServiceClient()

  const now = new Date().toISOString()
  const updates: Record<string, string> = {}

  switch (type) {
    case 'email.delivered':
      updates.status = 'delivered'
      break
    case 'email.opened':
      updates.status = 'opened'
      updates.opened_at = now
      break
    case 'email.clicked':
      updates.status = 'clicked'
      updates.clicked_at = now
      break
    case 'email.bounced':
      updates.status = 'bounced'
      updates.bounced_at = now
      break
    case 'email.complained':
      updates.status = 'bounced'
      updates.bounced_at = now
      break
    default:
      return NextResponse.json({ ok: true })
  }

  await supabase
    .from('outreach_messages')
    .update(updates)
    .eq('id', messageId)

  // If bounced, mark prospect as dead
  if (type === 'email.bounced') {
    const { data: message } = await supabase
      .from('outreach_messages')
      .select('prospect_id')
      .eq('id', messageId)
      .single()

    if (message?.prospect_id) {
      await supabase
        .from('prospects')
        .update({ status: 'dead' })
        .eq('id', message.prospect_id)
        .eq('status', 'contacted') // Don't override if already negotiating/replied
    }
  }

  return NextResponse.json({ ok: true })
}
