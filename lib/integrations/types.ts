// ─── Generic types shared across all integrations ───────────────────────────

export interface ProspectSearchQuery {
  keywords: string[]       // e.g. ["plomberie", "construction"]
  location: string         // e.g. "Calgary, Alberta, Canada"
  titles?: string[]        // e.g. ["CEO", "Owner", "Founder"]
  maxResults?: number
}

export interface FoundProspect {
  name: string | null
  first_name: string | null
  last_name: string | null
  title: string | null
  email: string | null
  email_confidence: number | null   // 0-100
  linkedin_url: string | null
  phone: string | null
  company_name: string | null
  company_website: string | null
}

export interface SocialSendRequest {
  to: string           // phone number, LinkedIn URL, Instagram username, Facebook URL
  message: string      // personalized message body
  prospect_name?: string
}

export interface SocialSendResult {
  success: boolean
  external_id?: string  // ID from the tool (Twilio SID, Apify run ID, etc.)
  error?: string
}

// Settings subset passed to each integration
export interface IntegrationSettings {
  // Prospect discovery
  prospect_finder_tool: 'apollo' | 'snov' | 'hunter' | 'dropcontact' | null

  apollo_api_key: string | null
  snov_api_key: string | null
  hunter_api_key: string | null
  dropcontact_api_key: string | null

  // LinkedIn
  linkedin_tool: 'phantombuster' | 'lemlist' | null
  phantombuster_api_key: string | null
  phantombuster_linkedin_agent_id: string | null
  lemlist_api_key: string | null

  // WhatsApp
  whatsapp_tool: 'twilio' | null
  twilio_account_sid: string | null
  twilio_auth_token: string | null
  twilio_whatsapp_number: string | null

  // Instagram & Facebook (Apify)
  apify_api_key: string | null
  instagram_session_cookie: string | null
  facebook_session_cookie: string | null
}
