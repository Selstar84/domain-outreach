import Anthropic from '@anthropic-ai/sdk'

export function getAnthropicClient(apiKey?: string) {
  return new Anthropic({
    apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY!,
  })
}

export const MODELS = {
  fast: 'claude-haiku-4-5-20251001',    // bulk generation
  smart: 'claude-sonnet-4-6',            // high-value prospects
} as const
