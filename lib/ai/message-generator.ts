import { getAnthropicClient, MODELS } from './claude-client'
import { buildEmailPrompt, MessageContext } from './prompts/email'
import { buildSocialPrompt, SocialPlatform } from './prompts/social'

export interface GeneratedMessage {
  variant: number
  subject?: string
  body: string
}

async function callClaude(
  prompt: string,
  apiKey?: string,
  useSmart = false
): Promise<string> {
  const client = getAnthropicClient(apiKey)
  const model = useSmart ? MODELS.smart : MODELS.fast

  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')
  return content.text
}

export async function generateEmailMessages(
  ctx: MessageContext,
  apiKey?: string,
  useSmart = false
): Promise<GeneratedMessage[]> {
  const prompt = buildEmailPrompt(ctx)
  const raw = await callClaude(prompt, apiKey, useSmart)

  try {
    // Extract JSON from response (sometimes Claude wraps it)
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found')
    const parsed = JSON.parse(jsonMatch[0])
    return parsed.map((m: Record<string, unknown>) => ({
      variant: m.variant as number,
      subject: m.subject as string,
      body: m.body as string,
    }))
  } catch {
    // Fallback: return raw as single message
    return [{ variant: 1, body: raw }]
  }
}

export async function generateSocialMessages(
  ctx: MessageContext,
  platform: SocialPlatform,
  apiKey?: string,
  useSmart = false
): Promise<GeneratedMessage[]> {
  const prompt = buildSocialPrompt(ctx, platform)
  const raw = await callClaude(prompt, apiKey, useSmart)

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found')
    const parsed = JSON.parse(jsonMatch[0])
    return parsed.map((m: Record<string, unknown>) => ({
      variant: m.variant as number,
      body: m.body as string,
    }))
  } catch {
    return [{ variant: 1, body: raw }]
  }
}
