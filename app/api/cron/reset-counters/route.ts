import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Runs daily at midnight via Vercel Cron
// Resets sent_today and sent_this_hour for all email accounts
export async function GET() {
  const supabase = await createServiceClient()

  // Reset daily email counters
  const { error: dailyError } = await supabase
    .from('email_accounts')
    .update({ sent_today: 0 })
    .gt('sent_today', 0)

  // Reset hourly counters (also reset every hour ideally, but daily midnight is OK)
  const { error: hourlyError } = await supabase
    .from('email_accounts')
    .update({ sent_this_hour: 0 })
    .gt('sent_this_hour', 0)

  if (dailyError || hourlyError) {
    return NextResponse.json({ error: dailyError?.message ?? hourlyError?.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, reset_at: new Date().toISOString() })
}
