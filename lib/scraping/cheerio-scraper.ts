import * as cheerio from 'cheerio'
import { extractEmails } from './email-extractor'
import { extractSocialLinks, SocialLinks } from './social-extractor'

export interface ScrapeResult {
  company_name: string | null
  website_description: string | null
  emails: { email: string; confidence: number }[]
  social: SocialLinks
  error?: string
}

const SUBPAGES = ['/contact', '/about', '/about-us', '/team', '/contact-us', '/nous-contacter']

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
      },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('html')) return null
    return await res.text()
  } catch {
    clearTimeout(timer)
    return null
  }
}

export async function scrapeDomain(domain: string): Promise<ScrapeResult> {
  const baseUrl = `https://${domain}`
  let combinedHtml = ''

  // Fetch main page
  const mainHtml = await fetchHtml(baseUrl)
  if (!mainHtml) {
    // Try HTTP
    const httpHtml = await fetchHtml(`http://${domain}`)
    if (!httpHtml) {
      return {
        company_name: null,
        website_description: null,
        emails: [],
        social: {
          linkedin_url: null,
          facebook_url: null,
          instagram_url: null,
          twitter_url: null,
          whatsapp_number: null,
          phone: null,
        },
        error: 'Could not fetch page',
      }
    }
    combinedHtml = httpHtml
  } else {
    combinedHtml = mainHtml
  }

  // Extract company name and description from main page
  const $ = cheerio.load(combinedHtml)
  const company_name =
    $('meta[property="og:site_name"]').attr('content') ||
    $('meta[name="application-name"]').attr('content') ||
    $('title').text().split(/[|\-–]/)[0].trim() ||
    null

  const website_description =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    null

  // Fetch subpages in parallel (limited)
  const subpageResults = await Promise.allSettled(
    SUBPAGES.slice(0, 3).map((path) => fetchHtml(`${baseUrl}${path}`))
  )

  for (const result of subpageResults) {
    if (result.status === 'fulfilled' && result.value) {
      combinedHtml += result.value
    }
  }

  const emails = extractEmails(combinedHtml)
  const social = extractSocialLinks(combinedHtml)

  return {
    company_name: company_name?.slice(0, 200) ?? null,
    website_description: website_description?.slice(0, 500) ?? null,
    emails,
    social,
  }
}
