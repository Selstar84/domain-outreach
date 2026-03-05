export interface MessageContext {
  domainForSale: string
  askingPrice?: number | null
  prospectDomain: string
  prospectTld: string
  domainType: 'same_word_diff_tld' | 'contains_word'
  companyName?: string | null
  websiteDescription?: string | null
  prospectFirstName?: string | null
  sequenceStep: 1 | 2 | 3
  customInstructions?: string | null
}

export function buildEmailPrompt(ctx: MessageContext): string {
  const priceHint = ctx.askingPrice
    ? `The asking price is $${ctx.askingPrice.toLocaleString()} but do NOT mention this in the first email.`
    : ''

  const relationHint =
    ctx.domainType === 'same_word_diff_tld'
      ? `They already own ${ctx.prospectDomain} (the ${ctx.prospectTld} version). Owning ${ctx.domainForSale} would give them the .com — typically the most valuable and trusted extension, and would prevent competitors from using it.`
      : `Their domain contains the word from ${ctx.domainForSale}. Owning ${ctx.domainForSale} as well would strengthen their brand identity and prevent confusion.`

  const stepInstructions = {
    1: `This is the FIRST contact. Be brief (4-5 sentences max), professional, and end with a simple open question like "Is this something that would interest you?" Do NOT mention price.`,
    2: `This is a FOLLOW-UP (sent 4 days after no response). Reference your previous email briefly. Keep it even shorter (3-4 sentences). Slightly more direct. You can hint that there is interest from others.`,
    3: `This is the FINAL follow-up (sent 10 days after no response). Very brief (2-3 sentences). Make it easy to say yes or no. This is the last outreach attempt.`,
  }

  const customBlock = ctx.customInstructions?.trim()
    ? `\nSPECIAL INSTRUCTIONS FROM THE SENDER (follow these carefully, they override defaults):\n${ctx.customInstructions.trim()}\n`
    : ''

  const nameHint = ctx.prospectFirstName
    ? `Recipient first name: ${ctx.prospectFirstName} (use their first name in the greeting if appropriate)`
    : ''

  return `You are a domain name broker writing a cold outreach email to sell a domain name.

Domain for sale: ${ctx.domainForSale}
Recipient's domain: ${ctx.prospectDomain}
Company/recipient: ${ctx.companyName ?? 'the company'}
${nameHint}
About their business: ${ctx.websiteDescription ?? 'not available'}
${priceHint}

Context: ${relationHint}
${customBlock}
Instructions:
- ${stepInstructions[ctx.sequenceStep]}
- Sound human and natural — NOT like a template
- Do NOT use "I hope this email finds you well" or similar clichés
- Do NOT be pushy or salesy
- Keep it SHORT — busy people don't read long emails
- Write in the same language as the recipient's website if possible

Generate 3 variants with slightly different approaches:
1. Value-focused (emphasize brand value and .com authority)
2. Scarcity/opportunity-focused (others may want this domain)
3. Curiosity/question-focused (make them curious)

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {"variant": 1, "subject": "...", "body": "..."},
  {"variant": 2, "subject": "...", "body": "..."},
  {"variant": 3, "subject": "...", "body": "..."}
]`
}
