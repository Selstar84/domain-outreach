import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const MarkFollowUpSchema = z.object({
  original_message_id: z.string().uuid(),
  platform: z.enum(['linkedin', 'facebook', 'instagram', 'whatsapp', 'twitter', 'other']),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = MarkFollowUpSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Données invalides' }, { status: 400 })

  const { original_message_id, platform } = parsed.data
  const now = new Date().toISOString()

  // Fetch the original message
  const { data: original, error: fetchError } = await supabase
    .from('outreach_messages')
    .select('*')
    .eq('id', original_message_id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !original) {
    return NextResponse.json({ error: 'Message original introuvable' }, { status: 404 })
  }

  const nextStep = original.sequence_step + 1
  if (nextStep > 3) {
    return NextResponse.json({ error: 'Séquence de relance terminée (max 3 étapes)' }, { status: 400 })
  }

  // Check if a follow-up already exists for this prospect/channel/step
  const { count } = await supabase
    .from('outreach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('prospect_id', original.prospect_id)
    .eq('channel', original.channel)
    .eq('sequence_step', nextStep)
    .neq('status', 'failed')

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Une relance existe déjà pour ce prospect' }, { status: 409 })
  }

  // Create the follow-up message as "sent" (user sent it manually)
  const { data: newMessage, error: insertError } = await supabase
    .from('outreach_messages')
    .insert({
      prospect_id: original.prospect_id,
      campaign_id: original.campaign_id,
      user_id: user.id,
      channel: original.channel,
      sequence_step: nextStep,
      body: '', // No body recorded for manual social follow-up
      ai_generated: false,
      status: 'sent',
      sent_at: now,
      sent_by_user: true,
      social_platform_used: platform,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Update prospect status to 'contacted' if still 'to_contact'
  await supabase
    .from('prospects')
    .update({ status: 'contacted' })
    .eq('id', original.prospect_id)
    .eq('status', 'to_contact')

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

  return NextResponse.json({ success: true, message: newMessage })
}
