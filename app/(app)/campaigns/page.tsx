'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import Link from 'next/link'
import { Plus, Megaphone, Globe, Users, ChevronRight, Pause, Play, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { Campaign } from '@/types/database'

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-gray-100 text-gray-700',
}

const discoveryColors: Record<string, string> = {
  pending: 'text-gray-400',
  running: 'text-blue-500 animate-pulse',
  completed: 'text-green-600',
  failed: 'text-red-500',
}

const CHANNELS = [
  { key: 'email',     emoji: '📧', field: 'email' },
  { key: 'linkedin',  emoji: '💼', field: 'linkedin_url' },
  { key: 'instagram', emoji: '📸', field: 'instagram_url' },
  { key: 'facebook',  emoji: '👤', field: 'facebook_url' },
  { key: 'twitter',   emoji: '🐦', field: 'twitter_url' },
  { key: 'whatsapp',  emoji: '💬', field: 'whatsapp_number' },
]

type ChannelStat = { total: number; contacted: number; queued: number }
type CampaignChannelStats = Record<string, Record<string, ChannelStat>>

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [channelStats, setChannelStats] = useState<CampaignChannelStats>({})
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null)
  const supabase = createClient()

  async function load() {
    const { data } = await supabase
      .from('campaigns')
      .select('*, owned_domain:owned_domains(*)')
      .order('created_at', { ascending: false })
    const campaigns = data ?? []
    setCampaigns(campaigns)
    setLoading(false)

    if (campaigns.length === 0) return
    const ids = campaigns.map(c => c.id)

    // Fetch prospects channel fields
    const { data: prospects } = await supabase
      .from('prospects')
      .select('campaign_id, email, linkedin_url, instagram_url, facebook_url, twitter_url, whatsapp_number')
      .in('campaign_id', ids)
      .neq('status', 'dead')

    // Fetch sent + queued messages per channel
    const { data: msgs } = await supabase
      .from('outreach_messages')
      .select('campaign_id, channel, prospect_id, status')
      .in('campaign_id', ids)
      .in('status', ['sent', 'queued'])

    // Build stats
    const stats: CampaignChannelStats = {}
    for (const cid of ids) {
      stats[cid] = {}
      const cProspects = (prospects ?? []).filter(p => p.campaign_id === cid)
      const cMsgs = (msgs ?? []).filter(m => m.campaign_id === cid)

      for (const ch of CHANNELS) {
        const total = cProspects.filter(p => !!(p as any)[ch.field]).length
        if (total === 0) continue
        const sentIds = new Set(cMsgs.filter(m => m.channel === ch.key && m.status === 'sent').map(m => m.prospect_id))
        const queuedIds = new Set(cMsgs.filter(m => m.channel === ch.key && m.status === 'queued').map(m => m.prospect_id))
        stats[cid][ch.key] = { total, contacted: sentIds.size, queued: queuedIds.size }
      }
    }
    setChannelStats(stats)
  }

  useEffect(() => { load() }, [])

  async function togglePause(c: Campaign, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    const newStatus = c.status === 'paused' ? 'active' : 'paused'
    setActionLoading(c.id)
    try {
      const res = await fetch(`/api/campaigns/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) { toast.error('Erreur mise à jour'); return }
      toast.success(newStatus === 'paused' ? 'Campagne mise en pause' : 'Campagne reprise')
      setCampaigns(prev => prev.map(x => x.id === c.id ? { ...x, status: newStatus } : x))
    } finally { setActionLoading(null) }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setActionLoading(deleteTarget.id)
    try {
      const res = await fetch(`/api/campaigns/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erreur suppression'); return }
      toast.success('Campagne supprimée')
      setCampaigns(prev => prev.filter(x => x.id !== deleteTarget.id))
    } finally { setActionLoading(null); setDeleteTarget(null) }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campagnes</h1>
          <p className="text-gray-500 mt-1">Une campagne par domaine à vendre</p>
        </div>
        <div className="flex gap-2">
          <Link href="/bulk-import">
            <Button variant="outline"><Upload className="h-4 w-4 mr-2" />Import en masse</Button>
          </Link>
          <Link href="/campaigns/new">
            <Button><Plus className="h-4 w-4 mr-2" />Nouvelle campagne</Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Megaphone className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Aucune campagne. Créez-en une pour commencer.</p>
            <Link href="/campaigns/new">
              <Button className="mt-4"><Plus className="h-4 w-4 mr-2" />Créer une campagne</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const cStats = channelStats[c.id] ?? {}
            return (
              <div key={c.id} className="bg-white border rounded-xl p-5 hover:shadow-sm transition-shadow flex items-center justify-between group">
                <Link href={`/campaigns/${c.id}`} className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer">
                  <div className="bg-blue-50 rounded-lg p-3 shrink-0">
                    <Globe className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{(c as any).owned_domain?.domain}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[c.status]}`}>{c.status}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {c.total_prospects} prospects
                      </span>
                      {c.asking_price && <span>${c.asking_price.toLocaleString()}</span>}
                      <span className={`${discoveryColors[c.discovery_status]} text-xs`}>
                        {c.discovery_status === 'running' ? '⟳ Discovery en cours...' :
                         c.discovery_status === 'completed' ? '✓ Discovery terminé' :
                         c.discovery_status === 'pending' ? 'Discovery non lancé' : '✗ Erreur discovery'}
                      </span>
                    </div>
                    {/* Channel progress pills */}
                    {Object.keys(cStats).length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {CHANNELS.filter(ch => cStats[ch.key]).map(ch => {
                          const s = cStats[ch.key]
                          const done = s.contacted >= s.total
                          const started = s.contacted > 0 || s.queued > 0
                          return (
                            <span
                              key={ch.key}
                              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${
                                done
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : started
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-gray-50 text-gray-500 border-gray-200'
                              }`}
                              title={`${ch.key}: ${s.contacted} envoyés, ${s.queued} planifiés / ${s.total} total`}
                            >
                              {ch.emoji}
                              <span>{s.contacted}/{s.total}</span>
                              {s.queued > 0 && !done && <span className="text-blue-400">+{s.queued}</span>}
                              {done && <span>✓</span>}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </Link>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <Button
                    variant="ghost" size="sm"
                    onClick={(e) => togglePause(c, e)}
                    disabled={actionLoading === c.id || c.status === 'completed'}
                    className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700"
                    title={c.status === 'paused' ? 'Reprendre' : 'Mettre en pause'}
                  >
                    {c.status === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(c) }}
                    disabled={actionLoading === c.id}
                    className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                    title="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Link href={`/campaigns/${c.id}`}>
                    <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette campagne ?</AlertDialogTitle>
            <AlertDialogDescription>
              La campagne <strong>{(deleteTarget as any)?.owned_domain?.domain ?? deleteTarget?.id}</strong> et tous ses prospects et messages seront supprimés définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
