'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Plus, Megaphone, Globe, Users, ChevronRight } from 'lucide-react'
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

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function load() {
    const { data } = await supabase
      .from('campaigns')
      .select('*, owned_domain:owned_domains(*)')
      .order('created_at', { ascending: false })
    setCampaigns(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campagnes</h1>
          <p className="text-gray-500 mt-1">Une campagne par domaine à vendre</p>
        </div>
        <Link href="/campaigns/new">
          <Button><Plus className="h-4 w-4 mr-2" />Nouvelle campagne</Button>
        </Link>
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
          {campaigns.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`}>
              <div className="bg-white border rounded-xl p-5 hover:shadow-sm transition-shadow flex items-center justify-between group cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <Globe className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
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
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
