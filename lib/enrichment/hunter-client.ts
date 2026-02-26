export interface HunterEmail {
  email: string
  confidence: number
  first_name: string | null
  last_name: string | null
  position: string | null
}

export interface HunterResult {
  emails: HunterEmail[]
  organization: string | null
  error?: string
}

export async function searchEmailsByDomain(
  domain: string,
  apiKey: string
): Promise<HunterResult> {
  try {
    const url = new URL('https://api.hunter.io/v2/domain-search')
    url.searchParams.set('domain', domain)
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('limit', '5')

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      return { emails: [], organization: null, error: `Hunter API error: ${res.status}` }
    }

    const data = await res.json()
    const emails: HunterEmail[] = (data.data?.emails ?? []).map((e: Record<string, unknown>) => ({
      email: e.value as string,
      confidence: (e.confidence as number) ?? 0,
      first_name: (e.first_name as string) ?? null,
      last_name: (e.last_name as string) ?? null,
      position: (e.position as string) ?? null,
    }))

    return {
      emails: emails.sort((a, b) => b.confidence - a.confidence),
      organization: (data.data?.organization as string) ?? null,
    }
  } catch (e) {
    return { emails: [], organization: null, error: String(e) }
  }
}
