import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAnthropicClient, MODELS } from '@/lib/ai/claude-client'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaign_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const totalSteps: number = Math.min(Math.max(body.stepCount ?? 3, 1), 4)

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

  const stepDescriptions = [
    'Step 1 : Premier contact (4-5 phrases max, pas de prix, terminer par une question ouverte)',
    "Step 2 : Première relance (3-4 phrases, référence à l'email précédent, légèrement plus direct)",
    'Step 3 : Deuxième relance (3 phrases, un peu plus urgent mais rester poli)',
    'Step 4 : Dernière relance (2-3 phrases, très court, facile de dire oui ou non)',
  ].slice(0, totalSteps)

  const jsonExample = Array.from({ length: totalSteps }, (_, i) =>
    `  {"step": ${i + 1}, "subject": "...", "body": "..."}`
  ).join(',\n')

  const prompt = `Tu es un courtier en noms de domaine. Génère des templates d'emails de prospection pour vendre le domaine "${domain}".

${priceHint}

Les templates doivent utiliser ces variables qui seront remplacées automatiquement :
- {prospect_domain} = domaine du prospect
- {company_name} = nom de l'entreprise du prospect
- {my_domain} = domaine en vente (${domain})
- {asking_price} = prix demandé

Génère exactement ${totalSteps} template${totalSteps > 1 ? 's' : ''} :
${stepDescriptions.join('\n')}

Retourne UNIQUEMENT un JSON valide (sans markdown) :
[
${jsonExample}
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
