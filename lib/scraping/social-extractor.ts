export interface SocialLinks {
  linkedin_url: string | null
  facebook_url: string | null
  instagram_url: string | null
  twitter_url: string | null
  whatsapp_number: string | null
  phone: string | null
}

const SOCIAL_PATTERNS = {
  linkedin: /https?:\/\/(www\.)?linkedin\.com\/(company|in|profile)\/([^"'\s<>?#]+)/gi,
  facebook: /https?:\/\/(www\.)?facebook\.com\/([^"'\s<>?#/]{3,})/gi,
  instagram: /https?:\/\/(www\.)?instagram\.com\/([^"'\s<>?#/]{3,})/gi,
  twitter: /https?:\/\/(www\.)?(twitter|x)\.com\/([^"'\s<>?#/]{3,})/gi,
  whatsapp_link: /https?:\/\/(wa\.me|api\.whatsapp\.com\/send[^"'\s<>]*phone=)([0-9+\s-]{7,20})/gi,
  whatsapp_tel: /(?:whatsapp|wa)[^\d+]*([+]?[0-9]{8,15})/gi,
  phone: /(?:tel:|phone:|tél:|téléphone:)[^\d+]*([+]?[0-9\s.\-()]{8,20})/gi,
}

const BLOCKED_FB = ['sharer', 'share', 'dialog', 'plugins', 'events', 'groups', 'pages/category']
const BLOCKED_LI = ['sharing', 'shareArticle', 'company/linkedin']
const BLOCKED_TW = ['intent', 'share', 'twitter']

export function extractSocialLinks(html: string): SocialLinks {
  const result: SocialLinks = {
    linkedin_url: null,
    facebook_url: null,
    instagram_url: null,
    twitter_url: null,
    whatsapp_number: null,
    phone: null,
  }

  // LinkedIn
  const liMatches = [...html.matchAll(SOCIAL_PATTERNS.linkedin)]
  for (const m of liMatches) {
    const url = m[0]
    if (!BLOCKED_LI.some((b) => url.includes(b))) {
      result.linkedin_url = url.split('?')[0].replace(/\/$/, '')
      break
    }
  }

  // Facebook
  const fbMatches = [...html.matchAll(SOCIAL_PATTERNS.facebook)]
  for (const m of fbMatches) {
    const url = m[0]
    if (!BLOCKED_FB.some((b) => url.includes(b)) && !url.includes('//www.facebook.com/')) {
      result.facebook_url = url.split('?')[0].replace(/\/$/, '')
      break
    }
  }
  // Also catch facebook.com/pagename without www
  if (!result.facebook_url) {
    const fbMatches2 = [...html.matchAll(SOCIAL_PATTERNS.facebook)]
    for (const m of fbMatches2) {
      const url = m[0]
      if (!BLOCKED_FB.some((b) => url.includes(b))) {
        result.facebook_url = url.split('?')[0].replace(/\/$/, '')
        break
      }
    }
  }

  // Instagram
  const igMatches = [...html.matchAll(SOCIAL_PATTERNS.instagram)]
  if (igMatches.length > 0) {
    result.instagram_url = igMatches[0][0].split('?')[0].replace(/\/$/, '')
  }

  // Twitter/X
  const twMatches = [...html.matchAll(SOCIAL_PATTERNS.twitter)]
  for (const m of twMatches) {
    const url = m[0]
    if (!BLOCKED_TW.some((b) => url.includes(b))) {
      result.twitter_url = url.split('?')[0].replace(/\/$/, '')
      break
    }
  }

  // WhatsApp
  const waLinkMatches = [...html.matchAll(SOCIAL_PATTERNS.whatsapp_link)]
  if (waLinkMatches.length > 0) {
    const number = waLinkMatches[0][2]?.replace(/[^0-9+]/g, '')
    if (number && number.length >= 8) result.whatsapp_number = number
  }
  if (!result.whatsapp_number) {
    const waTelMatches = [...html.matchAll(SOCIAL_PATTERNS.whatsapp_tel)]
    if (waTelMatches.length > 0) {
      const number = waTelMatches[0][1]?.replace(/[^0-9+]/g, '')
      if (number && number.length >= 8) result.whatsapp_number = number
    }
  }

  // Phone
  const phoneMatches = [...html.matchAll(SOCIAL_PATTERNS.phone)]
  if (phoneMatches.length > 0) {
    result.phone = phoneMatches[0][1]?.trim() ?? null
  }

  return result
}
