import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const MarkSentSchema = z.object({
  message_id: z.string().uuid(),
  platform: z.enum(['linkedin', 'facebook', 'instagram', 'whatsapp', 'twitter', 'other']),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = MarkSentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { message_id, platform } = parsed.data
  const now = new Date().toISOString()

  // Update message
  await supabase
    .from('outreach_messages')
    .update({
      status: 'sent',
      sent_at: now,
      sent_by_user: true,
      social_platform_used: platform,
    })
    .eq('id', message_id)
    .eq('user_id', user.id)

  // Get the prospect_id to update status
  const { data: msg } = await supabase
    .from('outreach_messages')
    .select('prospect_id')
    .eq('id', message_id)
    .single()

  if (msg?.prospect_id) {
    await supabase
      .from('prospects')
      .update({ status: 'contacted' })
      .eq('id', msg.prospect_id)
      .eq('status', 'to_contact')
  }

  // Increment social daily counter
  const today = new Date().toISOString().slice(0, 10)
  const { data: existing } = await supabase
    .from('social_queue_daily')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  if (existing) {
    await supabase
      .from('social_queue_daily')
      .update({ sent_count: existing.sent_count + 1 })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('social_queue_daily')
      .insert({ user_id: user.id, date: today, sent_count: 1 })
  }

  return NextResponse.json({ success: true })
}
