export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type DomainStatus = 'active' | 'sold' | 'paused'
export type CampaignStatus = 'active' | 'paused' | 'completed'
export type DiscoveryStatus = 'pending' | 'running' | 'completed' | 'failed'
export type ScrapeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
export type ProspectStatus = 'to_contact' | 'contacted' | 'replied' | 'negotiating' | 'sold' | 'dead' | 'skipped'
export type DomainType = 'same_word_diff_tld' | 'contains_word' | 'other'
export type MessageChannel = 'email' | 'linkedin' | 'facebook' | 'instagram' | 'whatsapp' | 'twitter' | 'other'
export type MessageStatus = 'draft' | 'queued' | 'scheduled' | 'sending' | 'sent' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'failed'
export type EmailProvider = 'resend' | 'brevo' | 'smtp'
export type EmailSource = 'scraped' | 'hunter' | 'whois' | 'manual'
export type QueueStatus = 'pending' | 'processing' | 'sent' | 'failed'

export interface OwnedDomain {
  id: string
  user_id: string
  domain: string
  word: string
  asking_price: number | null
  notes: string | null
  status: DomainStatus
  created_at: string
  updated_at: string
}

export interface EmailAccount {
  id: string
  user_id: string
  provider: EmailProvider
  email_address: string
  display_name: string
  resend_api_key: string | null
  resend_domain: string | null
  brevo_api_key: string | null
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_password_encrypted: string | null
  smtp_secure: boolean
  daily_limit: number
  hourly_limit: number
  min_delay_seconds: number
  sent_today: number
  sent_this_hour: number
  last_sent_at: string | null
  is_active: boolean
  is_verified: boolean
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  user_id: string
  owned_domain_id: string
  name: string
  status: CampaignStatus
  asking_price: number | null
  discovery_status: DiscoveryStatus
  discovery_started_at: string | null
  discovery_completed_at: string | null
  total_prospects: number
  preferred_email_account_id: string | null
  email_subject_template: string | null
  created_at: string
  updated_at: string
  // Joined
  owned_domain?: OwnedDomain
  preferred_email_account?: EmailAccount
}

export interface Prospect {
  id: string
  campaign_id: string
  user_id: string
  domain: string
  tld: string
  domain_type: DomainType
  website_active: boolean | null
  http_status: number | null
  company_name: string | null
  owner_name: string | null
  email: string | null
  email_source: EmailSource | null
  email_confidence: number | null
  phone: string | null
  linkedin_url: string | null
  facebook_url: string | null
  instagram_url: string | null
  twitter_url: string | null
  whatsapp_number: string | null
  website_description: string | null
  scrape_status: ScrapeStatus
  scrape_attempted_at: string | null
  scrape_completed_at: string | null
  scrape_error: string | null
  status: ProspectStatus
  priority: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface OutreachMessage {
  id: string
  prospect_id: string
  campaign_id: string
  user_id: string
  channel: MessageChannel
  sequence_step: number
  subject: string | null
  body: string
  ai_generated: boolean
  ai_variant: number | null
  email_account_id: string | null
  resend_email_id: string | null
  status: MessageStatus
  scheduled_for: string | null
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  replied_at: string | null
  bounced_at: string | null
  sent_by_user: boolean
  social_platform_used: string | null
  created_at: string
  updated_at: string
  // Joined
  prospect?: Prospect
  email_account?: EmailAccount
}

export interface EmailSendQueue {
  id: string
  user_id: string
  outreach_message_id: string
  email_account_id: string
  priority: number
  status: QueueStatus
  scheduled_for: string
  attempts: number
  last_error: string | null
  created_at: string
  // Joined
  outreach_message?: OutreachMessage
  email_account?: EmailAccount
}

export interface FollowUpSequence {
  id: string
  campaign_id: string
  step_number: number
  delay_days: number
  channel: MessageChannel
  subject_template: string | null
  body_template: string | null
  is_active: boolean
  created_at: string
}

export interface DiscoveryJob {
  id: string
  campaign_id: string
  user_id: string
  status: DiscoveryStatus
  total_variants: number
  checked_count: number
  active_count: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface SocialQueueDaily {
  id: string
  user_id: string
  date: string
  sent_count: number
  daily_limit: number
  created_at: string
}

export interface Settings {
  id: string
  user_id: string
  whoisxml_api_key: string | null
  hunter_api_key: string | null
  anthropic_api_key: string | null
  social_daily_limit: number
  email_daily_limit_global: number
  check_timeout_ms: number
  created_at: string
  updated_at: string
}

export interface CampaignStats {
  total_prospects: number
  active_sites: number
  with_email: number
  contacted: number
  replied: number
  negotiating: number
  sold: number
}
