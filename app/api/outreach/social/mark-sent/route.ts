import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getEffectiveDailyLimit } from '@/lib/social/limits'

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
  const today = new Date().toISOString().slice(0, 10)

  // Load settings + calculate effective daily limit (with warm-up)
  const { data: settings } = await supabase
    .from('settings')
    .select('social_daily_limit, social_warmup_enabled, social_warmup_start_date, social_warmup_start_count, social_warmup_increment')
    .eq('user_id', user.id)
    .single()

  const effectiveLimit = getEffectiveDailyLimit({
    social_daily_limit: settings?.social_daily_limit ?? 15,
    social_warmup_enabled: settings?.social_warmup_enabled ?? false,
    social_warmup_start_date: settings?.social_warmup_start_date ?? null,
    social_warmup_start_count: settings?.social_warmup_start_count ?? 5,
    social_warmup_increment: settings?.social_warmup_increment ?? 2,
  })

  // Check per-platform count for today
  const { data: existing } = await supabase
    .from('social_queue_daily')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .eq('platform', platform)
    .single()

  const currentCount = existing?.sent_count ?? 0
  if (currentCount >= effectiveLimit) {
    return NextResponse.json(
      { error: `Limite journalière ${platform} atteinte (${effectiveLimit} messages)` },
      { status: 429 }
    )
  }

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

  // Increment per-platform daily counter
  if (existing) {
    await supabase
      .from('social_queue_daily')
      .update({ sent_count: existing.sent_count + 1 })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('social_queue_daily')
      .insert({ user_id: user.id, date: today, platform, sent_count: 1, daily_limit: effectiveLimit })
  }

  return NextResponse.json({ success: true, remaining: effectiveLimit - currentCount - 1 })
}
