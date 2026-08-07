import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { verifyEmail } from '@/lib/email/email-verifier'

// Advance to Monday if date lands on Saturday (6) or Sunday (0)
function nextBusinessDay(d: Date): void {
  const day = d.getUTCDay()
  if (day === 6) d.setUTCDate(d.getUTCDate() + 2)
  else if (day === 0) d.setUTCDate(d.getUTCDate() + 1)
}

// Returns the UTC date string for day offset at 13:00 UTC (= 9am EDT)
function scheduledDateForDay(baseDate: Date, dayOffset: number): string {
  const d = new Date(baseDate)
  d.setUTCDate(d.getUTCDate() + dayOffset)
  d.setUTCHours(13, 0, 0, 0)
  nextBusinessDay(d)
  return d.toISOString()
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaign_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Accept email_account_id from body (overrides campaign preference)
  const body = await request.json().catch(() => ({}))
  const bodyAccountId = body?.email_account_id ?? null

  // Get campaign + preferred email account
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, preferred_email_account_id, asking_price')
    .eq('id', campaign_id)
    .eq('user_id', user.id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  // Resolve which account to use: body > campaign preference > first active account
  let resolvedAccountId = bodyAccountId ?? campaign.preferred_email_account_id
  if (!resolvedAccountId) {
    const { data: firstAccount } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('user_id', user.id)
      .or('is_active.eq.true,is_verified.eq.true')
      .order('created_at')
      .limit(1)
      .single()
    resolvedAccountId = firstAccount?.id ?? null
  }
  if (!resolvedAccountId) {
    return NextResponse.json({ error: 'Aucun compte email actif trouvé. Configure un compte email dans Paramètres.' }, { status: 400 })
  }

  // Save as preferred if not already set
  if (!campaign.preferred_email_account_id) {
    await supabase.from('campaigns').update({ preferred_email_account_id: resolvedAccountId }).eq('id', campaign_id)
  }

  // Check email account is configured + get limits
  const { data: account } = await supabase
    .from('email_accounts')
    .select('id, is_active, is_verified, daily_limit')
    .eq('id', resolvedAccountId)
    .eq('user_id', user.id)
    .single()

  if (!account?.is_active && !account?.is_verified) {
    return NextResponse.json({ error: 'Le compte email sélectionné est inactif.' }, { status: 400 })
  }

  const dailyLimit = account.daily_limit ?? 15

  // Auto-verify unverified emails before launch (parallel — stays under 10s timeout)
  const [{ data: settings }, { data: toVerify }] = await Promise.all([
    supabase.from('settings').select('zerobounce_api_key, millionverifier_api_key').eq('user_id', user.id).single(),
    supabase.from('prospects').select('id, email').eq('campaign_id', campaign_id).eq('status', 'to_contact').not('email', 'is', null).eq('email_status', 'unverified'),
  ])

  if (toVerify && toVerify.length > 0) {
    const zbApiKey = (settings as any)?.zerobounce_api_key ?? undefined
    const mvApiKey = (settings as any)?.millionverifier_api_key ?? undefined
    const verifications = await Promise.all(
      toVerify.map(p => verifyEmail(p.email!, { zbApiKey, mvApiKey }).then(status => ({ id: p.id, status })))
    )
    await Promise.all(verifications.map(v => supabase.from('prospects').update({ email_status: v.status }).eq('id', v.id)))
  }

  // Get all to_contact prospects with an email that are not marked invalid
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, email, email_status')
    .eq('campaign_id', campaign_id)
    .eq('status', 'to_contact')
    .not('email', 'is', null)
    .neq('email_status', 'invalid')

  if (!prospects || prospects.length === 0) {
    return NextResponse.json({ error: 'Aucun prospect à contacter avec un email disponible.' }, { status: 400 })
  }

  // Check for already queued/sent step 1 messages to avoid duplicates
  const { data: existing } = await supabase
    .from('outreach_messages')
    .select('prospect_id')
    .eq('campaign_id', campaign_id)
    .eq('sequence_step', 1)
    .in('status', ['queued', 'sending', 'sent'])

  const alreadyQueued = new Set((existing ?? []).map(m => m.prospect_id))
  const toQueue = prospects.filter(p => !alreadyQueued.has(p.id))

  if (toQueue.length === 0) {
    return NextResponse.json({ error: 'Tous les prospects sont déjà dans la file d\'envoi.' }, { status: 400 })
  }

  // Smart scheduling: spread across days based on daily_limit
  // If it's before 8:30 AM UTC, start today; otherwise start tomorrow
  const now = new Date()
  // Cron fires at 13:00 UTC (9am EDT). If launched before 12:30 UTC, use today; else tomorrow.
  const isBeforeCronTime = now.getUTCHours() < 12 || (now.getUTCHours() === 12 && now.getUTCMinutes() < 30)
  const baseDate = new Date(now)
  if (!isBeforeCronTime) {
    baseDate.setUTCDate(baseDate.getUTCDate() + 1) // start tomorrow
  }
  nextBusinessDay(baseDate) // skip to Monday if base falls on weekend

  const inserts = toQueue.map((p, i) => {
    const dayOffset = Math.floor(i / dailyLimit)
    return {
      prospect_id: p.id,
      campaign_id,
      user_id: user.id,
      channel: 'email',
      sequence_step: 1,
      body: '', // Will be generated by cron
      ai_generated: true,
      status: 'queued',
      scheduled_for: scheduledDateForDay(baseDate, dayOffset),
      email_account_id: resolvedAccountId,
    }
  })

  const { error } = await supabase.from('outreach_messages').insert(inserts)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Build summary for UI
  const totalDays = Math.ceil(toQueue.length / dailyLimit)
  const firstSend = scheduledDateForDay(baseDate, 0)
  const lastSend = scheduledDateForDay(baseDate, totalDays - 1)

  return NextResponse.json({
    queued: toQueue.length,
    daily_limit: dailyLimit,
    total_days: totalDays,
    first_send: firstSend,
    last_send: lastSend,
  })
}
