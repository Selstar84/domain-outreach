export interface SocialLinks {
  linkedin_url: string | null
  facebook_url: string | null
  instagram_url: string | null
  twitter_url: string | null
  whatsapp_number: string | null
  phone: string | null
}

const SOCIAL_PATTERNS = {
  // Facebook: www, m, fb.com, l.facebook (redirect links)
  facebook: /https?:\/\/(www\.|m\.|l\.|mbasic\.)?facebook\.com\/(?!share|sharer|dialog|plugins|events\/|groups\/|pages\/category|photo|video|watch|reels|login|help)([^"'\s<>?#/]{3,})/gi,
  // Also catch fb.com short links
  fb_short: /https?:\/\/(www\.)?fb\.com\/([^"'\s<>?#/]{3,})/gi,
  // LinkedIn
  linkedin: /https?:\/\/(www\.)?linkedin\.com\/(company|in|profile)\/([^"'\s<>?#]+)/gi,
  // Instagram
  instagram: /https?:\/\/(www\.)?instagram\.com\/(?!p\/|reel\/|explore\/|accounts\/|tv\/)([^"'\s<>?#/]{3,})/gi,
  // Twitter / X
  twitter: /https?:\/\/(www\.)?(twitter|x)\.com\/(?!intent|share|home|i\/|hashtag|search)([^"'\s<>?#/]{3,})/gi,
  // WhatsApp — only wa.me/ links are reliable (avoids false positives from phone numbers near "WhatsApp" text)
  whatsapp_link: /https?:\/\/wa\.me\/([0-9]{7,15})/gi,
  whatsapp_api: /https?:\/\/api\.whatsapp\.com\/send\?[^"'\s<>]*phone=([0-9]{7,15})/gi,
  // Phone
  phone: /(?:tel:|phone:|tél:|téléphone:)[^\d+]*([+]?[0-9\s.\-()]{8,20})/gi,
}

// Known share/widget domains to skip
const BLOCKED_FB_PATHS = ['sharer', 'share', 'dialog', 'plugins', 'events/', 'groups/', 'pages/category', 'photo', 'video', 'watch', 'reels', 'login', 'help']
const BLOCKED_LI = ['sharing', 'shareArticle', 'company/linkedin']
const BLOCKED_TW = ['intent', 'share', 'twitter', 'home', 'i/']

function cleanUrl(url: string): string {
  return url.split('?')[0].replace(/\/$/, '').replace(/\/$/, '')
}

export function extractSocialLinks(html: string): SocialLinks {
  const result: SocialLinks = {
    linkedin_url: null,
    facebook_url: null,
    instagram_url: null,
    twitter_url: null,
    whatsapp_number: null,
    phone: null,
  }

  // --- Facebook ---
  const fbMatches = [...html.matchAll(SOCIAL_PATTERNS.facebook)]
  for (const m of fbMatches) {
    const url = m[0]
    const path = m[2] ?? ''
    if (!BLOCKED_FB_PATHS.some((b) => url.toLowerCase().includes(b)) && path.length >= 3) {
      result.facebook_url = cleanUrl(url)
      break
    }
  }
  // Also try fb.com short links
  if (!result.facebook_url) {
    const fbShort = [...html.matchAll(SOCIAL_PATTERNS.fb_short)]
    if (fbShort.length > 0) {
      result.facebook_url = cleanUrl(fbShort[0][0])
    }
  }

  // --- LinkedIn ---
  const liMatches = [...html.matchAll(SOCIAL_PATTERNS.linkedin)]
  for (const m of liMatches) {
    const url = m[0]
    if (!BLOCKED_LI.some((b) => url.includes(b))) {
      result.linkedin_url = cleanUrl(url)
      break
    }
  }

  // --- Instagram ---
  const igMatches = [...html.matchAll(SOCIAL_PATTERNS.instagram)]
  for (const m of igMatches) {
    const url = m[0]
    const handle = m[2] ?? ''
    // Skip generic/blocked handles
    if (handle.length >= 3 && !['p', 'reel', 'explore', 'accounts', 'tv'].includes(handle)) {
      result.instagram_url = cleanUrl(url)
      break
    }
  }

  // --- Twitter/X ---
  const twMatches = [...html.matchAll(SOCIAL_PATTERNS.twitter)]
  for (const m of twMatches) {
    const url = m[0]
    if (!BLOCKED_TW.some((b) => url.includes(b))) {
      result.twitter_url = cleanUrl(url)
      break
    }
  }

  // --- WhatsApp (wa.me links only — no text-based phone detection) ---
  const waLinkMatches = [...html.matchAll(SOCIAL_PATTERNS.whatsapp_link)]
  if (waLinkMatches.length > 0) {
    const number = waLinkMatches[0][1]?.replace(/[^0-9]/g, '')
    // E.164 valid: 7–15 digits total
    if (number && number.length >= 7 && number.length <= 15) {
      result.whatsapp_number = '+' + number
    }
  }
  if (!result.whatsapp_number) {
    const waApiMatches = [...html.matchAll(SOCIAL_PATTERNS.whatsapp_api)]
    if (waApiMatches.length > 0) {
      const number = waApiMatches[0][1]?.replace(/[^0-9]/g, '')
      if (number && number.length >= 7 && number.length <= 15) {
        result.whatsapp_number = '+' + number
      }
    }
  }

  // --- Phone ---
  const phoneMatches = [...html.matchAll(SOCIAL_PATTERNS.phone)]
  if (phoneMatches.length > 0) {
    result.phone = phoneMatches[0][1]?.trim() ?? null
  }

  return result
}
