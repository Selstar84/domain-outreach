'use client'

import { use, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import Link from 'next/link'
import { ArrowLeft, Search, Users, Mail, BarChart3 } from 'lucide-react'
import type { Campaign } from '@/types/database'

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [jobProgress, setJobProgress] = useState<{ checked: number; total: number; active: number } | null>(null)
  const [stats, setStats] = useState({ to_contact: 0, contacted: 0, replied: 0, negotiating: 0, sold: 0, dead: 0, with_email: 0 })
  const supabase = createClient()

  async function load() {
    const { data } = await supabase
      .from('campaigns')
      .select('*, owned_domain:owned_domains(*), preferred_email_account:email_accounts(id,email_address,display_name)')
      .eq('id', id)
      .single()
    setCampaign(data)

    // Load prospect stats
    const { data: prospects } = await supabase
      .from('prospects')
      .select('status, email')
      .eq('campaign_id', id)

    if (prospects) {
      setStats({
        to_contact: prospects.filter(p => p.status === 'to_contact').length,
        contacted: prospects.filter(p => p.status === 'contacted').length,
        replied: prospects.filter(p => p.status === 'replied').length,
        negotiating: prospects.filter(p => p.status === 'negotiating').length,
        sold: prospects.filter(p => p.status === 'sold').length,
        dead: prospects.filter(p => p.status === 'dead').length,
        with_email: prospects.filter(p => !!p.email).length,
      })
    }
  }

  useEffect(() => { load() }, [id])

  // Subscribe to discovery job updates via Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`campaign-discovery-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'discovery_jobs',
        filter: `campaign_id=eq.${id}`,
      }, (payload) => {
        const { checked_count, total_variants, active_count, status } = payload.new as any
        setJobProgress({ checked: checked_count, total: total_variants, active: active_count })
        if (status === 'completed') {
          setDiscovering(false)
          setJobProgress(null)
          load()
          toast.success('Discovery terminé !')
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  async function runDiscovery() {
    setDiscovering(true)
    setJobProgress({ checked: 0, total: 0, active: 0 })
    const res = await fetch('/api/discovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: id }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? 'Erreur discovery')
      setDiscovering(false)
      setJobProgress(null)
    } else {
      toast.success(`Discovery terminé : ${data.active} sites actifs trouvés sur ${data.total} vérifiés`)
      setDiscovering(false)
      setJobProgress(null)
      load()
    }
  }

  if (!campaign) return <div className="p-8 text-gray-400">Chargement...</div>

  const ownedDomain = (campaign as any).owned_domain
  const totalProspects = Object.values(stats).reduce((a, b) => a + b, 0) - stats.with_email

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/campaigns"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Retour</Button></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{ownedDomain?.domain}</h1>
            <Badge>{campaign.status}</Badge>
          </div>
          <p className="text-gray-500 mt-1">
            {campaign.asking_price ? `Prix demandé : $${campaign.asking_price.toLocaleString()}` : 'Prix non défini'}
            {' · '}Mot-clé : <span className="font-mono">{ownedDomain?.word}</span>
          </p>
        </div>
      </div>

      {/* Funnel Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="À contacter" value={stats.to_contact} color="blue" />
        <StatCard label="Contactés" value={stats.contacted} color="yellow" />
        <StatCard label="Ont répondu" value={stats.replied} color="purple" />
        <StatCard label="Vendus" value={stats.sold} color="green" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Avec email" value={stats.with_email} color="blue" />
        <StatCard label="En négociation" value={stats.negotiating} color="orange" />
        <StatCard label="Morts/ignorés" value={stats.dead} color="gray" />
      </div>

      {/* Discovery */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" /> Discovery de prospects
          </CardTitle>
          <Button
            onClick={runDiscovery}
            disabled={discovering}
            variant={campaign.discovery_status === 'completed' ? 'outline' : 'default'}
          >
            {discovering ? 'En cours...' : campaign.discovery_status === 'completed' ? '↺ Relancer' : '▶ Lancer le discovery'}
          </Button>
        </CardHeader>
        <CardContent>
          {jobProgress && (
            <div className="space-y-2">
              <Progress value={jobProgress.total > 0 ? (jobProgress.checked / jobProgress.total) * 100 : 0} />
              <p className="text-sm text-gray-500">
                {jobProgress.checked} / {jobProgress.total} domaines vérifiés · {jobProgress.active} sites actifs trouvés
              </p>
            </div>
          )}
          {!jobProgress && campaign.discovery_status === 'completed' && (
            <p className="text-sm text-green-600">✓ Discovery terminé — {campaign.total_prospects} prospects trouvés</p>
          )}
          {!jobProgress && campaign.discovery_status === 'pending' && (
            <p className="text-sm text-gray-400">Lancez le discovery pour trouver les acheteurs potentiels de <strong>{ownedDomain?.domain}</strong></p>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Link href={`/campaigns/${id}/prospects`}>
          <Card className="hover:shadow-sm transition-shadow cursor-pointer">
            <CardContent className="pt-6 flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-500" />
              <div>
                <p className="font-semibold">Prospects</p>
                <p className="text-sm text-gray-500">{campaign.total_prospects} trouvés</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href={`/campaigns/${id}/outreach`}>
          <Card className="hover:shadow-sm transition-shadow cursor-pointer">
            <CardContent className="pt-6 flex items-center gap-3">
              <Mail className="h-8 w-8 text-green-500" />
              <div>
                <p className="font-semibold">Outreach</p>
                <p className="text-sm text-gray-500">Générer et envoyer</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-600', yellow: 'text-yellow-600', purple: 'text-purple-600',
    green: 'text-green-600', orange: 'text-orange-600', gray: 'text-gray-500',
  }
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
