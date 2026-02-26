import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CreateAccountSchema = z.object({
  provider: z.enum(['resend', 'smtp']),
  email_address: z.string().email(),
  display_name: z.string().min(1),
  resend_api_key: z.string().nullable().optional(),
  resend_domain: z.string().nullable().optional(),
  smtp_host: z.string().nullable().optional(),
  smtp_port: z.number().int().min(1).max(65535).nullable().optional(),
  smtp_user: z.string().nullable().optional(),
  smtp_password_encrypted: z.string().nullable().optional(),
  smtp_secure: z.boolean().default(false),
  daily_limit: z.number().int().min(1).max(2000).default(50),
  hourly_limit: z.number().int().min(1).max(500).default(10),
  min_delay_seconds: z.number().int().min(0).max(3600).default(120),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('email_accounts')
    .select('id, provider, email_address, display_name, daily_limit, hourly_limit, min_delay_seconds, sent_today, sent_this_hour, last_sent_at, is_active, is_verified, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreateAccountSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('email_accounts')
    .insert({ ...parsed.data, user_id: user.id })
    .select('id, provider, email_address, display_name, daily_limit, hourly_limit, min_delay_seconds, is_active, is_verified, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
