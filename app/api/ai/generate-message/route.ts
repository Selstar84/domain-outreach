import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateEmailMessages, generateSocialMessages } from '@/lib/ai/message-generator'
import { z } from 'zod'

const GenerateSchema = z.object({
  prospect_id: z.string().uuid(),
  channel: z.enum(['email', 'linkedin', 'facebook', 'instagram', 'whatsapp', 'twitter']),
  sequence_step: z.number().int().min(1).max(3).default(1),
  use_smart_model: z.boolean().default(false),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = GenerateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { prospect_id, channel, sequence_step, use_smart_model } = parsed.data

  // Fetch prospect + campaign + settings
  const [{ data: prospect }, { data: settings }] = await Promise.all([
    supabase
      .from('prospects')
      .select('*, campaign:campaigns(*, owned_domain:owned_domains(*))')
      .eq('id', prospect_id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('settings')
      .select('anthropic_api_key')
      .eq('user_id', user.id)
      .single(),
  ])

  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })

  const campaign = (prospect as any).campaign
  const ownedDomain = campaign?.owned_domain

  const ctx = {
    domainForSale: ownedDomain?.domain ?? '',
    askingPrice: campaign?.asking_price ?? null,
    prospectDomain: prospect.domain,
    prospectTld: prospect.tld,
    domainType: prospect.domain_type as 'same_word_diff_tld' | 'contains_word',
    companyName: prospect.company_name,
    websiteDescription: prospect.website_description,
    sequenceStep: sequence_step as 1 | 2 | 3,
  }

  const apiKey = settings?.anthropic_api_key ?? undefined

  try {
    let messages
    if (channel === 'email') {
      messages = await generateEmailMessages(ctx, apiKey, use_smart_model)
    } else {
      messages = await generateSocialMessages(ctx, channel as any, apiKey, use_smart_model)
    }

    // Save generated messages as drafts in DB
    const inserts = messages.map((m) => ({
      prospect_id,
      campaign_id: campaign?.id,
      user_id: user.id,
      channel,
      sequence_step,
      subject: m.subject ?? null,
      body: m.body,
      ai_generated: true,
      ai_variant: m.variant,
      status: 'draft',
    }))

    const { data: saved } = await supabase
      .from('outreach_messages')
      .insert(inserts)
      .select()

    return NextResponse.json({ messages: saved ?? inserts })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
