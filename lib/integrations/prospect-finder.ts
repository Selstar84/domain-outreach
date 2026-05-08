/**
 * Pluggable prospect discovery layer.
 * Same interface regardless of which tool is configured.
 * Swap Apollo ↔ Snov ↔ Hunter by changing one setting.
 */
import type { ProspectSearchQuery, FoundProspect, IntegrationSettings } from './types'

// ─── Apollo.io ────────────────────────────────────────────────────────────────
async function findWithApollo(query: ProspectSearchQuery, apiKey: string): Promise<FoundProspect[]> {
  const body: Record<string, unknown> = {
    q_organization_keyword_tags: query.keywords,
    person_titles: query.titles ?? ['CEO', 'Owner', 'President', 'Founder', 'Director', 'Manager'],
    per_page: Math.min(query.maxResults ?? 25, 100),
    page: 1,
  }
  if (query.location) body.q_organization_locations = [query.location]

  const res = await fetch('https://api.apollo.io/v1/mixed_people/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey, 'Cache-Control': 'no-cache' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any)?.error ?? `Apollo error ${res.status}`)
  }
  const data = await res.json()
  const raw: any[] = [...(data.people ?? []), ...(data.contacts ?? [])]
  const seen = new Set<string>()
  return raw.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true }).map(p => ({
    name: p.name ?? null,
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? null,
    title: p.title ?? null,
    email: p.email ?? null,
    email_confidence: emailStatusToConfidence(p.email_status),
    linkedin_url: p.linkedin_url ?? null,
    phone: p.phone_numbers?.[0]?.raw_number ?? null,
    company_name: p.organization?.name ?? null,
    company_website: p.organization?.website_url ?? null,
  }))
}

// ─── Snov.io ──────────────────────────────────────────────────────────────────
async function findWithSnov(query: ProspectSearchQuery, apiKey: string): Promise<FoundProspect[]> {
  // Snov.io: domain/company-based search — use company name from keywords
  // GET access token first
  const tokenRes = await fetch('https://api.snov.io/v1/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: apiKey, client_secret: apiKey }),
  })
  if (!tokenRes.ok) throw new Error(`Snov.io auth error ${tokenRes.status}`)
  const { access_token } = await tokenRes.json()

  // Company search
  const searchRes = await fetch('https://api.snov.io/v2/domain-emails-with-info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
    body: JSON.stringify({
      domain: query.keywords.join('-') + '.com',  // best-effort domain from keywords
      type: 'personal',
      limit: query.maxResults ?? 25,
    }),
  })
  if (!searchRes.ok) throw new Error(`Snov.io search error ${searchRes.status}`)
  const data = await searchRes.json()

  return (data.emails ?? []).map((e: any) => ({
    name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || null,
    first_name: e.firstName ?? null,
    last_name: e.lastName ?? null,
    title: e.position ?? null,
    email: e.email ?? null,
    email_confidence: e.confidence ?? null,
    linkedin_url: null,
    phone: null,
    company_name: data.organizationName ?? null,
    company_website: data.domain ? `https://${data.domain}` : null,
  }))
}

// ─── Hunter.io ────────────────────────────────────────────────────────────────
async function findWithHunter(query: ProspectSearchQuery, apiKey: string): Promise<FoundProspect[]> {
  const params = new URLSearchParams({
    api_key: apiKey,
    query: query.keywords.join(' '),
    limit: String(query.maxResults ?? 25),
  })
  const res = await fetch(`https://api.hunter.io/v2/domain-search?${params}`)
  if (!res.ok) throw new Error(`Hunter.io error ${res.status}`)
  const data = await res.json()

  return (data.data?.emails ?? []).map((e: any) => ({
    name: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || null,
    first_name: e.first_name ?? null,
    last_name: e.last_name ?? null,
    title: e.position ?? null,
    email: e.value ?? null,
    email_confidence: e.confidence ?? null,
    linkedin_url: e.linkedin ?? null,
    phone: e.phone_number ?? null,
    company_name: data.data?.organization ?? null,
    company_website: data.data?.domain ? `https://${data.data.domain}` : null,
  }))
}

// ─── Dropcontact ──────────────────────────────────────────────────────────────
async function findWithDropcontact(query: ProspectSearchQuery, apiKey: string): Promise<FoundProspect[]> {
  // Dropcontact: enrichment by name + company, less suited for discovery
  // Returns empty for keyword searches — better used as enrichment step
  console.warn('Dropcontact is better as enrichment, not discovery. Use Apollo or Snov for discovery.')
  return []
}

// ─── Router ───────────────────────────────────────────────────────────────────
export async function findProspects(
  query: ProspectSearchQuery,
  settings: IntegrationSettings,
): Promise<FoundProspect[]> {
  switch (settings.prospect_finder_tool) {
    case 'apollo':
      if (!settings.apollo_api_key) throw new Error('Clé API Apollo.io manquante dans les paramètres')
      return findWithApollo(query, settings.apollo_api_key)

    case 'snov':
      if (!settings.snov_api_key) throw new Error('Clé API Snov.io manquante dans les paramètres')
      return findWithSnov(query, settings.snov_api_key)

    case 'hunter':
      if (!settings.hunter_api_key) throw new Error('Clé API Hunter.io manquante dans les paramètres')
      return findWithHunter(query, settings.hunter_api_key)

    case 'dropcontact':
      if (!settings.dropcontact_api_key) throw new Error('Clé API Dropcontact manquante dans les paramètres')
      return findWithDropcontact(query, settings.dropcontact_api_key)

    default:
      throw new Error('Aucun outil de recherche de prospects configuré. Va dans Paramètres → Recherche de prospects.')
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function emailStatusToConfidence(status: string | null): number | null {
  const map: Record<string, number> = { verified: 100, likely_to_engage: 75, catchall: 50, unverified: 30 }
  return status ? (map[status] ?? null) : null
}
