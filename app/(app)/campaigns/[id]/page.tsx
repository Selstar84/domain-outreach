'use client'

import { use, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Search, Users, Mail, Rocket, Sparkles, Save } from 'lucide-react'
import type { Campaign } from '@/types/database'

interface TemplateStep {
  step: number
  label: string
  subject: string
  body: string
  delay_days: number
}

const DEFAULT_TEMPLATES: TemplateStep[] = [
  { step: 1, label: 'Email initial', subject: '', body: '', delay_days: 0 },
  { step: 2, label: 'Relance J+4', subject: '', body: '', delay_days: 4 },
  { step: 3, label: 'Dernière relance J+10', subject: '', body: '', delay_days: 10 },
]

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [jobProgress, setJobProgress] = useState<{ checked: number; total: number; active: number } | null>(null)
  const [stats, setStats] = useState({ to_contact: 0, contacted: 0, replied: 0, negotiating: 0, sold: 0, dead: 0, with_email: 0 })
  const [templates, setTemplates] = useState<TemplateStep[]>(DEFAULT_TEMPLATES)
  const [stepCount, setStepCount] = useState(2)
  const [generatingTemplates, setGeneratingTemplates] = useState(false)
  const [savingTemplates, setSavingTemplates] = useState(false)
  const [launching, setLaunching] = useState(false)
  const supabase = createClient()

  async function load() {
    const { data } = await supabase
      .from('campaigns')
      .select('*, owned_domain:owned_domains(*), preferred_email_account:email_accounts(id,email_address,display_name)')
      .eq('id', id)
      .single()
    setCampaign(data)

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

    // Load saved templates (step 1 is stored separately, follow-ups in follow_up_sequences)
    const res = await fetch(`/api/campaigns/${id}/sequence`)
    if (res.ok) {
      const { steps } = await res.json()
      if (steps && steps.length > 0) {
        const followUpCount = steps.filter((s: any) => s.step_number >= 2).length
        if (followUpCount > 0) setStepCount(followUpCount)
        setTemplates(DEFAULT_TEMPLATES.map(t => {
          const saved = steps.find((s: any) => s.step_number === t.step)
          return saved
            ? { ...t, subject: saved.subject_template ?? '', body: saved.body_template ?? '', delay_days: saved.delay_days }
            : t
        }))
      }
    }
  }

  async function generateTemplates() {
    setGeneratingTemplates(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/sequence/generate-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepCount: stepCount + 1 }), // +1 to include step 1
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Erreur génération'); return }
      setTemplates(prev => prev.map(t => {
        const generated = data.templates.find((g: any) => g.step === t.step)
        return generated ? { ...t, subject: generated.subject, body: generated.body } : t
      }))
      toast.success('Templates générés — modifie-les si nécessaire puis sauvegarde')
    } finally {
      setGeneratingTemplates(false)
    }
  }

  async function saveTemplates() {
    setSavingTemplates(true)
    try {
      const activeTemplates = templates.filter(t => t.step === 1 || t.step <= stepCount + 1)
      const res = await fetch(`/api/campaigns/${id}/sequence`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templates: activeTemplates.map(t => ({
            step: t.step,
            subject: t.subject,
            body: t.body,
            delay_days: t.delay_days,
          })),
        }),
      })
      if (!res.ok) { toast.error('Erreur sauvegarde'); return }
      toast.success('Templates sauvegardés')
    } finally {
      setSavingTemplates(false)
    }
  }

  async function launchCampaign() {
    setLaunching(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/launch`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Erreur lancement'); return }
      const firstDate = data.first_send ? new Date(data.first_send).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '9h'
      const lastDate = data.last_send ? new Date(data.last_send).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''
      const daysMsg = data.total_days > 1 ? ` sur ${data.total_days} jours (${data.daily_limit}/jour, du ${firstDate} au ${lastDate})` : ` — envoi le ${firstDate} à 9h`
      toast.success(`🚀 ${data.queued} email${data.queued > 1 ? 's' : ''} planifié${data.queued > 1 ? 's' : ''}${daysMsg}`)
      load()
    } finally {
      setLaunching(false)
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
      toast.error(typeof data.error === 'string' ? data.error : 'Erreur discovery')
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
                <p className="font-semibold">Outreach manuel</p>
                <p className="text-sm text-gray-500">Générer et envoyer</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Auto-send Templates */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Templates d'emails automatiques
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={generateTemplates} disabled={generatingTemplates}>
              {generatingTemplates ? 'Génération...' : <><Sparkles className="h-3.5 w-3.5 mr-1" />Générer avec l'IA</>}
            </Button>
            <Button variant="outline" size="sm" onClick={saveTemplates} disabled={savingTemplates}>
              {savingTemplates ? 'Sauvegarde...' : <><Save className="h-3.5 w-3.5 mr-1" />Sauvegarder</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Step count selector */}
          <div className="flex items-center gap-3 pb-2 border-b">
            <span className="text-sm text-gray-600 font-medium">Nombre de relances :</span>
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => setStepCount(n)}
                className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                  stepCount === n
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}
              >
                {n} relance{n > 1 ? 's' : ''}
              </button>
            ))}
            <span className="text-xs text-gray-400 ml-2">{stepCount + 1} emails au total par prospect</span>
          </div>

          <p className="text-xs text-gray-500">
            Variables disponibles : <code className="bg-gray-100 px-1 rounded">{'{prospect_domain}'}</code> <code className="bg-gray-100 px-1 rounded">{'{company_name}'}</code> <code className="bg-gray-100 px-1 rounded">{'{my_domain}'}</code> <code className="bg-gray-100 px-1 rounded">{'{asking_price}'}</code>
          </p>
          {templates.filter(t => t.step <= stepCount + 1).map((t) => (
            <div key={t.step} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm text-gray-700">{t.label}</p>
                {t.step > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Après</span>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={t.delay_days}
                      onChange={e => setTemplates(prev => prev.map(p => p.step === t.step ? { ...p, delay_days: parseInt(e.target.value) || 1 } : p))}
                      className="w-16 h-7 text-sm text-center px-1"
                    />
                    <span className="text-xs text-gray-500">jours</span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Sujet</label>
                <input
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`Sujet pour ${t.label}...`}
                  value={t.subject}
                  onChange={e => setTemplates(prev => prev.map(p => p.step === t.step ? { ...p, subject: e.target.value } : p))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Corps</label>
                <Textarea
                  placeholder={`Contenu de l'email pour ${t.label}...`}
                  value={t.body}
                  rows={4}
                  onChange={e => setTemplates(prev => prev.map(p => p.step === t.step ? { ...p, body: e.target.value } : p))}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Launch Campaign */}
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-green-800 flex items-center gap-2">
                <Rocket className="h-5 w-5" /> Lancer la campagne automatique
              </p>
              <p className="text-sm text-green-700 mt-1">
                {stats.to_contact > 0
                  ? `${stats.to_contact} prospect${stats.to_contact > 1 ? 's' : ''} avec email prêts à être contactés. Les emails partiront à 9h et les follow-ups seront planifiés automatiquement.`
                  : 'Aucun prospect à contacter pour le moment.'}
              </p>
              {!(campaign as any).preferred_email_account_id && (
                <p className="text-xs text-orange-600 mt-1">⚠ Configure un compte email dans les paramètres de la campagne d'abord.</p>
              )}
            </div>
            <Button
              onClick={launchCampaign}
              disabled={launching || stats.to_contact === 0 || !(campaign as any).preferred_email_account_id}
              className="bg-green-600 hover:bg-green-700 text-white ml-4 shrink-0"
            >
              {launching ? 'Lancement...' : <><Rocket className="h-4 w-4 mr-1.5" />Lancer</>}
            </Button>
          </div>
        </CardContent>
      </Card>
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
