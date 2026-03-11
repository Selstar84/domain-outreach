import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const ImportRowSchema = z.object({
  email: z.string().email(),
  domain: z.string().min(1),
  company_name: z.string().optional().nullable(),
  contact_name: z.string().optional().nullable(),
})

const ImportBodySchema = z.object({
  rows: z.array(ImportRowSchema).min(1).max(500),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaign_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify campaign belongs to user
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaign_id)
    .eq('user_id', user.id)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const body = await request.json()
  const parsed = ImportBodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { rows } = parsed.data

  // Get existing domains in this campaign for dedup
  const { data: existing } = await supabase
    .from('prospects')
    .select('domain')
    .eq('campaign_id', campaign_id)

  const existingDomains = new Set((existing ?? []).map(p => p.domain.toLowerCase()))

  const toInsert = []
  let skipped_duplicates = 0

  for (const row of rows) {
    const domainLower = row.domain.toLowerCase().trim()
    if (existingDomains.has(domainLower)) {
      skipped_duplicates++
      continue
    }
    existingDomains.add(domainLower) // prevent duplicates within the batch itself

    // Infer TLD = last part after last dot
    const parts = domainLower.split('.')
    const tld = parts.length >= 2 ? parts[parts.length - 1] : 'com'

    toInsert.push({
      campaign_id,
      user_id: user.id,
      domain: domainLower,
      tld,
      domain_type: 'other' as const,
      email: row.email.trim().toLowerCase(),
      email_source: 'manual' as const,
      company_name: row.company_name?.trim() || null,
      owner_name: row.contact_name?.trim() || null,
      scrape_status: 'skipped' as const,
      status: 'to_contact' as const,
    })
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0, skipped_duplicates })
  }

  const { error } = await supabase.from('prospects').insert(toInsert)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ inserted: toInsert.length, skipped_duplicates }, { status: 201 })
}
