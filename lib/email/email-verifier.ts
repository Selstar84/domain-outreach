import { promises as dns } from 'dns'

export type EmailStatus = 'valid' | 'invalid' | 'risky' | 'catch_all' | 'unknown' | 'unverified'

export async function checkMxRecord(email: string): Promise<boolean> {
  try {
    const domain = email.split('@')[1]
    if (!domain) return false
    const records = await dns.resolveMx(domain)
    return records.length > 0
  } catch {
    return false
  }
}

export async function verifyWithZeroBounce(email: string, apiKey: string): Promise<EmailStatus> {
  try {
    const res = await fetch(
      `https://api.zerobounce.net/v2/validate?api_key=${apiKey}&email=${encodeURIComponent(email)}&ip_address=`,
      { signal: AbortSignal.timeout(10000) }
    )
    const data = await res.json()
    const status = (data.status ?? '').toLowerCase()
    if (status === 'valid') return 'valid'
    if (status === 'invalid') return 'invalid'
    if (status === 'catch-all') return 'catch_all'
    if (['spamtrap', 'abuse', 'do_not_mail'].includes(status)) return 'invalid'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function verifyWithMillionVerifier(email: string, apiKey: string): Promise<EmailStatus> {
  try {
    const res = await fetch(
      `https://api.millionverifier.com/api/v3/?api=${apiKey}&email=${encodeURIComponent(email)}`,
      { signal: AbortSignal.timeout(10000) }
    )
    const data = await res.json()
    const result = (data.result ?? '').toLowerCase()
    if (result === 'ok') return 'valid'
    if (result === 'invalid') return 'invalid'
    if (result === 'catch_all') return 'catch_all'
    if (result === 'disposable') return 'risky'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function verifyEmail(
  email: string,
  opts?: { zbApiKey?: string; mvApiKey?: string }
): Promise<EmailStatus> {
  if (!email || !email.includes('@') || !email.includes('.')) return 'invalid'

  const hasMx = await checkMxRecord(email)
  if (!hasMx) return 'invalid'

  if (opts?.zbApiKey) return verifyWithZeroBounce(email, opts.zbApiKey)
  if (opts?.mvApiKey) return verifyWithMillionVerifier(email, opts.mvApiKey)

  return 'unknown'
}
