export interface ApolloProspect {
  id: string
  name: string
  first_name: string
  last_name: string
  title: string | null
  email: string | null
  email_status: string | null
  linkedin_url: string | null
  phone: string | null
  company_name: string | null
  company_website: string | null
}

export interface ApolloSearchParams {
  keywords: string[]
  location: string
  titles?: string[]
  maxResults?: number
}

/**
 * Search decision-maker contacts via Apollo.io People Search API.
 */
export async function searchApolloProspects(
  params: ApolloSearchParams,
  apiKey: string,
): Promise<ApolloProspect[]> {
  const perPage = Math.min(params.maxResults ?? 25, 100)

  const body: Record<string, unknown> = {
    q_organization_keyword_tags: params.keywords,
    person_titles: params.titles ?? ['CEO', 'Owner', 'President', 'Founder', 'Director'],
    per_page: perPage,
    page: 1,
  }

  if (params.location) {
    body.q_organization_locations = [params.location]
  }

  const res = await fetch('https://api.apollo.io/v1/mixed_people/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = (err as any)?.error ?? (err as any)?.message ?? `Apollo API error ${res.status}`
    throw new Error(msg)
  }

  const data = await res.json()

  // Apollo returns both "people" (LinkedIn-only) and "contacts" (enriched with email)
  const raw: any[] = [...(data.people ?? []), ...(data.contacts ?? [])]

  // Deduplicate by id
  const seen = new Set<string>()
  const results: ApolloProspect[] = []
  for (const p of raw) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    results.push({
      id: p.id ?? '',
      name: p.name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
      first_name: p.first_name ?? '',
      last_name: p.last_name ?? '',
      title: p.title ?? null,
      email: p.email ?? null,
      email_status: p.email_status ?? null,
      linkedin_url: p.linkedin_url ?? null,
      phone: p.phone_numbers?.[0]?.raw_number ?? p.sanitized_phone ?? null,
      company_name: p.organization?.name ?? p.company ?? null,
      company_website: p.organization?.website_url ?? null,
    })
  }

  return results.slice(0, perPage)
}
