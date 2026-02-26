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

/**
 * Returns the scheduled dates for follow-up steps after an initial email was sent.
 */
export function buildFollowUpSchedule(
  initialSentAt: Date,
  customSequence?: { step: number; delayDays: number }[]
): FollowUpStep[] {
  const sequence = customSequence ?? DEFAULT_SEQUENCE
  return sequence.map(({ step, delayDays }) => ({
    step,
    delayDays,
    scheduledFor: addDays(initialSentAt, delayDays),
  }))
}
