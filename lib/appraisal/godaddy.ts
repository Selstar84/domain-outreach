/**
 * GoDaddy GoValue — free domain appraisal, no API key required.
 * https://api.godaddy.com/v1/appraisal/{domain}
 */

export interface GoDaddyAppraisal {
  domain: string
  govalue: number | null   // USD estimated value, null if unavailable
  available: boolean
}

export async function getGoDaddyValue(domain: string): Promise<GoDaddyAppraisal> {
  try {
    const res = await fetch(
      `https://api.godaddy.com/v1/appraisal/${encodeURIComponent(domain)}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; DomainResearch/1.0)',
        },
        signal: AbortSignal.timeout(8000),
      }
    )

    if (!res.ok) {
      return { domain, govalue: null, available: false }
    }

    const data = await res.json()
    const govalue = typeof data.govalue === 'number' && data.govalue > 0
      ? Math.round(data.govalue)
      : null

    return { domain, govalue, available: true }
  } catch {
    return { domain, govalue: null, available: false }
  }
}
