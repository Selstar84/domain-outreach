import type { EmailAccount } from '@/types/database'

export interface SlotResult {
  account: EmailAccount
  scheduledFor: Date
}

/**
 * Finds the best email account to use and calculates when to send.
 * Respects daily_limit, hourly_limit, and min_delay_seconds per account.
 */
export function findNextAvailableSlot(
  accounts: EmailAccount[],
  now: Date = new Date()
): SlotResult | null {
  const activeAccounts = accounts.filter((a) => a.is_active && a.is_verified)
  if (activeAccounts.length === 0) return null

  let bestSlot: SlotResult | null = null

  for (const account of activeAccounts) {
    if (account.sent_today >= account.daily_limit) continue

    const slot = calculateNextSlot(account, now)
    if (!bestSlot || slot < bestSlot.scheduledFor) {
      bestSlot = { account, scheduledFor: slot }
    }
  }

  return bestSlot
}

function calculateNextSlot(account: EmailAccount, now: Date): Date {
  const candidates: Date[] = [now]

  // Respect min_delay_seconds
  if (account.last_sent_at) {
    const lastSent = new Date(account.last_sent_at)
    const minNextTime = new Date(lastSent.getTime() + account.min_delay_seconds * 1000)
    candidates.push(minNextTime)
  }

  // Respect hourly_limit: if sent_this_hour >= limit, wait until next hour
  if (account.sent_this_hour >= account.hourly_limit) {
    const nextHour = new Date(now)
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0)
    candidates.push(nextHour)
  }

  return new Date(Math.max(...candidates.map((d) => d.getTime())))
}

/**
 * Spread N emails across available accounts over the day.
 * Returns a list of { accountId, scheduledFor } for each email.
 */
export function scheduleEmailBatch(
  accounts: EmailAccount[],
  count: number,
  startFrom: Date = new Date()
): { accountId: string; scheduledFor: Date }[] {
  const schedule: { accountId: string; scheduledFor: Date }[] = []
  const accountSlots = new Map<string, Date>()

  // Initialize last-sent tracking per account
  for (const acc of accounts) {
    if (acc.is_active && acc.is_verified && acc.sent_today < acc.daily_limit) {
      const initialSlot = acc.last_sent_at
        ? new Date(new Date(acc.last_sent_at).getTime() + acc.min_delay_seconds * 1000)
        : startFrom
      accountSlots.set(acc.id, initialSlot < startFrom ? startFrom : initialSlot)
    }
  }

  for (let i = 0; i < count; i++) {
    // Find account with earliest next slot
    let bestAccountId: string | null = null
    let bestTime: Date | null = null

    for (const [accountId, nextSlot] of accountSlots.entries()) {
      const account = accounts.find((a) => a.id === accountId)!
      const alreadyScheduled = schedule.filter((s) => s.accountId === accountId).length
      if (account.sent_today + alreadyScheduled >= account.daily_limit) continue

      if (!bestTime || nextSlot < bestTime) {
        bestTime = nextSlot
        bestAccountId = accountId
      }
    }

    if (!bestAccountId || !bestTime) break // No capacity left

    schedule.push({ accountId: bestAccountId, scheduledFor: bestTime })

    // Update next available time for this account
    const account = accounts.find((a) => a.id === bestAccountId)!
    const nextTime = new Date(bestTime.getTime() + account.min_delay_seconds * 1000)
    accountSlots.set(bestAccountId, nextTime)
  }

  return schedule
}
