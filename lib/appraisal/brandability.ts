/**
 * Brandability score for a domain name — via Claude AI.
 * No extra API cost (uses existing Anthropic key).
 */
import { getAnthropicClient, MODELS } from '@/lib/ai/claude-client'

export interface BrandabilityScore {
  total: number           // 0-100
  breakdown: {
    length: number        // 0-20 (shorter = better, ideal 6-12 chars)
    pronounceability: number  // 0-20
    memorability: number  // 0-20
    keyword_clarity: number   // 0-20 (clear what the business does)
    tld_premium: number   // 0-20 (.com = 20, .io/.co = 15, .net = 10, other = 5)
  }
  strengths: string[]
  weaknesses: string[]
  verdict: 'excellent' | 'good' | 'average' | 'weak'
  estimated_value_range: { min: number; max: number }  // USD rough estimate
  best_buyer_profile: string  // Who would most want this domain
}

export async function scoreBrandability(
  domain: string,
  apiKey: string,
  comparableAvgPrice?: number | null,
): Promise<BrandabilityScore> {
  const client = getAnthropicClient(apiKey)

  const comparableHint = comparableAvgPrice
    ? `\nMarket context: similar domains have sold for an average of $${comparableAvgPrice.toLocaleString()} based on NameBio data.`
    : ''

  const prompt = `You are a domain name valuation expert with 15+ years of experience.
Analyze this domain name: **${domain}**
${comparableHint}

Return ONLY valid JSON (no markdown) with this exact structure:
{
  "total": <number 0-100>,
  "breakdown": {
    "length": <0-20, shorter and cleaner is better — ideal 6-12 chars without TLD>,
    "pronounceability": <0-20, can someone say it easily on the phone?>,
    "memorability": <0-20, will someone remember it after hearing once?>,
    "keyword_clarity": <0-20, does it instantly communicate a business niche?>,
    "tld_premium": <0-20, .com=20, .io/.co=15, .ca/.net/.org=10, others=5>
  },
  "strengths": [<2-3 short bullet points, each under 10 words>],
  "weaknesses": [<1-3 short bullet points, or empty array if excellent>],
  "verdict": "excellent" | "good" | "average" | "weak",
  "estimated_value_range": { "min": <USD>, "max": <USD> },
  "best_buyer_profile": "<one sentence: who would pay the most for this?>"
}

Scoring rules:
- verdict: 80-100 = excellent, 60-79 = good, 40-59 = average, <40 = weak
- estimated_value_range: be realistic based on domain length, TLD, keyword demand, and any comparable data
- If it's a geo-domain (city+keyword), factor in local business demand`

  const message = await client.messages.create({
    model: MODELS.fast,  // Use Haiku — cheaper for this scoring task
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('')
    .trim()

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in brandability response')

  return JSON.parse(jsonMatch[0]) as BrandabilityScore
}
