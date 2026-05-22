/**
 * NameBio comparables — past domain sales with similar keyword.
 * Uses NameBio's public search API (no API key required).
 * https://namebio.com
 */

export interface NameBioSale {
  domain: string
  price: number      // USD
  date: string       // YYYY-MM-DD
  venue: string      // Sedo, GoDaddy, Afternic, etc.
  tld: string
}

export interface NameBioResult {
  sales: NameBioSale[]
  total_found: number
  min_price: number | null
  max_price: number | null
  median_price: number | null
  avg_price: number | null
}

export async function searchNameBio(
  keyword: string,
  options: {
    tlds?: string[]          // e.g. ['com', 'net', 'io']
    maxResults?: number
    maxAgeDays?: number      // only sales within N days
    minPrice?: number
  } = {}
): Promise<NameBioResult> {
  const {
    tlds = ['com', 'net', 'io', 'co', 'org'],
    maxResults = 20,
    maxAgeDays = 1095,       // 3 years default
    minPrice = 100,
  } = options

  // NameBio public JSON API endpoint
  const params = new URLSearchParams({
    q: keyword,
    tlds: tlds.map(t => `.${t}`).join(','),
    start: '0',
    limit: String(Math.min(maxResults, 50)),
    ccTlds: 'false',
    sale_time: String(maxAgeDays),
    sale_source: '',
    min_price: String(minPrice),
    max_price: '99999999',
    sort: 'sale_price',
    order: 'desc',
  })

  const res = await fetch(`https://namebio.com/api/v1/sales/search?${params}`, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; DomainResearch/1.0)',
      'Referer': 'https://namebio.com/',
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    // Fallback: try legacy endpoint
    return searchNameBioLegacy(keyword, options)
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) {
    return searchNameBioLegacy(keyword, options)
  }

  const data = await res.json()
  return parseNameBioResponse(data)
}

async function searchNameBioLegacy(
  keyword: string,
  options: {
    tlds?: string[]
    maxResults?: number
    maxAgeDays?: number
    minPrice?: number
  }
): Promise<NameBioResult> {
  const {
    tlds = ['com', 'net', 'io', 'co', 'org'],
    maxResults = 20,
    maxAgeDays = 1095,
    minPrice = 100,
  } = options

  const params = new URLSearchParams({
    q: keyword,
    tlds: tlds.map(t => `.${t}`).join(','),
    start: '0',
    limit: String(Math.min(maxResults, 50)),
    ccTlds: 'false',
    sale_time: String(maxAgeDays),
    min_price: String(minPrice),
    max_price: '99999999',
    sort: 'sale_price',
    order: 'desc',
  })

  const res = await fetch(`https://namebio.com/?${params}`, {
    headers: {
      'Accept': 'application/json, text/javascript, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (compatible; DomainResearch/1.0)',
      'Referer': 'https://namebio.com/',
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) throw new Error(`NameBio error ${res.status}`)

  const text = await res.text()

  // Try JSON parse (AJAX response)
  try {
    const data = JSON.parse(text)
    return parseNameBioResponse(data)
  } catch {
    // If HTML response, extract embedded JSON
    const jsonMatch = text.match(/var\s+nb_data\s*=\s*(\{[\s\S]*?\});/) ||
                      text.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/)
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[1])
      return parseNameBioResponse(data)
    }
    // No data found — return empty result
    return emptyResult()
  }
}

function parseNameBioResponse(data: any): NameBioResult {
  // NameBio can return various formats depending on endpoint version
  const rawSales: any[] = data?.sales ?? data?.results ?? data?.data ?? data?.items ?? []
  const totalFound: number = data?.total ?? data?.count ?? rawSales.length

  const sales: NameBioSale[] = rawSales
    .filter(s => s && (s.price || s.sale_price || s.amount) > 0)
    .map(s => ({
      domain: s.domain ?? s.name ?? '',
      price: Number(s.price ?? s.sale_price ?? s.amount ?? 0),
      date: s.date ?? s.sale_date ?? s.sold_at ?? '',
      venue: s.venue ?? s.source ?? s.marketplace ?? '',
      tld: extractTld(s.domain ?? s.name ?? ''),
    }))
    .filter(s => s.domain && s.price > 0)
    .slice(0, 20)

  return computeStats(sales, totalFound)
}

function computeStats(sales: NameBioSale[], totalFound: number): NameBioResult {
  if (sales.length === 0) return emptyResult()

  const prices = sales.map(s => s.price).sort((a, b) => a - b)
  const mid = Math.floor(prices.length / 2)

  return {
    sales,
    total_found: totalFound,
    min_price: prices[0],
    max_price: prices[prices.length - 1],
    median_price: prices.length % 2 === 0
      ? Math.round((prices[mid - 1] + prices[mid]) / 2)
      : prices[mid],
    avg_price: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
  }
}

function emptyResult(): NameBioResult {
  return { sales: [], total_found: 0, min_price: null, max_price: null, median_price: null, avg_price: null }
}

function extractTld(domain: string): string {
  const parts = domain.split('.')
  return parts.length > 1 ? `.${parts[parts.length - 1]}` : ''
}
