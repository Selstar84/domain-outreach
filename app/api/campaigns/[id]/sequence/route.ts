import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const SequenceSchema = z.object({
  steps: z.array(z.object({
    step_number: z.number().int().min(2).max(5),
    delay_days: z.number().int().min(1).max(60),
  })).min(1).max(4),
})

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaign_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: steps } = await supabase
    .from('follow_up_sequences')
    .select('step_number, delay_days, is_active')
    .eq('campaign_id', campaign_id)
    .order('step_number')

  return NextResponse.json({ steps: steps ?? [] })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaign_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = SequenceSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Verify campaign belongs to user
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaign_id)
    .eq('user_id', user.id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  // Delete existing steps for this campaign and re-insert
  await supabase.from('follow_up_sequences').delete().eq('campaign_id', campaign_id)

  const inserts = parsed.data.steps.map(s => ({
    campaign_id,
    step_number: s.step_number,
    delay_days: s.delay_days,
    channel: 'email',
    is_active: true,
  }))

  const { error } = await supabase.from('follow_up_sequences').insert(inserts)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
