import { addDays } from 'date-fns'

export interface FollowUpStep {
  step: number
  scheduledFor: Date
  delayDays: number
}

const DEFAULT_SEQUENCE: { step: number; delayDays: number }[] = [
  { step: 2, delayDays: 4 },
  { step: 3, delayDays: 10 },
]

function skipWeekend(d: Date): Date {
  const day = d.getUTCDay()
  if (day === 6) return addDays(d, 2) // Sat → Mon
  if (day === 0) return addDays(d, 1) // Sun → Mon
  return d
}

export function buildFollowUpSchedule(
  initialSentAt: Date,
  customSequence?: { step: number; delayDays: number }[]
): FollowUpStep[] {
  const sequence = customSequence ?? DEFAULT_SEQUENCE
  return sequence.map(({ step, delayDays }) => ({
    step,
    delayDays,
    scheduledFor: skipWeekend(addDays(initialSentAt, delayDays)),
  }))
}
