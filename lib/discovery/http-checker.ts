export interface CheckResult {
  domain: string
  active: boolean
  status: number | null
  error?: string
}

const ACTIVE_STATUSES = [200, 201, 301, 302, 307, 308, 403, 401]

async function checkDomain(domain: string, timeoutMs = 6000): Promise<CheckResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`https://${domain}`, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    clearTimeout(timer)
    return {
      domain,
      active: ACTIVE_STATUSES.includes(res.status),
      status: res.status,
    }
  } catch (e: unknown) {
    clearTimeout(timer)
    // Try HTTP fallback
    try {
      const controller2 = new AbortController()
      const timer2 = setTimeout(() => controller2.abort(), timeoutMs)
      const res = await fetch(`http://${domain}`, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller2.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      })
      clearTimeout(timer2)
      return {
        domain,
        active: ACTIVE_STATUSES.includes(res.status),
        status: res.status,
      }
    } catch {
      return {
        domain,
        active: false,
        status: null,
        error: e instanceof Error ? e.message : 'Unknown error',
      }
    }
  }
}

export async function checkDomainsActive(
  domains: string[],
  concurrency = 15,
  timeoutMs = 6000
): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  for (let i = 0; i < domains.length; i += concurrency) {
    const batch = domains.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map((d) => checkDomain(d, timeoutMs))
    )
    results.push(...batchResults)
  }

  return results
}
