/**
 * Atom.com domain appraisal — uses the Appraisal API endpoint.
 * Requires a separate appraisal API key from your Atom account.
 */
import { atomAppraisalGet } from '@/lib/atom/client'
import type { AtomAppraisalResponse } from '@/lib/atom/client'

export interface AtomAppraisal {
  domain: string
  estimated_value: number | null   // USD
  min_value: number | null
  max_value: number | null
  grade: string | null             // e.g. "A", "B+", "C"
  score: number | null             // 0-100
  confidence: string | null        // "high" | "medium" | "low"
  available: boolean
}

export async function getAtomAppraisal(
  domain: string,
  appraisalApiKey: string,
): Promise<AtomAppraisal> {
  try {
    const raw = await atomAppraisalGet<AtomAppraisalResponse>(
      '/domain-appraisal',
      appraisalApiKey,
      { domain },
    )

    // Atom may nest the result differently — handle both shapes
    const data = raw.appraisal ?? raw.data ?? raw

    // Extract estimated value from various possible field names
    const estimated_value =
      typeof (data as any).estimated_value === 'number' ? (data as any).estimated_value
      : typeof (data as any).value === 'number' ? (data as any).value
      : typeof raw.estimated_value === 'number' ? raw.estimated_value
      : null

    const min_value = typeof (data as any).min_value === 'number' ? (data as any).min_value : null
    const max_value = typeof (data as any).max_value === 'number' ? (data as any).max_value : null
    const grade = (data as any).grade ?? null
    const score =
      typeof (data as any).score === 'number' ? (data as any).score
      : typeof (data as any).grade_score === 'number' ? (data as any).grade_score
      : null
    const confidence = (data as any).confidence ?? null

    return {
      domain,
      estimated_value: estimated_value !== null ? Math.round(estimated_value) : null,
      min_value: min_value !== null ? Math.round(min_value) : null,
      max_value: max_value !== null ? Math.round(max_value) : null,
      grade,
      score,
      confidence,
      available: true,
    }
  } catch {
    return {
      domain,
      estimated_value: null,
      min_value: null,
      max_value: null,
      grade: null,
      score: null,
      confidence: null,
      available: false,
    }
  }
}
