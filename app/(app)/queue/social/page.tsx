'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ExternalLink, Copy, CheckCircle, Linkedin, Facebook, Instagram, Twitter, MessageCircle, Bell, Clock, Ban } from 'lucide-react'
import type { OutreachMessage } from '@/types/database'

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  linkedin: <Linkedin className="h-4 w-4 text-blue-600" />,
  facebook: <Facebook className="h-4 w-4 text-blue-500" />,
  instagram: <Instagram className="h-4 w-4 text-pink-500" />,
  twitter: <Twitter className="h-4 w-4 text-sky-500" />,
  whatsapp: <MessageCircle className="h-4 w-4 text-green-500" />,
  other: <MessageCircle className="h-4 w-4 text-gray-400" />,
}

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'Twitter/X',
  whatsapp: 'WhatsApp',
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

export default function SocialQueuePage() {
  const [queue, setQueue] = useState<OutreachMessage[]>([])
  const [dueFollowUps, setDueFollowUps] = useState<any[]>([])
  const [platformStats, setPlatformStats] = useState<Record<string, { sent: number; limit: number }>>({})
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [unsubscribingId, setUnsubscribingId] = useState<string | null>(null)
  const supabase = createClient()

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10)

    const [{ data: messages }, { data: dailyRows }, followUpsRes] = await Promise.all([
      supabase
        .from('outreach_messages')
        .select('*, prospect:prospects(id, domain, company_name, linkedin_url, facebook_url, instagram_url, twitter_url, whatsapp_number, campaign_id)')
        .in('channel', ['linkedin', 'facebook', 'instagram', 'whatsapp', 'twitter'])
        .eq('status', 'draft')
        .order('created_at', { ascending: true })
        .limit(50),
      supabase
        .from('social_queue_daily')
        .select('*')
        .eq('date', today),
      fetch('/api/outreach/social/due-followups'),
    ])

    // Filter out messages where the prospect doesn't have the matching social profile
    const filtered = (messages ?? []).filter(msg => {
      const p = (msg as any).prospect
      if (!p) return false
      if (msg.channel === 'linkedin') return !!p.linkedin_url
      if (msg.channel === 'facebook') return !!p.facebook_url
      if (msg.channel === 'instagram') return !!p.instagram_url
      if (msg.channel === 'twitter') return !!p.twitter_url
      if (msg.channel === 'whatsapp') return !!p.whatsapp_number
      return true
    })
    setQueue(filtered)

    // Build per-platform stats map
    const statsMap: Record<string, { sent: number; limit: number }> = {}
    for (const row of (dailyRows ?? [])) {
      statsMap[(row as any).platform] = {
        sent: (row as any).sent_count ?? 0,
        limit: (row as any).daily_limit ?? 15,
      }
    }
    setPlatformStats(statsMap)

    if (followUpsRes.ok) {
      const followUpsData = await followUpsRes.json()
      setDueFollowUps(followUpsData.due ?? [])
    }

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function getPlatformStats(platform: string) {
    return platformStats[platform] ?? { sent: 0, limit: 15 }
  }

  async function markSent(message: OutreachMessage, platform: string) {
    const stats = getPlatformStats(platform)
    if (stats.sent >= stats.limit) {
      toast.error(`Limite ${PLATFORM_LABELS[platform] ?? platform} atteinte (${stats.limit} messages/jour)`)
      return
    }
    setMarkingId(message.id)
    const res = await fetch('/api/outreach/social/mark-sent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: message.id, platform }),
    })
    setMarkingId(null)
    if (res.ok) {
      toast.success('Message marqué comme envoyé !')
      load()
    } else {
      const data = await res.json().catch(() => ({}))
      if (res.status === 429) {
        toast.error(typeof data.error === 'string' ? data.error : `Limite ${platform} atteinte`)
      } else {
        toast.error('Erreur')
      }
    }
  }

  async function markFollowUp(originalMessageId: string, platform: string) {
    const stats = getPlatformStats(platform)
    if (stats.sent >= stats.limit) {
      toast.error(`Limite ${PLATFORM_LABELS[platform] ?? platform} atteinte (${stats.limit} messages/jour)`)
      return
    }
    setMarkingId(originalMessageId)
    const res = await fetch('/api/outreach/social/mark-followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ original_message_id: originalMessageId, platform }),
    })
    setMarkingId(null)
    if (res.ok) {
      toast.success('Relance enregistrée !')
      load()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(typeof data.error === 'string' ? data.error : 'Erreur lors de la relance')
    }
  }

  async function unsubscribe(prospectId: string, domain: string) {
    if (!confirm(`Marquer "${domain}" comme "ne plus contacter" ? Tous les messages en attente seront annulés.`)) return
    setUnsubscribingId(prospectId)
    const res = await fetch(`/api/prospects/${prospectId}/unsubscribe`, { method: 'POST' })
    setUnsubscribingId(null)
    if (res.ok) {
      toast.success(`${domain} marqué "ne plus contacter"`)
      load()
    } else {
      toast.error('Erreur')
    }
  }

  function openProfile(message: any, platform: string) {
    const prospect = message.prospect
    const urls: Record<string, string | null> = {
      linkedin: prospect?.linkedin_url,
      facebook: prospect?.facebook_url,
      instagram: prospect?.instagram_url,
      twitter: prospect?.twitter_url,
      whatsapp: prospect?.whatsapp_number ? `https://wa.me/${prospect.whatsapp_number.replace(/[^0-9]/g, '')}` : null,
    }
    const url = urls[platform]
    if (url) window.open(url, '_blank')
    else toast.error('Profil non disponible')
  }

  // Collect active platforms (those that appear in the queue or have stats)
  const activePlatforms = Array.from(new Set([
    ...Object.keys(platformStats),
    ...queue.map(m => m.channel),
    ...dueFollowUps.map(m => m.channel),
  ])).filter(p => ['linkedin', 'facebook', 'instagram', 'twitter', 'whatsapp'].includes(p))

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">File Sociale</h1>
        <p className="text-gray-500 mt-1">Messages sociaux à envoyer aujourd'hui</p>
      </div>

      {/* Per-platform progress bars */}
      {activePlatforms.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-600">Limite par plateforme aujourd'hui</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-0">
            {activePlatforms.map(platform => {
              const stats = getPlatformStats(platform)
              const pct = stats.limit > 0 ? Math.min((stats.sent / stats.limit) * 100, 100) : 0
              const remaining = Math.max(0, stats.limit - stats.sent)
              return (
                <div key={platform}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      {PLATFORM_ICONS[platform]}
                      <span className="text-sm font-medium text-gray-700">{PLATFORM_LABELS[platform] ?? platform}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900">
                      {stats.sent} / {stats.limit}
                      {remaining === 0 ? (
                        <span className="ml-1 text-xs text-red-500 font-normal">— Limite atteinte</span>
                      ) : (
                        <span className="ml-1 text-xs text-gray-400 font-normal">({remaining} restants)</span>
                      )}
                    </span>
                  </div>
                  <Progress value={pct} className={`h-1.5 ${pct >= 100 ? '[&>div]:bg-red-500' : pct >= 80 ? '[&>div]:bg-orange-500' : ''}`} />
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Due Follow-ups Section */}
      {!loading && dueFollowUps.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-orange-500" />
            <h2 className="text-lg font-semibold text-gray-900">Relances dues</h2>
            <Badge className="bg-orange-100 text-orange-700 border-orange-200">
              {dueFollowUps.length} en attente
            </Badge>
          </div>
          <p className="text-sm text-gray-500">Ces prospects ont été contactés il y a 4+ jours sans réponse. Pensez à les relancer.</p>

          <div className="space-y-3">
            {dueFollowUps.map((msg) => {
              const prospect = msg.prospect
              const days = msg.sent_at ? daysSince(msg.sent_at) : 0
              const stats = getPlatformStats(msg.channel)
              const limitReached = stats.sent >= stats.limit
              return (
                <Card key={msg.id} className="border-orange-200 bg-orange-50/30">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        {PLATFORM_ICONS[msg.channel] ?? PLATFORM_ICONS.other}
                        <span className="font-medium text-gray-900 capitalize">{msg.channel}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-sm text-gray-700 font-medium">{prospect?.domain}</span>
                        {prospect?.company_name && (
                          <span className="text-xs text-gray-400">({prospect.company_name})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Étape {msg.sequence_step + 1}</Badge>
                        <span className="flex items-center gap-1 text-xs text-orange-600 font-medium">
                          <Clock className="h-3 w-3" />
                          Il y a {days} jours
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openProfile(msg, msg.channel)}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />Ouvrir profil
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => markFollowUp(msg.id, msg.channel)}
                        disabled={markingId === msg.id || limitReached}
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {markingId === msg.id ? 'Enregistrement...' : limitReached ? `Limite ${msg.channel} atteinte` : 'Marquer relancé'}
                      </Button>
                      {prospect?.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => unsubscribe(prospect.id, prospect.domain)}
                          disabled={unsubscribingId === prospect.id}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Ban className="h-3 w-3 mr-1" />
                          Ne plus contacter
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Divider between sections */}
      {!loading && dueFollowUps.length > 0 && queue.length > 0 && (
        <div className="border-t pt-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Nouveaux messages à envoyer</h2>
        </div>
      )}

      {/* Draft messages queue */}
      {loading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : queue.length === 0 && dueFollowUps.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-300" />
            <p>Aucun message en attente d'envoi social.</p>
            <p className="text-sm mt-1">Générez des messages depuis les campagnes.</p>
          </CardContent>
        </Card>
      ) : queue.length === 0 ? null : (
        <div className="space-y-4">
          {queue.map((msg) => {
            const prospect = (msg as any).prospect
            const stats = getPlatformStats(msg.channel)
            const limitReached = stats.sent >= stats.limit
            return (
              <Card key={msg.id} className={limitReached ? 'opacity-50' : ''}>
                <CardContent className="pt-5 space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {PLATFORM_ICONS[msg.channel] ?? PLATFORM_ICONS.other}
                      <span className="font-medium text-gray-900 capitalize">{msg.channel}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-sm text-gray-600">{prospect?.domain}</span>
                      {prospect?.company_name && <span className="text-xs text-gray-400">({prospect.company_name})</span>}
                    </div>
                    <Badge variant="outline" className="text-xs">Étape {msg.sequence_step}</Badge>
                  </div>

                  {/* Message preview */}
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {msg.body}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(msg.body).then(() => toast.success('Copié !'))}
                    >
                      <Copy className="h-3 w-3 mr-1" />Copier
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openProfile(msg, msg.channel)}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />Ouvrir profil
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => markSent(msg, msg.channel)}
                      disabled={markingId === msg.id || limitReached}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {markingId === msg.id ? 'Envoi...' : limitReached ? `Limite ${msg.channel} atteinte` : 'Marquer comme envoyé'}
                    </Button>
                    {prospect?.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unsubscribe(prospect.id, prospect.domain)}
                        disabled={unsubscribingId === prospect.id}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Ban className="h-3 w-3 mr-1" />
                        Ne plus contacter
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
