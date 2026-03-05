import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Find social messages that were sent 4+ days ago with no follow-up yet
  // Using a raw query approach with Supabase
  const { data: sentMessages, error } = await supabase
    .from('outreach_messages')
    .select(`
      id, channel, sequence_step, sent_at, body, prospect_id, campaign_id,
      prospect:prospects(
        id, domain, company_name, status,
        linkedin_url, facebook_url, instagram_url, twitter_url, whatsapp_number
      )
    `)
    .eq('user_id', user.id)
    .neq('channel', 'email')
    .eq('status', 'sent')
    .lt('sent_at', new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString())
    .lt('sequence_step', 3)
    .order('sent_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sentMessages) return NextResponse.json({ due: [] })

  // Filter out: prospects that are sold/dead/skipped/replied/negotiating
  const terminalStatuses = ['sold', 'dead', 'skipped', 'replied', 'negotiating']
  const eligible = sentMessages.filter(m => {
    const prospect = (m as any).prospect
    if (!prospect) return false
    if (terminalStatuses.includes(prospect.status)) return false
    return true
  })

  if (eligible.length === 0) return NextResponse.json({ due: [] })

  // For each eligible message, check if a follow-up already exists
  const followUpChecks = await Promise.all(
    eligible.map(async (m) => {
      const { count } = await supabase
        .from('outreach_messages')
        .select('id', { count: 'exact', head: true })
        .eq('prospect_id', m.prospect_id)
        .eq('channel', m.channel)
        .eq('sequence_step', m.sequence_step + 1)
        .neq('status', 'failed')

      return { message: m, hasFollowUp: (count ?? 0) > 0 }
    })
  )

  const due = followUpChecks
    .filter(({ hasFollowUp }) => !hasFollowUp)
    .map(({ message }) => message)

  return NextResponse.json({ due, count: due.length })
}
