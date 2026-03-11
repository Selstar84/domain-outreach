import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const SequenceSchema = z.object({
  steps: z.array(z.object({
    step_number: z.number().int().min(2).max(5),
    delay_days: z.number().int().min(1).max(60),
    subject_template: z.string().nullable().optional(),
    body_template: z.string().nullable().optional(),
  })).min(1).max(4),
})

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaign_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: steps } = await supabase
    .from('follow_up_sequences')
    .select('step_number, delay_days, is_active, subject_template, body_template')
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

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaign_id)
    .eq('user_id', user.id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  await supabase.from('follow_up_sequences').delete().eq('campaign_id', campaign_id)

  const inserts = parsed.data.steps.map(s => ({
    campaign_id,
    step_number: s.step_number,
    delay_days: s.delay_days,
    subject_template: s.subject_template ?? null,
    body_template: s.body_template ?? null,
    channel: 'email',
    is_active: true,
  }))

  const { error } = await supabase.from('follow_up_sequences').insert(inserts)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// PATCH: save templates + delay_days
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaign_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { templates: { step: number; subject: string; body: string; delay_days?: number }[] }

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaign_id)
    .eq('user_id', user.id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const activeSteps = body.templates.map(t => t.step)

  // Delete steps no longer active (e.g. user reduced from 3 to 1 follow-up)
  await supabase
    .from('follow_up_sequences')
    .delete()
    .eq('campaign_id', campaign_id)
    .not('step_number', 'in', `(${activeSteps.join(',')})`)

  // Upsert each template with its delay_days
  for (const t of body.templates) {
    const defaultDelay = t.step === 2 ? 4 : t.step === 3 ? 10 : 14
    await supabase
      .from('follow_up_sequences')
      .upsert({
        campaign_id,
        step_number: t.step,
        delay_days: t.delay_days ?? defaultDelay,
        subject_template: t.subject,
        body_template: t.body,
        channel: 'email',
        is_active: true,
      }, { onConflict: 'campaign_id,step_number' })
  }

  return NextResponse.json({ success: true })
}
