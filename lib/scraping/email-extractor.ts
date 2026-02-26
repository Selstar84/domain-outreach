const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g

const BLOCKED_DOMAINS = [
  'example.com', 'example.org', 'test.com', 'domain.com',
  'email.com', 'yourdomain.com', 'sentry.io', 'wix.com',
]

const BLOCKED_PREFIXES = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'newsletter', 'mailer', 'daemon', 'postmaster', 'webmaster',
  'bounce', 'admin@example', 'info@example',
]

export function extractEmails(html: string): { email: string; confidence: number }[] {
  const found = new Map<string, number>()

  // Find mailto links (highest confidence)
  const mailtoMatches = html.matchAll(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi)
  for (const match of mailtoMatches) {
    const email = match[1].toLowerCase()
    if (isValidEmail(email)) {
      found.set(email, Math.max(found.get(email) ?? 0, 90))
    }
  }

  // Find all emails in text
  const textMatches = html.matchAll(EMAIL_REGEX)
  for (const match of textMatches) {
    const email = match[0].toLowerCase()
    if (isValidEmail(email) && !found.has(email)) {
      found.set(email, 60)
    }
  }

  return Array.from(found.entries())
    .map(([email, confidence]) => ({ email, confidence }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
}

function isValidEmail(email: string): boolean {
  if (!email.includes('@')) return false
  const [prefix, domain] = email.split('@')
  if (!domain || !prefix) return false
  if (BLOCKED_DOMAINS.includes(domain)) return false
  if (BLOCKED_PREFIXES.some((b) => prefix.toLowerCase().startsWith(b))) return false
  if (email.length > 100) return false
  // Filter out image extensions
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(email)) return false
  return true
}
