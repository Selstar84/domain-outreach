/**
 * Pluggable social message sending layer.
 * Same interface for all channels and all tools.
 * Swap Twilio ↔ Meta API, Phantombuster ↔ Lemlist by changing one setting.
 */
import type { SocialSendRequest, SocialSendResult, IntegrationSettings } from './types'

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────

async function sendWhatsAppViaTwilio(
  req: SocialSendRequest,
  settings: IntegrationSettings,
): Promise<SocialSendResult> {
  const { twilio_account_sid: sid, twilio_auth_token: token, twilio_whatsapp_number: from } = settings
  if (!sid || !token || !from) throw new Error('Credentials Twilio incomplets (SID, Auth Token, numéro)')

  // Normalize number to E.164
  const to = req.to.startsWith('+') ? req.to : `+${req.to}`

  const body = new URLSearchParams({
    From: `whatsapp:${from}`,
    To: `whatsapp:${to}`,
    Body: req.message,
  })

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    },
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { success: false, error: (err as any).message ?? `Twilio error ${res.status}` }
  }
  const data = await res.json()
  return { success: true, external_id: data.sid }
}

export async function sendWhatsApp(req: SocialSendRequest, settings: IntegrationSettings): Promise<SocialSendResult> {
  switch (settings.whatsapp_tool) {
    case 'twilio': return sendWhatsAppViaTwilio(req, settings)
    default: return { success: false, error: 'Aucun outil WhatsApp configuré. Va dans Paramètres → WhatsApp.' }
  }
}

// ─── LINKEDIN ─────────────────────────────────────────────────────────────────

async function sendLinkedInViaPhantombuster(
  req: SocialSendRequest,
  settings: IntegrationSettings,
): Promise<SocialSendResult> {
  const { phantombuster_api_key: apiKey, phantombuster_linkedin_agent_id: agentId } = settings
  if (!apiKey || !agentId) throw new Error('Clé API Phantombuster ou Agent ID manquant')

  const res = await fetch('https://api.phantombuster.com/api/v2/agents/launch', {
    method: 'POST',
    headers: { 'X-Phantombuster-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: agentId,
      argument: JSON.stringify({
        profileUrls: [req.to],
        message: req.message,
        numberOfProfiles: 1,
      }),
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { success: false, error: (err as any).error ?? `Phantombuster error ${res.status}` }
  }
  const data = await res.json()
  return { success: true, external_id: data.containerId }
}

async function sendLinkedInViaLemlist(
  req: SocialSendRequest,
  settings: IntegrationSettings,
): Promise<SocialSendResult> {
  const { lemlist_api_key: apiKey } = settings
  if (!apiKey) throw new Error('Clé API Lemlist manquante')

  // Lemlist LinkedIn DM via their API
  const res = await fetch('https://api.lemlist.com/api/activities', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`:${apiKey}`).toString('base64')}`,
    },
    body: JSON.stringify({
      type: 'linkedinMessage',
      linkedinUrl: req.to,
      message: req.message,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { success: false, error: (err as any).message ?? `Lemlist error ${res.status}` }
  }
  const data = await res.json()
  return { success: true, external_id: data._id }
}

export async function sendLinkedIn(req: SocialSendRequest, settings: IntegrationSettings): Promise<SocialSendResult> {
  switch (settings.linkedin_tool) {
    case 'phantombuster': return sendLinkedInViaPhantombuster(req, settings)
    case 'lemlist': return sendLinkedInViaLemlist(req, settings)
    default: return { success: false, error: 'Aucun outil LinkedIn configuré. Va dans Paramètres → LinkedIn.' }
  }
}

// ─── INSTAGRAM ────────────────────────────────────────────────────────────────

export async function sendInstagram(req: SocialSendRequest, settings: IntegrationSettings): Promise<SocialSendResult> {
  const { apify_api_key: apiKey, instagram_session_cookie: cookie } = settings
  if (!apiKey) return { success: false, error: 'Clé API Apify manquante' }
  if (!cookie) return { success: false, error: 'Cookie de session Instagram manquant — connecte-toi une fois dans les Paramètres' }

  // Extract username from URL (https://instagram.com/username → username)
  const username = req.to
    .replace(/https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/\/$/, '')
    .split('/')[0]

  if (!username) return { success: false, error: 'URL Instagram invalide' }

  const res = await fetch(
    `https://api.apify.com/v2/acts/mikolabs~instagram-bulkdm/runs?token=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernames: [username],
        message: req.message,
        sessionCookie: cookie,
        delayBetweenMessages: randomDelay(30000, 90000),
      }),
    },
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { success: false, error: (err as any).error?.message ?? `Apify error ${res.status}` }
  }
  const data = await res.json()
  return { success: true, external_id: data.data?.id }
}

// ─── FACEBOOK ─────────────────────────────────────────────────────────────────

export async function sendFacebook(req: SocialSendRequest, settings: IntegrationSettings): Promise<SocialSendResult> {
  const { apify_api_key: apiKey, facebook_session_cookie: cookie } = settings
  if (!apiKey) return { success: false, error: 'Clé API Apify manquante' }
  if (!cookie) return { success: false, error: 'Cookie de session Facebook manquant — connecte-toi une fois dans les Paramètres' }

  const res = await fetch(
    `https://api.apify.com/v2/acts/apify~facebook-messenger-sender/runs?token=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageUrls: [req.to],
        message: req.message,
        facebookCookie: cookie,
        delayBetweenMessages: randomDelay(30000, 90000),
      }),
    },
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { success: false, error: (err as any).error?.message ?? `Apify error ${res.status}` }
  }
  const data = await res.json()
  return { success: true, external_id: data.data?.id }
}

// ─── Main router ──────────────────────────────────────────────────────────────

export async function sendSocialMessage(
  channel: 'whatsapp' | 'linkedin' | 'instagram' | 'facebook',
  req: SocialSendRequest,
  settings: IntegrationSettings,
): Promise<SocialSendResult> {
  try {
    switch (channel) {
      case 'whatsapp': return await sendWhatsApp(req, settings)
      case 'linkedin': return await sendLinkedIn(req, settings)
      case 'instagram': return await sendInstagram(req, settings)
      case 'facebook': return await sendFacebook(req, settings)
      default: return { success: false, error: `Canal inconnu: ${channel}` }
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? String(err) }
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min
}
