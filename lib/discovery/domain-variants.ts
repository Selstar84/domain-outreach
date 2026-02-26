const TLDS = [
  '.net', '.io', '.co', '.org', '.biz', '.info', '.us',
  '.app', '.ai', '.dev', '.tech', '.online', '.store',
  '.shop', '.co.uk', '.ca', '.de', '.fr', '.es', '.au',
  '.me', '.tv', '.cc', '.mobi', '.pro', '.name',
]

const PREFIXES = [
  'get', 'my', 'the', 'use', 'try', 'go', 'best',
  'top', 'pro', 'hey', 'meet', 'join', 'find', 'one',
  'buy', 'new', 'real', 'web', 'net', 'digital',
]

const SUFFIXES = [
  'app', 'tech', 'hq', 'hub', 'io', 'lab', 'labs',
  'now', 'pro', 'co', 'group', 'inc', 'llc', 'corp',
  'online', 'digital', 'web', 'media', 'agency',
  'solutions', 'services', 'systems', 'network',
]

export interface DomainVariant {
  domain: string
  type: 'same_word_diff_tld' | 'contains_word'
}

export function generateVariants(word: string, sourceDomain: string): DomainVariant[] {
  const variants: DomainVariant[] = []
  const seen = new Set<string>()
  const sourceBase = sourceDomain.toLowerCase()

  function add(domain: string, type: DomainVariant['type']) {
    const d = domain.toLowerCase()
    if (!seen.has(d) && d !== sourceBase) {
      seen.add(d)
      variants.push({ domain: d, type })
    }
  }

  // Same word, different TLD
  for (const tld of TLDS) {
    add(`${word}${tld}`, 'same_word_diff_tld')
  }

  // Prefix + word + .com/.net/.io
  for (const prefix of PREFIXES) {
    add(`${prefix}${word}.com`, 'contains_word')
    add(`${prefix}-${word}.com`, 'contains_word')
    add(`${prefix}${word}.io`, 'contains_word')
  }

  // Word + suffix + .com/.net/.io
  for (const suffix of SUFFIXES) {
    add(`${word}${suffix}.com`, 'contains_word')
    add(`${word}-${suffix}.com`, 'contains_word')
    add(`${word}${suffix}.io`, 'contains_word')
  }

  return variants
}

export function extractWord(domain: string): string {
  // Remove TLD(s)
  const parts = domain.split('.')
  return parts[0].toLowerCase()
}
