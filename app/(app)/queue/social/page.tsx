'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ExternalLink, Copy, CheckCircle, Linkedin, Facebook, Instagram, Twitter, MessageCircle } from 'lucide-react'
import type { OutreachMessage } from '@/types/database'

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  linkedin: <Linkedin className="h-4 w-4 text-blue-600" />,
  facebook: <Facebook className="h-4 w-4 text-blue-500" />,
  instagram: <Instagram className="h-4 w-4 text-pink-500" />,
  twitter: <Twitter className="h-4 w-4 text-sky-500" />,
  whatsapp: <MessageCircle className="h-4 w-4 text-green-500" />,
  other: <MessageCircle className="h-4 w-4 text-gray-400" />,
}

export default function SocialQueuePage() {
  const [queue, setQueue] = useState<OutreachMessage[]>([])
  const [dailyStats, setDailyStats] = useState({ sent: 0, limit: 15 })
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const supabase = createClient()

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10)

    const [{ data: messages }, { data: daily }] = await Promise.all([
      supabase
        .from('outreach_messages')
        .select('*, prospect:prospects(domain, company_name, linkedin_url, facebook_url, instagram_url, twitter_url, whatsapp_number, campaign_id)')
        .in('channel', ['linkedin', 'facebook', 'instagram', 'whatsapp', 'twitter'])
        .eq('status', 'draft')
        .order('created_at', { ascending: true })
        .limit(50),
      supabase
        .from('social_queue_daily')
        .select('*')
        .eq('date', today)
        .single(),
    ])

    setQueue(messages ?? [])
    setDailyStats({ sent: (daily as any)?.sent_count ?? 0, limit: (daily as any)?.daily_limit ?? 15 })
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function markSent(message: OutreachMessage, platform: string) {
    if (dailyStats.sent >= dailyStats.limit) {
      toast.error(`Limite journalière atteinte (${dailyStats.limit} messages)`)
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
      toast.error('Erreur')
    }
  }

  function openProfile(message: OutreachMessage, platform: string) {
    const prospect = (message as any).prospect
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

  const pct = dailyStats.limit > 0 ? Math.min((dailyStats.sent / dailyStats.limit) * 100, 100) : 0

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">File Sociale</h1>
        <p className="text-gray-500 mt-1">Messages sociaux à envoyer aujourd'hui</p>
      </div>

      {/* Daily Progress */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Messages envoyés aujourd'hui</span>
            <span className="text-sm font-bold text-gray-900">{dailyStats.sent} / {dailyStats.limit}</span>
          </div>
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-gray-400 mt-2">
            {dailyStats.limit - dailyStats.sent} messages restants aujourd'hui
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : queue.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-300" />
            <p>Aucun message en attente d'envoi social.</p>
            <p className="text-sm mt-1">Générez des messages depuis les campagnes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {queue.map((msg) => {
            const prospect = (msg as any).prospect
            return (
              <Card key={msg.id} className={dailyStats.sent >= dailyStats.limit ? 'opacity-50' : ''}>
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
                      disabled={markingId === msg.id || dailyStats.sent >= dailyStats.limit}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {markingId === msg.id ? 'Envoi...' : 'Marquer comme envoyé'}
                    </Button>
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
