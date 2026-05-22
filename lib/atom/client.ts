/**
 * Atom.com Marketplace API client
 * Base URL: https://www.atom.com/api/marketplace/
 * Docs:     https://www.atom.com/api-docs/index.php
 *
 * Two separate keys:
 *  - atom_api_key          → all Seller endpoints
 *  - atom_appraisal_api_key → Appraisal endpoints only
 */

export const ATOM_BASE = 'https://www.atom.com/api/marketplace'

/**
 * Generic GET wrapper for Atom Seller APIs.
 * Throws on HTTP errors; returns parsed JSON.
 */
export async function atomGet<T = unknown>(
  path: string,
  apiKey: string,
  params: Record<string, string | number | undefined> = {},
  timeoutMs = 10_000,
): Promise<T> {
  const url = new URL(`${ATOM_BASE}${path}`)
  url.searchParams.set('api_key', apiKey)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v))
  }

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DomainOutreach/1.0',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Atom API ${path} → HTTP ${res.status}: ${body.slice(0, 200)}`)
  }

  return res.json() as Promise<T>
}

/**
 * GET wrapper for Atom Appraisal API (separate key param name).
 */
export async function atomAppraisalGet<T = unknown>(
  path: string,
  appraisalKey: string,
  params: Record<string, string | number | undefined> = {},
  timeoutMs = 10_000,
): Promise<T> {
  const url = new URL(`${ATOM_BASE}${path}`)
  url.searchParams.set('appraisal_api_key', appraisalKey)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v))
  }

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DomainOutreach/1.0',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Atom Appraisal ${path} → HTTP ${res.status}: ${body.slice(0, 200)}`)
  }

  return res.json() as Promise<T>
}

// ── Typed response shapes ────────────────────────────────────────────────────

export interface AtomDomain {
  domain: string
  listing_id?: string
  id?: string | number
  price?: number | string
  asking_price?: number | string
  category?: string
  status?: string
  description?: string
  tld?: string
  views?: number
  created_at?: string
}

export interface AtomDomainsResponse {
  domains?: AtomDomain[]
  data?: AtomDomain[]
  total?: number
  status?: string
}

export interface AtomAnalytics {
  domain?: string
  views?: number
  total_views?: number
  clicks?: number
  leads?: number
  offers?: number
  last_viewed?: string
  period?: string
}

export interface AtomAnalyticsResponse {
  analytics?: AtomAnalytics
  data?: AtomAnalytics
  domain?: string
  views?: number
  status?: string
}

export interface AtomAppraisalData {
  domain?: string
  estimated_value?: number
  value?: number
  price?: number
  min_value?: number
  max_value?: number
  confidence?: string
  grade?: string
  score?: number
  factors?: Record<string, unknown>
  status?: string
}

export interface AtomAppraisalResponse {
  appraisal?: AtomAppraisalData
  data?: AtomAppraisalData
  estimated_value?: number
  domain?: string
  status?: string
}

export interface AtomSale {
  domain: string
  price: number | string
  sale_price?: number | string
  sold_price?: number | string
  date?: string
  sold_at?: string
  buyer?: string
  venue?: string
  tld?: string
}

export interface AtomSalesResponse {
  sales?: AtomSale[]
  data?: AtomSale[]
  total?: number
  status?: string
}

export interface AtomGradeResult {
  domain?: string
  grade?: string
  score?: number
  grade_score?: number
  status?: string
}

export interface AtomGradeResponse {
  results?: AtomGradeResult[]
  data?: AtomGradeResult[]
  status?: string
}
