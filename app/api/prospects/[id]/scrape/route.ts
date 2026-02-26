import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { scrapeDomain } from '@/lib/scraping/cheerio-scraper'
import { searchEmailsByDomain } from '@/lib/enrichment/hunter-client'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get prospect
  const { data: prospect } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })

  // Mark as running
  await supabase
    .from('prospects')
    .update({ scrape_status: 'running', scrape_attempted_at: new Date().toISOString() })
    .eq('id', id)

  try {
    const result = await scrapeDomain(prospect.domain)

    const bestEmail = result.emails[0] ?? null

    let email = bestEmail?.email ?? null
    let emailSource: string | null = bestEmail ? 'scraped' : null
    let emailConfidence = bestEmail?.confidence ?? null
    let ownerName: string | null = null

    // Enrich with Hunter.io if no email found
    if (!email) {
      const { data: settings } = await supabase
        .from('settings')
        .select('hunter_api_key')
        .eq('user_id', user.id)
        .single()

      if (settings?.hunter_api_key) {
        const hunterResult = await searchEmailsByDomain(prospect.domain, settings.hunter_api_key)
        if (hunterResult.emails.length > 0) {
          const best = hunterResult.emails[0]
          email = best.email
          emailSource = 'hunter'
          emailConfidence = best.confidence
          if (best.first_name || best.last_name) {
            ownerName = [best.first_name, best.last_name].filter(Boolean).join(' ')
          }
        }
      }
    }

    const update = {
      scrape_status: 'completed',
      scrape_completed_at: new Date().toISOString(),
      company_name: result.company_name,
      website_description: result.website_description,
      email: email,
      email_source: emailSource,
      email_confidence: emailConfidence,
      owner_name: ownerName,
      phone: result.social.phone,
      linkedin_url: result.social.linkedin_url,
      facebook_url: result.social.facebook_url,
      instagram_url: result.social.instagram_url,
      twitter_url: result.social.twitter_url,
      whatsapp_number: result.social.whatsapp_number,
    }

    await supabase.from('prospects').update(update).eq('id', id)

    return NextResponse.json({ success: true, data: update })
  } catch (err) {
    await supabase
      .from('prospects')
      .update({
        scrape_status: 'failed',
        scrape_error: String(err),
      })
      .eq('id', id)

    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
