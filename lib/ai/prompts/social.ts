import type { MessageContext } from './email'

export type SocialPlatform = 'linkedin' | 'facebook' | 'instagram' | 'whatsapp' | 'twitter'

const platformGuidelines: Record<SocialPlatform, string> = {
  linkedin: `Tone: Professional and formal. Length: 100-150 words. No emojis. Reference their professional background if possible. Do NOT include links in the first message (LinkedIn often hides messages with links).`,
  facebook: `Tone: Friendly and casual. Length: 60-90 words. You can use 1-2 emojis max. Keep it conversational, like a message from a business acquaintance.`,
  instagram: `Tone: Very casual and brief. Length: 40-60 words. 1-2 relevant emojis are fine. Sound like a real person reaching out, not a sales pitch.`,
  whatsapp: `Tone: Personal and direct, like an SMS. Length: 50-80 words. Sound genuine. Start with a greeting. Keep it to the point.`,
  twitter: `Tone: Casual, concise, direct. Length: 200-250 characters max (Twitter DM style). Straight to the point. No hashtags.`,
}

export function buildSocialPrompt(ctx: MessageContext, platform: SocialPlatform): string {
  const relationHint =
    ctx.domainType === 'same_word_diff_tld'
      ? `They own ${ctx.prospectDomain}. The .com version (${ctx.domainForSale}) is available and could complete their brand.`
      : `Their domain contains the same keyword as ${ctx.domainForSale}, which is available.`

  const customBlock = ctx.customInstructions?.trim()
    ? `\nSPECIAL INSTRUCTIONS FROM THE SENDER (follow these carefully, they override defaults):\n${ctx.customInstructions.trim()}\n`
    : ''

  const nameHint = ctx.prospectFirstName
    ? `Recipient first name: ${ctx.prospectFirstName} (personalize the greeting with their first name if appropriate)`
    : ''

  return `You are a domain name investor reaching out via ${platform.toUpperCase()} to offer a domain for sale.

Domain for sale: ${ctx.domainForSale}
Recipient's domain: ${ctx.prospectDomain}
Company: ${ctx.companyName ?? 'their company'}
${nameHint}
About them: ${ctx.websiteDescription ?? 'not available'}

Context: ${relationHint}
${customBlock}
Platform guidelines for ${platform.toUpperCase()}:
${platformGuidelines[platform]}

Generate 2 message variants. Sound natural and human, NOT spammy.
Do NOT copy-paste the guidelines — just write the messages.

Return ONLY valid JSON (no markdown):
[
  {"variant": 1, "body": "..."},
  {"variant": 2, "body": "..."}
]`
}
