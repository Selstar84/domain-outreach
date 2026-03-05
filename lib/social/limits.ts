/**
 * Calculates the effective daily social limit, considering warm-up progression.
 * When warm-up is enabled, the limit starts at social_warmup_start_count on
 * social_warmup_start_date and increases by social_warmup_increment every day
 * until it reaches social_daily_limit (the cap).
 */
export function getEffectiveDailyLimit(settings: {
  social_daily_limit: number
  social_warmup_enabled: boolean
  social_warmup_start_date: string | null
  social_warmup_start_count: number
  social_warmup_increment: number
}): number {
  if (!settings.social_warmup_enabled || !settings.social_warmup_start_date) {
    return settings.social_daily_limit
  }
  const start = new Date(settings.social_warmup_start_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  start.setHours(0, 0, 0, 0)
  const daysSince = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000))
  const effective = settings.social_warmup_start_count + daysSince * settings.social_warmup_increment
  return Math.min(effective, settings.social_daily_limit)
}
