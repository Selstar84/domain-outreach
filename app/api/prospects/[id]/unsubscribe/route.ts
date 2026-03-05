import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify prospect belongs to user
  const { data: prospect } = await supabase
    .from('prospects')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })

  // Mark prospect as dead (do not contact)
  await supabase
    .from('prospects')
    .update({ status: 'dead' })
    .eq('id', id)
    .eq('user_id', user.id)

  // Cancel all pending messages (draft, queued, scheduled)
  await supabase
    .from('outreach_messages')
    .delete()
    .eq('prospect_id', id)
    .eq('user_id', user.id)
    .in('status', ['draft', 'queued', 'scheduled'])

  return NextResponse.json({ success: true })
}
