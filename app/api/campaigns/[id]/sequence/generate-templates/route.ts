import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAnthropicClient, MODELS } from '@/lib/ai/claude-client'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaign_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get campaign + domain + settings
  const [{ data: campaign }, { data: settings }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('*, owned_domain:owned_domains(*)')
      .eq('id', campaign_id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('settings')
      .select('anthropic_api_key')
      .eq('user_id', user.id)
      .single(),
  ])

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const domain = (campaign as any).owned_domain?.domain ?? ''
  const askingPrice = campaign.asking_price

  const priceHint = askingPrice
    ? `Le prix demandé est $${askingPrice.toLocaleString()} (ne pas le mentionner dans les premiers emails).`
    : ''

  const prompt = `Tu es un courtier en noms de domaine. Génère des templates d'emails de prospection pour vendre le domaine "${domain}".

${priceHint}

Les templates doivent utiliser ces variables qui seront remplacées automatiquement :
- {prospect_domain} = domaine du prospect
- {company_name} = nom de l'entreprise du prospect
- {my_domain} = domaine en vente (${domain})
- {asking_price} = prix demandé

Génère 3 templates (un par étape de la séquence) :
- Step 1 : Premier contact (4-5 phrases max, pas de prix, terminer par une question ouverte)
- Step 2 : Relance J+4 (3-4 phrases, référence à l'email précédent, légèrement plus direct)
- Step 3 : Dernière relance J+10 (2-3 phrases, court, facile de dire oui ou non)

Retourne UNIQUEMENT un JSON valide (sans markdown) :
[
  {"step": 1, "subject": "...", "body": "..."},
  {"step": 2, "subject": "...", "body": "..."},
  {"step": 3, "subject": "...", "body": "..."}
]`

  try {
    const client = getAnthropicClient(settings?.anthropic_api_key ?? undefined)
    const message = await client.messages.create({
      model: MODELS.fast,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response')

    const jsonMatch = content.text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON found in response')

    const templates = JSON.parse(jsonMatch[0]) as { step: number; subject: string; body: string }[]
    return NextResponse.json({ templates })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
