'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { ArrowLeft, ExternalLink, Linkedin, Facebook, Instagram, Twitter, MessageCircle, Clock, ChevronRight, Ban } from 'lucide-react'
import Link from 'next/link'

type Platform = 'linkedin' | 'facebook' | 'instagram' | 'twitter' | 'whatsapp'

const PLATFORMS: { value: Platform; label: string; icon: React.ReactNode; urlField: string; color: string }[] = [
  { value: 'linkedin', label: 'LinkedIn', icon: <Linkedin className="h-4 w-4" />, urlField: 'linkedin_url', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { value: 'facebook', label: 'Facebook', icon: <Facebook className="h-4 w-4" />, urlField: 'facebook_url', color: 'text-blue-500 bg-blue-50 border-blue-200' },
  { value: 'instagram', label: 'Instagram', icon: <Instagram className="h-4 w-4" />, urlField: 'instagram_url', color: 'text-pink-500 bg-pink-50 border-pink-200' },
  { value: 'twitter', label: 'Twitter/X', icon: <Twitter className="h-4 w-4" />, urlField: 'twitter_url', color: 'text-sky-500 bg-sky-50 border-sky-200' },
  { value: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="h-4 w-4" />, urlField: 'whatsapp_number', color: 'text-green-500 bg-green-50 border-green-200' },
]

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

function getProfileUrl(platform: Platform, value: string): string {
  if (platform === 'whatsapp') {
    return `https://wa.me/${value.replace(/[^0-9]/g, '')}`
  }
  return value.startsWith('http') ? value : `https://${value}`
}

export default function PlatformsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(params)
  const [activePlatform, setActivePlatform] = useState<Platform>('linkedin')
  const [prospects, setProspects] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [dailyStat, setDailyStat] = useState<{ sent: number; limit: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [unsubscribingId, setUnsubscribingId] = useState<string | null>(null)
  const supabase = createClient()

  const platformConfig = PLATFORMS.find(p => p.value === activePlatform)!

  const load = useCallback(async () => {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)

    const [{ data: p }, { data: msgs }, { data: stat }] = await Promise.all([
      supabase
        .from('prospects')
        .select('*')
        .eq('campaign_id', campaignId)
        .not(platformConfig.urlField, 'is', null)
        .neq('status', 'dead')
        .order('priority', { ascending: false }),
      supabase
        .from('outreach_messages')
        .select('prospect_id, channel, sequence_step, status, sent_at')
        .eq('campaign_id', campaignId)
        .eq('channel', activePlatform)
        .neq('status', 'failed'),
      supabase
        .from('social_queue_daily')
        .select('sent_count, daily_limit')
        .eq('date', today)
        .eq('platform', activePlatform)
        .single(),
    ])

    setProspects(p ?? [])
    setMessages(msgs ?? [])
    setDailyStat(stat ? { sent: (stat as any).sent_count, limit: (stat as any).daily_limit } : null)
    setLoading(false)
  }, [campaignId, activePlatform])

  useEffect(() => { load() }, [load])

  // Categorize prospects
  const categorized = (() => {
    const toContact: any[] = []
    const followUpDue: any[] = []
    const contacted: any[] = []

    for (const p of prospects) {
      const prospectMsgs = messages.filter(m => m.prospect_id === p.id)
      const sentMsgs = prospectMsgs.filter(m => m.status === 'sent')
      const maxStep = sentMsgs.length > 0 ? Math.max(...sentMsgs.map(m => m.sequence_step)) : 0
      const lastSent = sentMsgs.length > 0
        ? sentMsgs.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0]
        : null

      if (sentMsgs.length === 0) {
        toContact.push(p)
      } else if (lastSent && maxStep < 3 && daysSince(lastSent.sent_at) >= 4) {
        followUpDue.push({ ...p, _lastSentDays: daysSince(lastSent.sent_at), _nextStep: maxStep + 1 })
      } else {
        contacted.push({ ...p, _maxStep: maxStep, _lastSentDays: lastSent ? daysSince(lastSent.sent_at) : null })
      }
    }

    return { toContact, followUpDue, contacted }
  })()

  async function unsubscribeProspect(prospect: any) {
    if (!confirm(`Marquer "${prospect.domain}" comme "ne plus contacter" ? Tous les messages en attente seront annulés.`)) return
    setUnsubscribingId(prospect.id)
    const res = await fetch(`/api/prospects/${prospect.id}/unsubscribe`, { method: 'POST' })
    setUnsubscribingId(null)
    if (res.ok) {
      toast.success(`${prospect.domain} marqué "ne plus contacter"`)
      load()
    } else {
      toast.error('Erreur')
    }
  }

  const { toContact, followUpDue, contacted } = categorized
  const remaining = dailyStat ? Math.max(0, dailyStat.limit - dailyStat.sent) : null

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href={`/campaigns/${campaignId}/prospects`}>
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Prospects</Button>
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Vue par plateforme</h1>
      </div>

      {/* Platform selector */}
      <div className="flex gap-2 flex-wrap">
        {PLATFORMS.map(p => (
          <button
            key={p.value}
            type="button"
            onClick={() => setActivePlatform(p.value)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
              activePlatform === p.value
                ? p.color + ' border-current shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {p.icon}
            {p.label}
          </button>
        ))}
      </div>

      {/* Daily limit bar */}
      {dailyStat && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {platformConfig.icon}
                <span className="text-sm font-medium text-gray-700">{platformConfig.label} aujourd'hui</span>
              </div>
              <span className="text-sm font-bold text-gray-900">
                {dailyStat.sent} / {dailyStat.limit}
                {remaining === 0
                  ? <span className="ml-1 text-xs text-red-500 font-normal">— Limite atteinte</span>
                  : <span className="ml-1 text-xs text-gray-400 font-normal">({remaining} restants)</span>
                }
              </span>
            </div>
            <Progress
              value={dailyStat.limit > 0 ? Math.min((dailyStat.sent / dailyStat.limit) * 100, 100) : 0}
              className="h-1.5"
            />
          </CardContent>
        </Card>
      )}

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{toContact.length}</p>
            <p className="text-xs text-blue-600 mt-0.5">À contacter</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-orange-700">{followUpDue.length}</p>
            <p className="text-xs text-orange-600 mt-0.5">Relances dues</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-gray-600">{contacted.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">En cours</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : prospects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <p>Aucun prospect avec un profil {platformConfig.label}.</p>
            <p className="text-sm mt-1">Importez des prospects avec leur URL {platformConfig.label} ou lancez un scraping.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">

          {/* À contacter */}
          {toContact.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                À contacter
                <Badge className="bg-blue-100 text-blue-700 border-blue-200">{toContact.length}</Badge>
              </h2>
              <div className="space-y-2">
                {toContact.map(p => {
                  const profileValue = (p as any)[platformConfig.urlField]
                  return (
                    <div key={p.id} className="flex items-center gap-3 bg-white border rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm">{p.domain}</span>
                          {p.company_name && <span className="text-xs text-gray-400">· {p.company_name}</span>}
                          {(p.first_name || p.last_name) && (
                            <span className="text-xs text-gray-500">👤 {[p.first_name, p.last_name].filter(Boolean).join(' ')}</span>
                          )}
                        </div>
                        {profileValue && (
                          <a
                            href={getProfileUrl(activePlatform, profileValue)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-0.5"
                            onClick={e => e.stopPropagation()}
                          >
                            {platformConfig.icon}
                            <span className="truncate max-w-[240px]">{profileValue}</span>
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => unsubscribeProspect(p)}
                          disabled={unsubscribingId === p.id}
                        >
                          <Ban className="h-3 w-3" />
                        </Button>
                        <Link href={`/campaigns/${campaignId}/outreach?prospect=${p.id}&channel=${activePlatform}`}>
                          <Button size="sm" className="gap-1">
                            Générer <ChevronRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Relances dues */}
          {followUpDue.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-orange-500 inline-block" />
                Relances dues
                <Badge className="bg-orange-100 text-orange-700 border-orange-200">{followUpDue.length}</Badge>
              </h2>
              <div className="space-y-2">
                {followUpDue.map(p => {
                  const profileValue = (p as any)[platformConfig.urlField]
                  return (
                    <div key={p.id} className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm">{p.domain}</span>
                          {p.company_name && <span className="text-xs text-gray-400">· {p.company_name}</span>}
                          <span className="flex items-center gap-1 text-xs text-orange-600 font-medium">
                            <Clock className="h-3 w-3" />
                            Il y a {p._lastSentDays} jours
                          </span>
                          <Badge variant="outline" className="text-xs">Étape {p._nextStep}</Badge>
                        </div>
                        {profileValue && (
                          <a
                            href={getProfileUrl(activePlatform, profileValue)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-0.5"
                            onClick={e => e.stopPropagation()}
                          >
                            {platformConfig.icon}
                            <span className="truncate max-w-[240px]">{profileValue}</span>
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => unsubscribeProspect(p)}
                          disabled={unsubscribingId === p.id}
                        >
                          <Ban className="h-3 w-3" />
                        </Button>
                        <Link href={`/campaigns/${campaignId}/outreach?prospect=${p.id}&channel=${activePlatform}&step=${p._nextStep}`}>
                          <Button size="sm" className="gap-1 bg-orange-500 hover:bg-orange-600">
                            Relancer <ChevronRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Contacté (en cours) */}
          {contacted.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-gray-500 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-gray-400 inline-block" />
                Déjà contacté
                <Badge variant="outline" className="text-gray-500">{contacted.length}</Badge>
              </h2>
              <div className="space-y-1.5 opacity-60">
                {contacted.map(p => {
                  const profileValue = (p as any)[platformConfig.urlField]
                  return (
                    <div key={p.id} className="flex items-center gap-3 bg-gray-50 border rounded-lg px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-700 text-sm">{p.domain}</span>
                          {p.company_name && <span className="text-xs text-gray-400">· {p.company_name}</span>}
                          {p._maxStep && <Badge variant="outline" className="text-xs text-gray-500">Étape {p._maxStep}</Badge>}
                          {p._lastSentDays !== null && (
                            <span className="text-xs text-gray-400">Il y a {p._lastSentDays}j</span>
                          )}
                        </div>
                        {profileValue && (
                          <a
                            href={getProfileUrl(activePlatform, profileValue)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:underline flex items-center gap-1 mt-0.5"
                            onClick={e => e.stopPropagation()}
                          >
                            <span className="truncate max-w-[240px]">{profileValue}</span>
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
