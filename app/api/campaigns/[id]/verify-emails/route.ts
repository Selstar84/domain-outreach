import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { verifyEmail } from '@/lib/email/email-verifier'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaign_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: settings } = await supabase
    .from('settings')
    .select('zerobounce_api_key, millionverifier_api_key')
    .eq('user_id', user.id)
    .single()

  const zbApiKey = (settings as any)?.zerobounce_api_key ?? undefined
  const mvApiKey = (settings as any)?.millionverifier_api_key ?? undefined

  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, email, email_status')
    .eq('campaign_id', campaign_id)
    .eq('user_id', user.id)
    .not('email', 'is', null)
    .eq('email_status', 'unverified')

  if (!prospects || prospects.length === 0) {
    return NextResponse.json({ verified: 0, valid: 0, invalid: 0, risky: 0, unknown: 0 })
  }

  let valid = 0, invalid = 0, risky = 0, unknown = 0

  for (const prospect of prospects) {
    if (!prospect.email) continue
    const status = await verifyEmail(prospect.email, { zbApiKey, mvApiKey })
    await supabase.from('prospects').update({ email_status: status }).eq('id', prospect.id)
    if (status === 'valid' || status === 'catch_all') valid++
    else if (status === 'invalid') invalid++
    else if (status === 'risky') risky++
    else unknown++
    await new Promise(r => setTimeout(r, 150))
  }

  return NextResponse.json({ verified: prospects.length, valid, invalid, risky, unknown })
}
