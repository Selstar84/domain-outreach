'use client'

import { use, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft, Search, Users, Mail, Rocket, Sparkles, Save,
  Pause, Play, Trash2, CheckCircle, MapPin, Star, BrainCircuit,
  MessageCircle, Phone, Linkedin, Instagram, Facebook, TrendingUp,
  TrendingDown, Minus, DollarSign, BarChart2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { Campaign } from '@/types/database'

interface TemplateStep {
  step: number
  label: string
  subject: string
  body: string
  delay_days: number
}

interface GooglePlace {
  place_id: string
  name: string
  address: string
  website: string | null
  phone: string | null
  rating: number | null
  reviews: number | null
}

interface ApolloProspect {
  id: string
  name: string
  first_name: string
  last_name: string
  title: string | null
  email: string | null
  email_status: string | null
  linkedin_url: string | null
  phone: string | null
  company_name: string | null
  company_website: string | null
}

interface DomainAnalysis {
  domain_type: 'geo' | 'industry' | 'keyword' | 'brandable'
  city: string | null
  province: string | null
  country: string | null
  country_code: string | null
  tld: string
  main_keyword: string
  language: 'fr' | 'en' | 'es' | 'other'
  industries: string[]
  ideal_buyers: string[]
  apollo_searches: Array<{ keywords: string[]; location: string; titles: string[] }>
  value_proposition: string
  pitch_angle: string
  google_search_query: string
}

interface DomainAppraisal {
  domain: string
  keyword: string
  appraised_at: string
  namebio: {
    sales: Array<{ domain: string; price: number; date: string; venue: string; tld: string }>
    total_found: number
    min_price: number | null
    max_price: number | null
    median_price: number | null
    avg_price: number | null
  }
  trends: {
    keyword: string
    points: Array<{ date: string; value: number }>
    current_interest: number
    avg_interest: number
    direction: 'rising' | 'falling' | 'stable' | 'unknown'
    direction_pct: number
  }
  brandability: {
    total: number
    breakdown: {
      length: number
      pronounceability: number
      memorability: number
      keyword_clarity: number
      tld_premium: number
    }
    strengths: string[]
    weaknesses: string[]
    verdict: 'excellent' | 'good' | 'average' | 'weak'
    estimated_value_range: { min: number; max: number }
    best_buyer_profile: string
  }
  godaddy: {
    domain: string
    govalue: number | null
    available: boolean
  }
  atom: {
    domain: string
    estimated_value: number | null
    min_value: number | null
    max_value: number | null
    grade: string | null
    score: number | null
    confidence: string | null
    available: boolean
  }
}

interface AtomDomainAnalytics {
  domain: string
  views: number | null
  clicks: number | null
  leads: number | null
  offers: number | null
  last_viewed: string | null
  total_sales: number
  sales: Array<{ domain: string; price: number | null; date: string | null }>
  fetched_at: string
}

const DEFAULT_TEMPLATES: TemplateStep[] = [
  { step: 1, label: 'Email initial', subject: '', body: '', delay_days: 0 },
  { step: 2, label: 'Relance J+4', subject: '', body: '', delay_days: 4 },
  { step: 3, label: 'Dernière relance J+10', subject: '', body: '', delay_days: 10 },
]

function extractKeywordsFromDomain(domain: string): string {
  // Strip TLD (.com, .fr, .co.uk, etc.)
  const withoutTld = domain.replace(/\.[a-z]{2,}(\.[a-z]{2})?$/i, '')
  // Split on hyphens/underscores/numbers boundaries
  return withoutTld.split(/[-_]/).join(' ')
}

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
  const [statusLoading, setStatusLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [channelStats, setChannelStats] = useState<Record<string, { total: number; contacted: number; queued: number }>>({})

  // Google Places state
  const [googleOpen, setGoogleOpen] = useState(false)
  const [googleStep, setGoogleStep] = useState<'search' | 'results'>('search')
  const [googleKeywords, setGoogleKeywords] = useState('')
  const [googleLocation, setGoogleLocation] = useState('')
  const [googleMaxResults, setGoogleMaxResults] = useState(20)
  const [googleSearching, setGoogleSearching] = useState(false)
  const [googleResults, setGoogleResults] = useState<GooglePlace[]>([])
  const [googleSelected, setGoogleSelected] = useState<Set<string>>(new Set())
  const [googleImporting, setGoogleImporting] = useState(false)

  // Apollo discover state
  const [apolloOpen, setApolloOpen] = useState(false)
  const [apolloStep, setApolloStep] = useState<'search' | 'results'>('search')
  const [apolloKeywords, setApolloKeywords] = useState('')
  const [apolloLocation, setApolloLocation] = useState('')
  const [apolloTitles, setApolloTitles] = useState('CEO,Owner,President,Founder,Director')
  const [apolloMaxResults, setApolloMaxResults] = useState(25)
  const [apolloSearching, setApolloSearching] = useState(false)
  const [apolloResults, setApolloResults] = useState<ApolloProspect[]>([])
  const [apolloSelected, setApolloSelected] = useState<Set<string>>(new Set())
  const [apolloImporting, setApolloImporting] = useState(false)

  // Domain analysis state
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<DomainAnalysis | null>(null)

  // Social outreach launch state
  const [socialLaunching, setSocialLaunching] = useState(false)
  const [socialChannels, setSocialChannels] = useState<Set<string>>(new Set(['whatsapp', 'linkedin']))

  // Domain appraisal state
  const [appraising, setAppraising] = useState(false)
  const [appraisal, setAppraisal] = useState<DomainAppraisal | null>(null)

  // Atom analytics state
  const [atomAnalytics, setAtomAnalytics] = useState<AtomDomainAnalytics | null>(null)
  const [fetchingAtomAnalytics, setFetchingAtomAnalytics] = useState(false)

  // Auto-run pipeline state
  const [showAutoRunDialog, setShowAutoRunDialog] = useState(false)
  const [autoRunning, setAutoRunning] = useState(false)
  const [autoRunEmailAccountId, setAutoRunEmailAccountId] = useState('')
  const [emailAccountsList, setEmailAccountsList] = useState<{ id: string; email_address: string; display_name: string | null; provider: string }[]>([])
  const [autoRunResult, setAutoRunResult] = useState<{ steps: { step: string; status: string }[]; queued: number; total_days: number; first_send: string } | null>(null)

  const supabase = createClient()
  const router = useRouter()

  const CHANNELS = [
    { key: 'email',     emoji: '📧', label: 'Email',     field: 'email' },
    { key: 'linkedin',  emoji: '💼', label: 'LinkedIn',  field: 'linkedin_url' },
    { key: 'instagram', emoji: '📸', label: 'Instagram', field: 'instagram_url' },
    { key: 'facebook',  emoji: '👤', label: 'Facebook',  field: 'facebook_url' },
    { key: 'twitter',   emoji: '🐦', label: 'Twitter/X', field: 'twitter_url' },
    { key: 'whatsapp',  emoji: '💬', label: 'WhatsApp',  field: 'whatsapp_number' },
  ]

  async function load() {
    const { data } = await supabase
      .from('campaigns')
      .select('*, owned_domain:owned_domains(*), preferred_email_account:email_accounts(id,email_address,display_name)')
      .eq('id', id)
      .single()
    setCampaign(data)

    // Restore saved appraisal + analysis from JSONB columns
    if ((data as any)?.domain_appraisal) setAppraisal((data as any).domain_appraisal)
    if ((data as any)?.domain_analysis) setAnalysis((data as any).domain_analysis)

    const [{ data: prospects }, { data: msgs }] = await Promise.all([
      supabase.from('prospects')
        .select('status, email, linkedin_url, instagram_url, facebook_url, twitter_url, whatsapp_number')
        .eq('campaign_id', id),
      supabase.from('outreach_messages')
        .select('channel, prospect_id, status')
        .eq('campaign_id', id)
        .in('status', ['sent', 'queued']),
    ])

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

      const CHANNELS_LOCAL = [
        { key: 'email', field: 'email' }, { key: 'linkedin', field: 'linkedin_url' },
        { key: 'instagram', field: 'instagram_url' }, { key: 'facebook', field: 'facebook_url' },
        { key: 'twitter', field: 'twitter_url' }, { key: 'whatsapp', field: 'whatsapp_number' },
      ]
      const cs: Record<string, { total: number; contacted: number; queued: number }> = {}
      for (const ch of CHANNELS_LOCAL) {
        const total = prospects.filter(p => !!(p as any)[ch.field]).length
        if (total === 0) continue
        const sentIds = new Set((msgs ?? []).filter(m => m.channel === ch.key && m.status === 'sent').map(m => m.prospect_id))
        const queuedIds = new Set((msgs ?? []).filter(m => m.channel === ch.key && m.status === 'queued').map(m => m.prospect_id))
        cs[ch.key] = { total, contacted: sentIds.size, queued: queuedIds.size }
      }
      setChannelStats(cs)
    }

    // Load saved templates
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
        body: JSON.stringify({ stepCount: stepCount + 1 }),
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

  async function fetchEmailAccounts() {
    const { data } = await supabase
      .from('email_accounts')
      .select('id, email_address, display_name, provider')
      .eq('is_active', true)
      .order('created_at')
    setEmailAccountsList(data ?? [])
    if (data && data.length > 0 && !autoRunEmailAccountId) {
      setAutoRunEmailAccountId(data[0].id)
    }
  }

  async function savePreferredEmailAccount(accountId: string) {
    await supabase
      .from('campaigns')
      .update({ preferred_email_account_id: accountId })
      .eq('id', id)
    setCampaign(prev => prev ? { ...prev, preferred_email_account_id: accountId } as any : null)
  }

  async function autoRunCampaign() {
    if (!autoRunEmailAccountId) return
    setAutoRunning(true)
    setAutoRunResult(null)
    try {
      const res = await fetch(`/api/campaigns/${id}/auto-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_account_id: autoRunEmailAccountId }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Erreur lors du lancement automatique'); return }
      setAutoRunResult(data)
      if (data.queued > 0) {
        const firstDate = data.first_send ? new Date(data.first_send).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''
        toast.success(`⚡ Pipeline lancé — ${data.queued} emails planifiés à partir du ${firstDate}`)
      } else {
        toast.info(data.message ?? 'Pipeline terminé')
      }
      load()
    } finally {
      setAutoRunning(false)
    }
  }

  async function updateStatus(newStatus: 'active' | 'paused' | 'completed') {
    setStatusLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) { toast.error('Erreur mise à jour'); return }
      const labels: Record<string, string> = { paused: 'Campagne mise en pause', active: 'Campagne reprise', completed: 'Campagne terminée' }
      toast.success(labels[newStatus])
      setCampaign(prev => prev ? { ...prev, status: newStatus } : prev)
    } finally {
      setStatusLoading(false)
    }
  }

  async function deleteCampaign() {
    setStatusLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erreur suppression'); return }
      toast.success('Campagne supprimée')
      router.push('/campaigns')
    } finally {
      setStatusLoading(false)
      setShowDeleteDialog(false)
    }
  }

  // ── Google Places ──────────────────────────────────────────────────────

  function openGoogleDialog() {
    const ownedDomain = (campaign as any)?.owned_domain
    const word = ownedDomain?.word ?? extractKeywordsFromDomain(ownedDomain?.domain ?? '')
    setGoogleKeywords(word)
    setGoogleLocation('')
    setGoogleMaxResults(20)
    setGoogleStep('search')
    setGoogleResults([])
    setGoogleSelected(new Set())
    setGoogleOpen(true)
  }

  async function runGoogleSearch() {
    setGoogleSearching(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/google-discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          keywords: googleKeywords,
          location: googleLocation,
          max_results: googleMaxResults,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Erreur recherche'); return }
      setGoogleResults(data.places ?? [])
      setGoogleSelected(new Set((data.places ?? []).map((p: GooglePlace) => p.place_id)))
      setGoogleStep('results')
    } finally {
      setGoogleSearching(false)
    }
  }

  async function importGooglePlaces() {
    const toImport = googleResults.filter(p => googleSelected.has(p.place_id))
    if (toImport.length === 0) { toast.error('Aucun résultat sélectionné'); return }
    setGoogleImporting(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/google-discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', places: toImport }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Erreur import'); return }
      toast.success(`${data.imported} prospect${data.imported > 1 ? 's' : ''} importé${data.imported > 1 ? 's' : ''} — scraping en attente`)
      setGoogleOpen(false)
      load()
    } finally {
      setGoogleImporting(false)
    }
  }

  function toggleGoogleSelect(placeId: string) {
    setGoogleSelected(prev => {
      const next = new Set(prev)
      if (next.has(placeId)) next.delete(placeId)
      else next.add(placeId)
      return next
    })
  }

  // ── Apollo discover ──────────────────────────────────────────────────────

  function openApolloDialog(prefill?: { keywords?: string[]; location?: string; titles?: string[] }) {
    const ownedDomain = (campaign as any)?.owned_domain
    const word = ownedDomain?.word ?? extractKeywordsFromDomain(ownedDomain?.domain ?? '')
    setApolloKeywords(prefill?.keywords?.join(', ') ?? word)
    setApolloLocation(prefill?.location ?? '')
    setApolloTitles(prefill?.titles?.join(',') ?? 'CEO,Owner,President,Founder,Director')
    setApolloMaxResults(25)
    setApolloStep('search')
    setApolloResults([])
    setApolloSelected(new Set())
    setApolloOpen(true)
  }

  async function runApolloSearch() {
    setApolloSearching(true)
    try {
      const keywords = apolloKeywords.split(',').map(k => k.trim()).filter(Boolean)
      const titles = apolloTitles.split(',').map(t => t.trim()).filter(Boolean)
      const res = await fetch(`/api/campaigns/${id}/apollo-discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          keywords,
          location: apolloLocation,
          titles: titles.length > 0 ? titles : undefined,
          max_results: apolloMaxResults,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Erreur recherche Apollo'); return }
      setApolloResults(data.prospects ?? [])
      setApolloSelected(new Set((data.prospects ?? []).map((p: ApolloProspect) => p.id)))
      setApolloStep('results')
    } finally {
      setApolloSearching(false)
    }
  }

  async function importApolloProspects() {
    const toImport = apolloResults.filter(p => apolloSelected.has(p.id))
    if (toImport.length === 0) { toast.error('Aucun prospect sélectionné'); return }
    setApolloImporting(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/apollo-discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', prospects: toImport }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Erreur import'); return }
      toast.success(`${data.imported} prospect${data.imported > 1 ? 's' : ''} importé${data.imported > 1 ? 's' : ''} ✓`)
      setApolloOpen(false)
      load()
    } finally {
      setApolloImporting(false)
    }
  }

  function toggleApolloSelect(prospectId: string) {
    setApolloSelected(prev => {
      const next = new Set(prev)
      if (next.has(prospectId)) next.delete(prospectId)
      else next.add(prospectId)
      return next
    })
  }

  // ── Domain analysis ──────────────────────────────────────────────────────

  async function analyzeDomain() {
    setAnalyzing(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/analyze`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Erreur analyse'); return }
      setAnalysis(data.analysis)
      toast.success('Analyse IA terminée ✓')
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Social outreach launch ───────────────────────────────────────────────

  function toggleSocialChannel(ch: string) {
    setSocialChannels(prev => {
      const next = new Set(prev)
      if (next.has(ch)) next.delete(ch)
      else next.add(ch)
      return next
    })
  }

  async function launchSocial() {
    if (socialChannels.size === 0) { toast.error('Sélectionne au moins un canal'); return }
    setSocialLaunching(true)
    try {
      const res = await fetch('/api/social/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: id, channels: [...socialChannels] }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Erreur lancement social'); return }
      const breakdown = Object.entries(data.by_channel ?? {})
        .map(([ch, n]) => `${n} ${ch}`)
        .join(', ')
      toast.success(`🚀 ${data.queued} messages sociaux planifiés (${breakdown})`)
      load()
    } finally {
      setSocialLaunching(false)
    }
  }

  // ── Domain appraisal ─────────────────────────────────────────────────────

  async function appraiseDomain() {
    setAppraising(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/appraise`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Erreur évaluation'); return }
      setAppraisal(data.appraisal)
      toast.success('Évaluation complète ✓')
    } finally {
      setAppraising(false)
    }
  }

  // ── Atom.com analytics ───────────────────────────────────────────────────

  async function fetchAtomAnalytics(domainName: string) {
    setFetchingAtomAnalytics(true)
    try {
      const res = await fetch(`/api/atom/analytics?domain=${encodeURIComponent(domainName)}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Erreur analytics Atom')
        return
      }
      setAtomAnalytics(data)
      toast.success('Analytics Atom.com chargés ✓')
    } finally {
      setFetchingAtomAnalytics(false)
    }
  }

  useEffect(() => { load(); fetchEmailAccounts() }, [id])

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

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/campaigns"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Retour</Button></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{ownedDomain?.domain}</h1>
            <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>{campaign.status}</Badge>
          </div>
          <p className="text-gray-500 mt-1">
            {campaign.asking_price ? `Prix demandé : $${campaign.asking_price.toLocaleString()}` : 'Prix non défini'}
            {' · '}Mot-clé : <span className="font-mono">{ownedDomain?.word}</span>
          </p>
        </div>
        {/* Campaign controls */}
        <div className="flex items-center gap-2">
          {campaign.status === 'paused' ? (
            <Button variant="outline" size="sm" onClick={() => updateStatus('active')} disabled={statusLoading} className="text-green-700 border-green-300 hover:bg-green-50">
              <Play className="h-4 w-4 mr-1.5" />Reprendre
            </Button>
          ) : campaign.status === 'active' ? (
            <Button variant="outline" size="sm" onClick={() => updateStatus('paused')} disabled={statusLoading} className="text-yellow-700 border-yellow-300 hover:bg-yellow-50">
              <Pause className="h-4 w-4 mr-1.5" />Pause
            </Button>
          ) : null}
          {campaign.status !== 'completed' && (
            <Button variant="outline" size="sm" onClick={() => updateStatus('completed')} disabled={statusLoading} className="text-gray-600 hover:bg-gray-50">
              <CheckCircle className="h-4 w-4 mr-1.5" />Terminer
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowDeleteDialog(true)} disabled={statusLoading} className="text-red-600 border-red-200 hover:bg-red-50">
            <Trash2 className="h-4 w-4 mr-1.5" />Supprimer
          </Button>
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

      {/* Channel progress */}
      {Object.keys(channelStats).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Progression par canal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {CHANNELS.filter(ch => channelStats[ch.key]).map(ch => {
              const s = channelStats[ch.key]
              const pct = s.total > 0 ? Math.round((s.contacted / s.total) * 100) : 0
              const done = s.contacted >= s.total
              const started = s.contacted > 0 || s.queued > 0
              return (
                <div key={ch.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-gray-700">
                      <span>{ch.emoji}</span> {ch.label}
                    </span>
                    <span className="flex items-center gap-2">
                      {done
                        ? <span className="text-xs text-green-600 font-semibold">✓ Terminé</span>
                        : started
                        ? <span className="text-xs text-blue-600 font-semibold">En cours</span>
                        : <span className="text-xs text-gray-400">Non commencé</span>
                      }
                      <span className="text-xs text-gray-500">
                        {s.contacted}/{s.total}
                        {s.queued > 0 && !done && <span className="text-blue-500 ml-1">(+{s.queued} planifiés)</span>}
                      </span>
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all ${done ? 'bg-green-500' : started ? 'bg-blue-500' : 'bg-gray-200'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Discovery */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" /> Discovery de prospects
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={analyzeDomain}
              disabled={analyzing}
              className="text-purple-700 border-purple-300 hover:bg-purple-50"
            >
              <BrainCircuit className="h-4 w-4 mr-1.5" />
              {analyzing ? 'Analyse IA...' : 'Analyser (IA)'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={appraiseDomain}
              disabled={appraising}
              className="text-amber-700 border-amber-300 hover:bg-amber-50"
            >
              <DollarSign className="h-4 w-4 mr-1.5" />
              {appraising ? 'Évaluation...' : 'Évaluer'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openApolloDialog()}
              className="text-blue-700 border-blue-300 hover:bg-blue-50"
            >
              <Users className="h-4 w-4 mr-1.5" />Apollo.io
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openGoogleDialog}
              className="text-green-700 border-green-300 hover:bg-green-50"
            >
              <MapPin className="h-4 w-4 mr-1.5" />Google Places
            </Button>
            <Button
              size="sm"
              onClick={runDiscovery}
              disabled={discovering}
              variant={campaign.discovery_status === 'completed' ? 'outline' : 'default'}
            >
              {discovering ? 'En cours...' : campaign.discovery_status === 'completed' ? '↺ Variantes' : '▶ Variantes domaine'}
            </Button>
          </div>
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
            <p className="text-sm text-gray-400">
              Lancez le discovery (variantes de domaine) ou recherchez des entreprises via <strong>Google Places</strong> pour <strong>{ownedDomain?.domain}</strong>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Domain Analysis Result */}
      {analysis && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-purple-800">
              <BrainCircuit className="h-4 w-4" /> Analyse IA du domaine
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {analysis.city && (
                <div>
                  <p className="text-xs text-purple-500 font-medium">Ville / Région</p>
                  <p className="text-sm text-gray-800">{[analysis.city, analysis.province, analysis.country].filter(Boolean).join(', ')}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-purple-500 font-medium">Type</p>
                <p className="text-sm text-gray-800 capitalize">{analysis.domain_type}</p>
              </div>
              <div>
                <p className="text-xs text-purple-500 font-medium">Industries cibles</p>
                <p className="text-sm text-gray-800">{analysis.industries.join(', ')}</p>
              </div>
              <div>
                <p className="text-xs text-purple-500 font-medium">Acheteurs idéaux</p>
                <p className="text-sm text-gray-800">{analysis.ideal_buyers.join(', ')}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-purple-500 font-medium mb-1">Proposition de valeur</p>
              <p className="text-sm text-gray-700 italic">"{analysis.value_proposition}"</p>
            </div>
            {analysis.apollo_searches && analysis.apollo_searches.length > 0 && (
              <div>
                <p className="text-xs text-purple-500 font-medium mb-2">Recherches Apollo suggérées</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.apollo_searches.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => openApolloDialog(s)}
                      className="text-xs bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-3 py-1 hover:bg-blue-200 transition-colors"
                    >
                      🔍 {s.keywords.join(', ')} · {s.location || 'Global'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {analysis.google_search_query && (
              <div>
                <p className="text-xs text-purple-500 font-medium mb-1">Requête Google Places suggérée</p>
                <button
                  onClick={() => {
                    setGoogleKeywords(analysis.google_search_query.split(' ').slice(0, -1).join(' ') || analysis.google_search_query)
                    setGoogleLocation(analysis.city ? [analysis.city, analysis.province, analysis.country].filter(Boolean).join(', ') : '')
                    setGoogleStep('search')
                    setGoogleResults([])
                    setGoogleSelected(new Set())
                    setGoogleOpen(true)
                  }}
                  className="text-xs bg-green-100 text-green-700 border border-green-200 rounded-full px-3 py-1 hover:bg-green-200 transition-colors"
                >
                  📍 {analysis.google_search_query}
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Domain Appraisal Result */}
      {appraisal && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800">
              <DollarSign className="h-4 w-4" /> Évaluation du domaine
              <span className="text-xs font-normal text-amber-600 ml-auto">
                {new Date(appraisal.appraised_at).toLocaleDateString('fr-FR')}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Brandability + Value */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 border border-amber-100 text-center">
                <p className="text-xs text-amber-600 font-medium mb-1">Score de brandabilité</p>
                <p className={`text-4xl font-bold ${
                  appraisal.brandability.total >= 80 ? 'text-green-600' :
                  appraisal.brandability.total >= 60 ? 'text-blue-600' :
                  appraisal.brandability.total >= 40 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {appraisal.brandability.total}
                  <span className="text-lg font-normal text-gray-400">/100</span>
                </p>
                <Badge className={`mt-1 text-xs ${
                  appraisal.brandability.verdict === 'excellent' ? 'bg-green-100 text-green-700' :
                  appraisal.brandability.verdict === 'good' ? 'bg-blue-100 text-blue-700' :
                  appraisal.brandability.verdict === 'average' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {appraisal.brandability.verdict === 'excellent' ? '⭐ Excellent' :
                   appraisal.brandability.verdict === 'good' ? '👍 Bon' :
                   appraisal.brandability.verdict === 'average' ? '😐 Moyen' : '⚠ Faible'}
                </Badge>
              </div>
              <div className="bg-white rounded-xl p-4 border border-amber-100 text-center space-y-1">
                <p className="text-xs text-amber-600 font-medium">Valeur estimée (IA)</p>
                <p className="text-2xl font-bold text-gray-800">
                  ${appraisal.brandability.estimated_value_range.min.toLocaleString()}
                  <span className="text-sm font-normal text-gray-400"> – ${appraisal.brandability.estimated_value_range.max.toLocaleString()}</span>
                </p>
                {appraisal.godaddy?.govalue && (
                  <div className="flex items-center justify-center gap-1.5 mt-1 bg-blue-50 rounded-lg px-2 py-1">
                    <span className="text-xs text-blue-500 font-medium">GoDaddy GoValue :</span>
                    <span className="text-sm font-bold text-blue-700">${appraisal.godaddy.govalue.toLocaleString()}</span>
                  </div>
                )}
                {appraisal.atom?.estimated_value && (
                  <div className="flex items-center justify-center gap-1.5 mt-1 bg-orange-50 rounded-lg px-2 py-1">
                    <span className="text-xs text-orange-500 font-medium">⚛️ Atom.com :</span>
                    <span className="text-sm font-bold text-orange-700">${appraisal.atom.estimated_value.toLocaleString()}</span>
                    {appraisal.atom.grade && (
                      <span className="text-xs text-orange-500 font-semibold">({appraisal.atom.grade})</span>
                    )}
                  </div>
                )}
                {appraisal.namebio.avg_price && (
                  <p className="text-xs text-amber-600">
                    Moy. NameBio : ${appraisal.namebio.avg_price.toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {/* Breakdown bars */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-amber-700">Détail du score</p>
              {Object.entries(appraisal.brandability.breakdown).map(([key, val]) => {
                const labels: Record<string, string> = {
                  length: 'Longueur', pronounceability: 'Prononçabilité',
                  memorability: 'Mémorabilité', keyword_clarity: 'Clarté du mot-clé',
                  tld_premium: 'Prime TLD',
                }
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-36 shrink-0">{labels[key]}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full bg-amber-400 transition-all"
                        style={{ width: `${(val / 20) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-gray-500 w-8 text-right">{val}/20</span>
                  </div>
                )
              })}
            </div>

            {/* Strengths & Weaknesses */}
            <div className="grid grid-cols-2 gap-3">
              {appraisal.brandability.strengths.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-700 mb-1">✅ Points forts</p>
                  <ul className="space-y-0.5">
                    {appraisal.brandability.strengths.map((s, i) => (
                      <li key={i} className="text-xs text-gray-600">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {appraisal.brandability.weaknesses.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-700 mb-1">⚠ Points faibles</p>
                  <ul className="space-y-0.5">
                    {appraisal.brandability.weaknesses.map((w, i) => (
                      <li key={i} className="text-xs text-gray-600">• {w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <p className="text-xs text-amber-700 italic">
              🎯 {appraisal.brandability.best_buyer_profile}
            </p>

            {/* Google Trends */}
            {appraisal.trends.points.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <BarChart2 className="h-3.5 w-3.5 text-blue-600" />
                  <p className="text-xs font-medium text-gray-700">
                    Google Trends — "{appraisal.trends.keyword}" (12 derniers mois)
                  </p>
                  <span className={`ml-auto flex items-center gap-1 text-xs font-semibold ${
                    appraisal.trends.direction === 'rising' ? 'text-green-600' :
                    appraisal.trends.direction === 'falling' ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {appraisal.trends.direction === 'rising' ? <TrendingUp className="h-3.5 w-3.5" /> :
                     appraisal.trends.direction === 'falling' ? <TrendingDown className="h-3.5 w-3.5" /> :
                     <Minus className="h-3.5 w-3.5" />}
                    {appraisal.trends.direction === 'rising' ? `+${appraisal.trends.direction_pct}% en hausse` :
                     appraisal.trends.direction === 'falling' ? `${appraisal.trends.direction_pct}% en baisse` :
                     'Stable'}
                  </span>
                </div>
                {/* Mini bar chart */}
                <div className="flex items-end gap-0.5 h-12 bg-white rounded-lg border border-blue-100 px-2 py-1">
                  {appraisal.trends.points.map((pt, i) => {
                    const maxVal = Math.max(...appraisal.trends.points.map(p => p.value), 1)
                    const heightPct = (pt.value / maxVal) * 100
                    const isLast = i === appraisal.trends.points.length - 1
                    return (
                      <div
                        key={pt.date}
                        title={`${pt.date}: ${pt.value}`}
                        className={`flex-1 rounded-sm transition-all ${isLast ? 'bg-blue-500' : 'bg-blue-200'}`}
                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                      />
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Intérêt actuel : {appraisal.trends.current_interest}/100 · Moyenne : {appraisal.trends.avg_interest}/100
                </p>
              </div>
            )}

            {/* NameBio Comparables */}
            {appraisal.namebio.sales.length > 0 ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-medium text-gray-700">
                    📊 Ventes comparables NameBio ({appraisal.namebio.total_found} trouvées)
                  </p>
                  <div className="ml-auto flex gap-3 text-xs text-gray-500">
                    <span>Min: <strong>${appraisal.namebio.min_price?.toLocaleString()}</strong></span>
                    <span>Moy: <strong className="text-amber-700">${appraisal.namebio.avg_price?.toLocaleString()}</strong></span>
                    <span>Max: <strong>${appraisal.namebio.max_price?.toLocaleString()}</strong></span>
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border border-gray-100">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-1.5 text-gray-500 font-medium">Domaine</th>
                        <th className="text-right px-3 py-1.5 text-gray-500 font-medium">Prix</th>
                        <th className="text-right px-3 py-1.5 text-gray-500 font-medium hidden sm:table-cell">Date</th>
                        <th className="text-right px-3 py-1.5 text-gray-500 font-medium hidden sm:table-cell">Plateforme</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {appraisal.namebio.sales.slice(0, 8).map((sale, i) => (
                        <tr key={i} className="bg-white hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-mono text-blue-700">{sale.domain}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-green-700">
                            ${sale.price.toLocaleString()}
                          </td>
                          <td className="px-3 py-1.5 text-right text-gray-400 hidden sm:table-cell">
                            {sale.date?.slice(0, 7)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-gray-400 hidden sm:table-cell">
                            {sale.venue}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">
                Aucune vente comparable trouvée sur NameBio pour ce mot-clé.
              </p>
            )}

          </CardContent>
        </Card>
      )}

      {/* Atom.com Analytics Card */}
      {campaign && (campaign as any).owned_domain?.domain && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-orange-800">
              ⚛️ Analytics Atom.com
              <Button
                size="sm"
                variant="outline"
                className="ml-auto border-orange-300 text-orange-700 hover:bg-orange-100 h-7 text-xs"
                onClick={() => fetchAtomAnalytics((campaign as any).owned_domain.domain)}
                disabled={fetchingAtomAnalytics}
              >
                {fetchingAtomAnalytics ? 'Chargement…' : atomAnalytics ? '🔄 Rafraîchir' : '📊 Charger les analytics'}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!atomAnalytics ? (
              <p className="text-sm text-orange-600 italic">
                Cliquez sur "Charger les analytics" pour voir les vues, leads et offres depuis Atom.com.
                Nécessite la clé API Atom dans les Paramètres.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white rounded-xl p-3 border border-orange-100 text-center">
                    <p className="text-xs text-orange-500 font-medium mb-1">👁 Vues totales</p>
                    <p className="text-2xl font-bold text-orange-700">{atomAnalytics.views?.toLocaleString() ?? '—'}</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-orange-100 text-center">
                    <p className="text-xs text-orange-500 font-medium mb-1">🖱 Clics</p>
                    <p className="text-2xl font-bold text-orange-700">{atomAnalytics.clicks?.toLocaleString() ?? '—'}</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-orange-100 text-center">
                    <p className="text-xs text-orange-500 font-medium mb-1">📩 Leads</p>
                    <p className="text-2xl font-bold text-orange-700">{atomAnalytics.leads?.toLocaleString() ?? '—'}</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-orange-100 text-center">
                    <p className="text-xs text-orange-500 font-medium mb-1">💰 Offres</p>
                    <p className="text-2xl font-bold text-orange-700">{atomAnalytics.offers?.toLocaleString() ?? '—'}</p>
                  </div>
                </div>

                {atomAnalytics.last_viewed && (
                  <p className="text-xs text-orange-500">
                    Dernière vue : {new Date(atomAnalytics.last_viewed).toLocaleDateString('fr-FR')}
                  </p>
                )}

                {/* Atom sales history */}
                {atomAnalytics.total_sales > 0 && (
                  <div>
                    <p className="text-xs font-medium text-orange-700 mb-2">
                      📦 Ventes récentes sur Atom.com ({atomAnalytics.total_sales} au total)
                    </p>
                    <div className="overflow-hidden rounded-lg border border-orange-100">
                      <table className="w-full text-xs">
                        <thead className="bg-orange-100">
                          <tr>
                            <th className="text-left px-3 py-1.5 text-orange-700 font-medium">Domaine</th>
                            <th className="text-right px-3 py-1.5 text-orange-700 font-medium">Prix</th>
                            <th className="text-right px-3 py-1.5 text-orange-700 font-medium hidden sm:table-cell">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-orange-50">
                          {atomAnalytics.sales.slice(0, 6).map((s, i) => (
                            <tr key={i} className="bg-white hover:bg-orange-50">
                              <td className="px-3 py-1.5 font-mono text-orange-700">{s.domain}</td>
                              <td className="px-3 py-1.5 text-right font-semibold text-green-700">
                                {s.price ? `$${s.price.toLocaleString()}` : '—'}
                              </td>
                              <td className="px-3 py-1.5 text-right text-gray-400 hidden sm:table-cell">
                                {s.date?.slice(0, 10) ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-400">
                  Chargé le {new Date(atomAnalytics.fetched_at).toLocaleString('fr-FR')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                      type="number" min={1} max={60}
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
                  value={t.body} rows={4}
                  onChange={e => setTemplates(prev => prev.map(p => p.step === t.step ? { ...p, body: e.target.value } : p))}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Auto-Run Pipeline */}
      <Card className="border-purple-200 bg-purple-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-purple-800 flex items-center gap-2">
                <Sparkles className="h-5 w-5" /> Tout lancer automatiquement
              </p>
              <p className="text-sm text-purple-700 mt-1">
                Pipeline complet en 1 clic : analyse IA → génération emails → envoi automatique avec follow-ups.
              </p>
            </div>
            <Button
              onClick={() => { setShowAutoRunDialog(true); fetchEmailAccounts() }}
              className="bg-purple-600 hover:bg-purple-700 text-white ml-4 shrink-0"
            >
              <Sparkles className="h-4 w-4 mr-1.5" /> Auto-lancer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Auto-Run Dialog */}
      <Dialog open={showAutoRunDialog} onOpenChange={setShowAutoRunDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" /> Lancement automatique
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {!autoRunResult ? (
              <>
                <p className="text-sm text-gray-600">
                  Ce pipeline va automatiquement :
                </p>
                <ul className="text-sm text-gray-700 space-y-1 list-none">
                  <li>✦ Analyser le domaine avec l'IA</li>
                  <li>✦ Générer 3 templates email personnalisés</li>
                  <li>✦ Planifier l'envoi pour tous tes prospects</li>
                  <li>✦ Programmer les follow-ups automatiques (J+3, J+7)</li>
                </ul>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Compte email d'envoi</label>
                  {emailAccountsList.length === 0 ? (
                    <p className="text-sm text-orange-600">Aucun compte email actif trouvé. <a href="/email-accounts" className="underline">Configurer un compte</a></p>
                  ) : (
                    <select
                      value={autoRunEmailAccountId}
                      onChange={e => setAutoRunEmailAccountId(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      {emailAccountsList.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.display_name ? `${acc.display_name} <${acc.email_address}>` : acc.email_address} ({acc.provider})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" onClick={() => setShowAutoRunDialog(false)}>Annuler</Button>
                  <Button
                    onClick={autoRunCampaign}
                    disabled={autoRunning || !autoRunEmailAccountId}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {autoRunning ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                        Pipeline en cours...
                      </span>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-1.5" /> Lancer le pipeline</>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  {autoRunResult.steps.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className={s.status === 'done' ? 'text-green-600' : 'text-gray-400'}>
                        {s.status === 'done' ? '✓' : '↩'}
                      </span>
                      <span className={s.status === 'done' ? 'text-gray-800' : 'text-gray-400'}>{s.step}</span>
                    </div>
                  ))}
                </div>
                {autoRunResult.queued > 0 ? (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-800">
                    <p className="font-semibold">⚡ {autoRunResult.queued} emails planifiés</p>
                    <p>1er envoi : {new Date(autoRunResult.first_send).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à 9h</p>
                    {autoRunResult.total_days > 1 && <p>Durée : {autoRunResult.total_days} jours</p>}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-md p-3">Importe des prospects dans cette campagne pour lancer l'envoi.</p>
                )}
                <div className="flex justify-end">
                  <Button onClick={() => { setShowAutoRunDialog(false); setAutoRunResult(null) }}>Fermer</Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
                <div className="mt-2">
                  {emailAccountsList.length === 0
                    ? <p className="text-xs text-orange-600">⚠ Aucun compte email actif. <a href="/email-accounts" className="underline font-medium">Configurer →</a></p>
                    : <div className="flex items-center gap-2">
                        <span className="text-xs text-orange-700 font-medium">⚠ Compte email :</span>
                        <select
                          defaultValue=""
                          onChange={e => e.target.value && savePreferredEmailAccount(e.target.value)}
                          className="text-xs border border-orange-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                          <option value="" disabled>Choisir...</option>
                          {emailAccountsList.map(acc => (
                            <option key={acc.id} value={acc.id}>
                              {acc.display_name ? `${acc.display_name} (${acc.email_address})` : acc.email_address}
                            </option>
                          ))}
                        </select>
                      </div>
                  }
                </div>
              )}
              {campaign.status === 'paused' && (
                <p className="text-xs text-yellow-700 mt-1">⏸ Campagne en pause — les emails planifiés ne seront pas envoyés.</p>
              )}
            </div>
            <Button
              onClick={launchCampaign}
              disabled={launching || stats.to_contact === 0 || !(campaign as any).preferred_email_account_id || campaign.status === 'paused'}
              className="bg-green-600 hover:bg-green-700 text-white ml-4 shrink-0"
            >
              {launching ? 'Lancement...' : <><Rocket className="h-4 w-4 mr-1.5" />Lancer</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Social Outreach Launch */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="font-semibold text-blue-800 flex items-center gap-2">
                <MessageCircle className="h-5 w-5" /> Lancer l'outreach social automatique
              </p>
              <p className="text-sm text-blue-700 mt-1">
                Envoyer des messages personnalisés via WhatsApp, LinkedIn, Instagram et Facebook aux prospects qui ont ces contacts.
              </p>
            </div>
          </div>

          {/* Channel selector */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-blue-700">Canaux à activer :</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'whatsapp', icon: '💬', label: 'WhatsApp', field: 'whatsapp_number' },
                { key: 'linkedin', icon: '💼', label: 'LinkedIn', field: 'linkedin_url' },
                { key: 'instagram', icon: '📸', label: 'Instagram', field: 'instagram_url' },
                { key: 'facebook', icon: '👤', label: 'Facebook', field: 'facebook_url' },
              ].map(ch => {
                const count = channelStats[ch.key]?.total ?? 0
                const active = socialChannels.has(ch.key)
                return (
                  <button
                    key={ch.key}
                    onClick={() => toggleSocialChannel(ch.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    <span>{ch.icon}</span>
                    <span>{ch.label}</span>
                    {count > 0 && (
                      <span className={`ml-auto text-xs ${active ? 'text-blue-100' : 'text-gray-400'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="text-sm text-blue-700">
              {socialChannels.size === 0
                ? <span className="text-orange-600">⚠ Sélectionne au moins un canal</span>
                : <span>{[...socialChannels].join(', ')} sélectionné{socialChannels.size > 1 ? 's' : ''}</span>
              }
            </div>
            <Button
              onClick={launchSocial}
              disabled={socialLaunching || socialChannels.size === 0 || stats.to_contact === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white ml-4 shrink-0"
            >
              {socialLaunching ? 'Lancement...' : <><MessageCircle className="h-4 w-4 mr-1.5" />Lancer social</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirm dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette campagne ?</AlertDialogTitle>
            <AlertDialogDescription>
              La campagne <strong>{ownedDomain?.domain}</strong> et tous ses prospects et messages seront supprimés définitivement. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={deleteCampaign} className="bg-red-600 hover:bg-red-700 text-white">
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Apollo.io dialog */}
      <Dialog open={apolloOpen} onOpenChange={setApolloOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Rechercher des décideurs via Apollo.io
            </DialogTitle>
          </DialogHeader>

          {apolloStep === 'search' && (
            <div className="space-y-4 flex-1">
              <p className="text-sm text-gray-500">
                Trouver CEO, Owner, Founder et autres décideurs avec email et LinkedIn pour <strong>{ownedDomain?.domain}</strong>.
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Mots-clés secteur</label>
                  <Input
                    value={apolloKeywords}
                    onChange={e => setApolloKeywords(e.target.value)}
                    placeholder="ex : plomberie, construction, restauration..."
                  />
                  <p className="text-xs text-gray-400">Sépare par des virgules. Pré-rempli depuis le domaine ou l'analyse IA.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Localisation</label>
                  <Input
                    value={apolloLocation}
                    onChange={e => setApolloLocation(e.target.value)}
                    placeholder="ex : Calgary, Alberta, Canada"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Titres cibles</label>
                  <Input
                    value={apolloTitles}
                    onChange={e => setApolloTitles(e.target.value)}
                    placeholder="CEO,Owner,President,Founder"
                  />
                  <p className="text-xs text-gray-400">Sépare par des virgules.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Nombre de résultats max</label>
                  <div className="flex gap-2">
                    {[10, 25, 50, 100].map(n => (
                      <button
                        key={n}
                        onClick={() => setApolloMaxResults(n)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          apolloMaxResults === n
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  onClick={runApolloSearch}
                  disabled={apolloSearching || !apolloKeywords.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {apolloSearching
                    ? <><span className="animate-spin mr-2">⟳</span>Recherche en cours...</>
                    : <><Search className="h-4 w-4 mr-1.5" />Rechercher</>
                  }
                </Button>
              </div>
            </div>
          )}

          {apolloStep === 'results' && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-600">
                  <strong>{apolloResults.length}</strong> contacts trouvés ·{' '}
                  <button className="text-blue-500 underline text-xs" onClick={() => setApolloStep('search')}>
                    Modifier la recherche
                  </button>
                </p>
                <div className="flex gap-2 text-xs">
                  <button className="text-blue-500 underline" onClick={() => setApolloSelected(new Set(apolloResults.map(p => p.id)))}>
                    Tout sélectionner
                  </button>
                  <span className="text-gray-300">|</span>
                  <button className="text-gray-400 underline" onClick={() => setApolloSelected(new Set())}>
                    Désélectionner
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                {apolloResults.map(p => (
                  <div
                    key={p.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      apolloSelected.has(p.id)
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => toggleApolloSelect(p.id)}
                  >
                    <Checkbox
                      checked={apolloSelected.has(p.id)}
                      onCheckedChange={() => toggleApolloSelect(p.id)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{p.name}</span>
                        {p.title && <span className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{p.title}</span>}
                        {p.email_status === 'verified' && <span className="text-xs text-green-600 font-medium">✓ Email vérifié</span>}
                      </div>
                      {p.company_name && (
                        <p className="text-xs text-gray-600 mt-0.5">🏢 {p.company_name}</p>
                      )}
                      <div className="flex gap-3 mt-1 flex-wrap">
                        {p.email && (
                          <span className="text-xs text-blue-600">✉ {p.email}</span>
                        )}
                        {p.linkedin_url && (
                          <span className="text-xs text-blue-700">💼 LinkedIn</span>
                        )}
                        {p.phone && (
                          <span className="text-xs text-gray-500">📞 {p.phone}</span>
                        )}
                        {!p.email && !p.linkedin_url && (
                          <span className="text-xs text-gray-400 italic">Pas de contact direct</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-3 border-t mt-3">
                <p className="text-sm text-gray-500">
                  {apolloSelected.size} sélectionné{apolloSelected.size > 1 ? 's' : ''}
                </p>
                <Button
                  onClick={importApolloProspects}
                  disabled={apolloImporting || apolloSelected.size === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {apolloImporting
                    ? 'Import en cours...'
                    : `Importer ${apolloSelected.size} prospect${apolloSelected.size > 1 ? 's' : ''}`
                  }
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Google Places dialog */}
      <Dialog open={googleOpen} onOpenChange={setGoogleOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-green-600" />
              Rechercher des prospects via Google Places
            </DialogTitle>
          </DialogHeader>

          {googleStep === 'search' && (
            <div className="space-y-4 flex-1">
              <p className="text-sm text-gray-500">
                Trouvez des entreprises locales susceptibles d'être intéressées par <strong>{ownedDomain?.domain}</strong>.
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Mots-clés</label>
                  <Input
                    value={googleKeywords}
                    onChange={e => setGoogleKeywords(e.target.value)}
                    placeholder="ex : restaurant, plombier, avocat..."
                  />
                  <p className="text-xs text-gray-400">Pré-rempli depuis le mot-clé du domaine. Modifie si besoin.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Localisation</label>
                  <Input
                    value={googleLocation}
                    onChange={e => setGoogleLocation(e.target.value)}
                    placeholder="ex : Paris, Montréal, Lyon 7e..."
                  />
                  <p className="text-xs text-gray-400">Ville, quartier, région. Laisse vide pour une recherche mondiale.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Nombre de résultats max</label>
                  <div className="flex gap-2">
                    {[10, 20, 40, 60].map(n => (
                      <button
                        key={n}
                        onClick={() => setGoogleMaxResults(n)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          googleMaxResults === n
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">40+ résultats nécessite 2 appels API (délai ~2s).</p>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  onClick={runGoogleSearch}
                  disabled={googleSearching || !googleKeywords.trim()}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {googleSearching
                    ? <><span className="animate-spin mr-2">⟳</span>Recherche en cours...</>
                    : <><Search className="h-4 w-4 mr-1.5" />Rechercher</>
                  }
                </Button>
              </div>
            </div>
          )}

          {googleStep === 'results' && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-600">
                  <strong>{googleResults.length}</strong> entreprises trouvées ·{' '}
                  <button className="text-blue-500 underline text-xs" onClick={() => setGoogleStep('search')}>
                    Modifier la recherche
                  </button>
                </p>
                <div className="flex gap-2 text-xs">
                  <button className="text-blue-500 underline" onClick={() => setGoogleSelected(new Set(googleResults.map(p => p.place_id)))}>
                    Tout sélectionner
                  </button>
                  <span className="text-gray-300">|</span>
                  <button className="text-gray-400 underline" onClick={() => setGoogleSelected(new Set())}>
                    Désélectionner
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                {googleResults.map(place => (
                  <div
                    key={place.place_id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      googleSelected.has(place.place_id)
                        ? 'bg-green-50 border-green-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => toggleGoogleSelect(place.place_id)}
                  >
                    <Checkbox
                      checked={googleSelected.has(place.place_id)}
                      onCheckedChange={() => toggleGoogleSelect(place.place_id)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{place.name}</span>
                        {place.rating && (
                          <span className="flex items-center gap-0.5 text-xs text-amber-600">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {place.rating.toFixed(1)}
                            {place.reviews && <span className="text-gray-400 ml-0.5">({place.reviews})</span>}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />{place.address}
                      </p>
                      <div className="flex gap-3 mt-1 flex-wrap">
                        {place.website && (
                          <span className="text-xs text-blue-600 truncate max-w-[200px]">
                            🌐 {place.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                          </span>
                        )}
                        {place.phone && (
                          <span className="text-xs text-gray-500">📞 {place.phone}</span>
                        )}
                        {!place.website && !place.phone && (
                          <span className="text-xs text-gray-400 italic">Aucune info de contact</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-3 border-t mt-3">
                <p className="text-sm text-gray-500">
                  {googleSelected.size} sélectionné{googleSelected.size > 1 ? 's' : ''}
                </p>
                <Button
                  onClick={importGooglePlaces}
                  disabled={googleImporting || googleSelected.size === 0}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {googleImporting
                    ? 'Import en cours...'
                    : `Importer ${googleSelected.size} prospect${googleSelected.size > 1 ? 's' : ''}`
                  }
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
