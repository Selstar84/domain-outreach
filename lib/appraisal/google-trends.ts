/**
 * Google Trends data for a keyword.
 * Uses google-trends-api (unofficial, no API key required).
 */

// Dynamic import to avoid issues with module format
let googleTrends: any = null

async function getGoogleTrends() {
  if (!googleTrends) {
    googleTrends = (await import('google-trends-api')).default
  }
  return googleTrends
}

export interface TrendPoint {
  date: string    // YYYY-MM
  value: number   // 0-100
}

export interface TrendsResult {
  keyword: string
  geo: string
  points: TrendPoint[]
  current_interest: number   // 0-100, last month
  avg_interest: number       // 0-100, last 12 months
  direction: 'rising' | 'falling' | 'stable' | 'unknown'
  direction_pct: number      // % change from first half to second half of period
}

export async function getKeywordTrends(
  keyword: string,
  geo: string = '',   // '' = worldwide, 'US', 'CA', 'FR', etc.
): Promise<TrendsResult> {
  try {
    const trends = await getGoogleTrends()

    const raw = await trends.interestOverTime({
      keyword,
      geo,
      startTime: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 12 months ago
      endTime: new Date(),
      granularTime: 'month',
    })

    const parsed = JSON.parse(raw)
    const timelineData: any[] = parsed?.default?.timelineData ?? []

    const points: TrendPoint[] = timelineData
      .filter(p => p.value?.[0] !== undefined)
      .map(p => ({
        date: new Date(p.time * 1000).toISOString().slice(0, 7), // YYYY-MM
        value: Number(p.value[0]),
      }))

    if (points.length === 0) {
      return unknownResult(keyword, geo)
    }

    const values = points.map(p => p.value)
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    const current = values[values.length - 1] ?? 0

    // Compare first half vs second half to determine direction
    const half = Math.floor(values.length / 2)
    const firstHalf = values.slice(0, half)
    const secondHalf = values.slice(half)
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
    const changePct = avgFirst > 0 ? Math.round(((avgSecond - avgFirst) / avgFirst) * 100) : 0

    let direction: TrendsResult['direction'] = 'stable'
    if (changePct >= 15) direction = 'rising'
    else if (changePct <= -15) direction = 'falling'

    return {
      keyword,
      geo,
      points,
      current_interest: current,
      avg_interest: avg,
      direction,
      direction_pct: changePct,
    }
  } catch (err: any) {
    console.warn(`[google-trends] Failed for "${keyword}":`, err?.message ?? err)
    return unknownResult(keyword, geo)
  }
}

function unknownResult(keyword: string, geo: string): TrendsResult {
  return {
    keyword,
    geo,
    points: [],
    current_interest: 0,
    avg_interest: 0,
    direction: 'unknown',
    direction_pct: 0,
  }
}
