'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Copy, Send, ExternalLink, Linkedin, Facebook, Instagram, Twitter, MessageCircle, Sparkles, FileText, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import type { Prospect, EmailAccount, OutreachMessage } from '@/types/database'

const ALL_CHANNELS = [
  { value: 'email', label: '📧 Email' },
  { value: 'linkedin', label: '💼 LinkedIn' },
  { value: 'facebook', label: '👤 Facebook' },
  { value: 'instagram', label: '📸 Instagram' },
  { value: 'whatsapp', label: '💬 WhatsApp' },
  { value: 'twitter', label: '🐦 Twitter/X' },
]

function getAvailableChannels(prospect: Prospect | undefined) {
  if (!prospect) return ALL_CHANNELS
  return ALL_CHANNELS.filter(c => {
    if (c.value === 'email') return true
    if (c.value === 'linkedin') return !!prospect.linkedin_url
    if (c.value === 'facebook') return !!prospect.facebook_url
    if (c.value === 'instagram') return !!prospect.instagram_url
    if (c.value === 'twitter') return !!prospect.twitter_url
    if (c.value === 'whatsapp') return !!prospect.whatsapp_number
    return false
  })
}

function substituteVars(text: string, prospect: Prospect, domainForSale: string, askingPrice?: number | null): string {
  return text
    .replace(/\{\{domaine_vente\}\}/gi, domainForSale)
    .replace(/\{\{domaine_prospect\}\}/gi, prospect.domain)
    .replace(/\{\{entreprise\}\}/gi, prospect.company_name ?? '')
    .replace(/\{\{prix\}\}/gi, askingPrice ? String(askingPrice) : '')
    .replace(/\{\{tld\}\}/gi, prospect.tld)
}

const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  linkedin: <Linkedin className="h-4 w-4" />,
  facebook: <Facebook className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
  twitter: <Twitter className="h-4 w-4" />,
  whatsapp: <MessageCircle className="h-4 w-4" />,
}

type GenerationMode = 'ai' | 'template' | 'custom'

interface Template {
  id: string
  name: string
  channel: string
  subject: string | null
  body: string
}

export default function OutreachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(params)
  const searchParams = useSearchParams()
  const defaultProspectId = searchParams.get('prospect')

  const [prospects, setProspects] = useState<Prospect[]>([])
  const [emailAccounts, setEmailAccounts] = useState<Pick<EmailAccount, 'id' | 'email_address' | 'display_name' | 'is_active' | 'is_verified' | 'daily_limit' | 'sent_today'>[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedProspectId, setSelectedProspectId] = useState(defaultProspectId ?? '')
  const [channel, setChannel] = useState('email')
  const [step, setStep] = useState('1')
  const [genMode, setGenMode] = useState<GenerationMode>('ai')
  const [customInstructions, setCustomInstructions] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [messages, setMessages] = useState<OutreachMessage[]>([])
  const [selectedVariant, setSelectedVariant] = useState<OutreachMessage | null>(null)
  const [emailAccountId, setEmailAccountId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [markingPlatform, setMarkingPlatform] = useState('')
  const [campaign, setCampaign] = useState<any>(null)
  const supabase = createClient()

  const selectedProspect = prospects.find(p => p.id === selectedProspectId)
  const availableChannels = getAvailableChannels(selectedProspect)
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)

  // Templates filtered by current channel
  const channelTemplates = templates.filter(t => t.channel === 'all' || t.channel === channel)

  // Template preview with variables substituted
  const templatePreview = selectedTemplate && selectedProspect && campaign
    ? {
        subject: selectedTemplate.subject ? substituteVars(selectedTemplate.subject, selectedProspect, campaign.owned_domain?.domain ?? '', campaign.asking_price) : null,
        body: substituteVars(selectedTemplate.body, selectedProspect, campaign.owned_domain?.domain ?? '', campaign.asking_price),
      }
    : null

  // When prospect changes, reset channel to first available one
  useEffect(() => {
    if (!selectedProspectId) return
    const valid = availableChannels.map(c => c.value)
    if (!valid.includes(channel)) {
      setChannel(valid[0] ?? 'email')
      setMessages([])
      setSelectedVariant(null)
    }
  }, [selectedProspectId, selectedProspect])

  // When channel changes, reset template selection if not compatible
  useEffect(() => {
    if (selectedTemplate && selectedTemplate.channel !== 'all' && selectedTemplate.channel !== channel) {
      setSelectedTemplateId('')
    }
    setMessages([])
    setSelectedVariant(null)
  }, [channel])

  const load = useCallback(async () => {
    const [{ data: p }, { data: a }, { data: camp }, { data: tpl }] = await Promise.all([
      supabase.from('prospects').select('*').eq('campaign_id', campaignId).order('priority', { ascending: false }),
      supabase.from('email_accounts').select('id, email_address, display_name, is_active, is_verified, daily_limit, sent_today').eq('is_active', true),
      supabase.from('campaigns').select('*, owned_domain:owned_domains(*)').eq('id', campaignId).single(),
      supabase.from('message_templates').select('id, name, channel, subject, body').order('name'),
    ])
    setProspects(p ?? [])
    setEmailAccounts(a ?? [])
    setCampaign(camp)
    setTemplates(tpl ?? [])
    if (a && a.length > 0 && !emailAccountId) setEmailAccountId(a[0].id)
  }, [campaignId])

  useEffect(() => { load() }, [load])

  // --- AI Generation ---
  async function generateAI() {
    if (!selectedProspectId) { toast.error('Sélectionner un prospect'); return }
    setGenerating(true)
    setMessages([])
    setSelectedVariant(null)

    const body: Record<string, unknown> = {
      prospect_id: selectedProspectId,
      channel,
      sequence_step: parseInt(step),
    }
    if (genMode === 'custom' && customInstructions.trim()) {
      body.custom_instructions = customInstructions.trim()
    }

    const res = await fetch('/api/ai/generate-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    setGenerating(false)
    if (!res.ok) { toast.error(typeof data.error === 'string' ? data.error : 'Erreur génération'); return }
    setMessages(data.messages ?? [])
    if (data.messages?.[0]) setSelectedVariant(data.messages[0])
    toast.success(`${data.messages?.length ?? 0} variantes générées`)
  }

  // --- Template Application ---
  async function applyTemplate() {
    if (!templatePreview || !selectedProspect || !campaign) { toast.error('Sélectionner un modèle et un prospect'); return }
    setGenerating(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Non authentifié'); setGenerating(false); return }

    const { data: saved, error } = await supabase
      .from('outreach_messages')
      .insert({
        prospect_id: selectedProspectId,
        campaign_id: campaignId,
        user_id: user.id,
        channel,
        sequence_step: parseInt(step),
        subject: templatePreview.subject ?? null,
        body: templatePreview.body,
        ai_generated: false,
        ai_variant: 1,
        status: 'draft',
      })
      .select()

    setGenerating(false)
    if (error) { toast.error('Erreur : ' + error.message); return }
    if (saved?.[0]) {
      setMessages(saved as OutreachMessage[])
      setSelectedVariant(saved[0] as OutreachMessage)
    }
    toast.success('Modèle appliqué !')
  }

  async function sendEmail() {
    if (!selectedVariant || !emailAccountId) return
    setSending(true)
    const res = await fetch('/api/outreach/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: selectedVariant.id, email_account_id: emailAccountId }),
    })
    const data = await res.json()
    setSending(false)
    if (!res.ok) { toast.error(typeof data.error === 'string' ? data.error : 'Erreur envoi'); return }
    toast.success('Email envoyé !')
    setMessages([])
    setSelectedVariant(null)
    load()
  }

  async function markSocialSent(platform: string) {
    if (!selectedVariant) return
    setMarkingPlatform(platform)
    const res = await fetch('/api/outreach/social/mark-sent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: selectedVariant.id, platform }),
    })
    setMarkingPlatform('')
    if (res.ok) {
      toast.success(`Message marqué comme envoyé via ${platform}`)
      setMessages([])
      setSelectedVariant(null)
    } else {
      toast.error('Erreur')
    }
  }

  function openSocialProfile(prospect: Prospect, platform: string) {
    const urls: Record<string, string | null> = {
      linkedin: prospect.linkedin_url,
      facebook: prospect.facebook_url,
      instagram: prospect.instagram_url,
      twitter: prospect.twitter_url,
      whatsapp: prospect.whatsapp_number ? `https://wa.me/${prospect.whatsapp_number.replace(/[^0-9]/g, '')}` : null,
    }
    const url = urls[platform]
    if (url) window.open(url, '_blank')
    else toast.error(`Pas de profil ${platform} pour ce prospect`)
  }

  function handleGenerate() {
    if (genMode === 'template') applyTemplate()
    else generateAI()
  }

  const generateLabel = () => {
    if (generating) return <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Génération...</>
    if (genMode === 'ai') return '✨ Générer par IA'
    if (genMode === 'template') return '📋 Appliquer le modèle'
    return '✨ Générer avec instructions'
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/campaigns/${campaignId}`}><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Retour</Button></Link>
        <h1 className="text-xl font-bold text-gray-900">Outreach — Générer & Envoyer</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Config */}
        <Card>
          <CardHeader><CardTitle className="text-base">Configuration</CardTitle></CardHeader>
          <CardContent className="space-y-4">

            {/* Prospect */}
            <div className="space-y-2">
              <Label>Prospect *</Label>
              <Select value={selectedProspectId} onValueChange={setSelectedProspectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un prospect..." />
                </SelectTrigger>
                <SelectContent>
                  {prospects.map(p => {
                    const socialCount = [p.linkedin_url, p.facebook_url, p.instagram_url, p.twitter_url, p.whatsapp_number].filter(Boolean).length
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {p.domain} {p.company_name ? `— ${p.company_name}` : ''}
                        {!p.email && channel === 'email' ? ' ⚠️' : ''}
                        {socialCount > 0 ? ` · ${socialCount} réseau${socialCount > 1 ? 'x' : ''}` : ''}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {selectedProspect && (
                <div className="text-xs text-gray-500 space-y-1">
                  {selectedProspect.email && <p>📧 {selectedProspect.email}</p>}
                  {selectedProspect.company_name && <p>🏢 {selectedProspect.company_name}</p>}
                  {selectedProspect.website_description && <p className="italic truncate">"{selectedProspect.website_description}"</p>}
                </div>
              )}
            </div>

            {/* Canal */}
            <div className="space-y-2">
              <Label>Canal</Label>
              <Select value={channel} onValueChange={(v) => { setChannel(v); setMessages([]); setSelectedVariant(null) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableChannels.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedProspect && availableChannels.length < ALL_CHANNELS.length && (
                <p className="text-xs text-amber-600">
                  ⚠️ {ALL_CHANNELS.length - availableChannels.length} canal(aux) masqué(s) — profil non trouvé lors du scraping.
                </p>
              )}
            </div>

            {/* Étape */}
            <div className="space-y-2">
              <Label>Étape de la séquence</Label>
              <Select value={step} onValueChange={setStep}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Étape 1 — Premier contact</SelectItem>
                  <SelectItem value="2">Étape 2 — Follow-up J+4</SelectItem>
                  <SelectItem value="3">Étape 3 — Dernier follow-up J+10</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Email account */}
            {channel === 'email' && (
              <div className="space-y-2">
                <Label>Compte email</Label>
                <Select value={emailAccountId} onValueChange={setEmailAccountId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {emailAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.display_name} — {a.sent_today}/{a.daily_limit}/jour
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* ─── Mode de génération ─── */}
            <div className="space-y-2 pt-1">
              <Label>Mode de génération</Label>
              <div className="flex gap-2">
                {[
                  { id: 'ai' as GenerationMode, icon: <Sparkles className="h-3.5 w-3.5" />, label: 'IA auto' },
                  { id: 'template' as GenerationMode, icon: <FileText className="h-3.5 w-3.5" />, label: 'Modèle' },
                  { id: 'custom' as GenerationMode, icon: <SlidersHorizontal className="h-3.5 w-3.5" />, label: 'Instructions' },
                ].map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setGenMode(m.id); setMessages([]); setSelectedVariant(null) }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      genMode === m.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {m.icon}{m.label}
                  </button>
                ))}
              </div>

              {/* Template mode */}
              {genMode === 'template' && (
                <div className="space-y-3 pt-1">
                  {channelTemplates.length === 0 ? (
                    <div className="rounded-lg bg-gray-50 border border-dashed p-3 text-center">
                      <p className="text-xs text-gray-500">Aucun modèle pour ce canal.</p>
                      <Link href="/templates" className="text-xs text-blue-600 hover:underline">
                        Créer un modèle →
                      </Link>
                    </div>
                  ) : (
                    <>
                      <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Choisir un modèle..." />
                        </SelectTrigger>
                        <SelectContent>
                          {channelTemplates.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {templatePreview && (
                        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs space-y-1">
                          <p className="font-medium text-blue-700">Aperçu :</p>
                          {templatePreview.subject && <p className="text-gray-600">Sujet : <span className="font-medium">{templatePreview.subject}</span></p>}
                          <p className="text-gray-700 whitespace-pre-wrap line-clamp-4">{templatePreview.body}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Custom instructions mode */}
              {genMode === 'custom' && (
                <div className="space-y-2 pt-1">
                  <Textarea
                    rows={4}
                    placeholder="Ex: Mentionne que leur club de karaté est basé en France et que le .com renforcerait leur présence internationale. Ton plus direct car ils n'ont pas répondu au 1er mail."
                    value={customInstructions}
                    onChange={e => setCustomInstructions(e.target.value)}
                    className="text-sm resize-none"
                  />
                  <p className="text-xs text-gray-400">L'IA tiendra compte de ces instructions en plus du contexte habituel.</p>
                </div>
              )}

              {/* AI mode description */}
              {genMode === 'ai' && (
                <p className="text-xs text-gray-400">Claude génère 3 variantes automatiquement selon le prospect et le canal.</p>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleGenerate}
              disabled={generating || !selectedProspectId || (genMode === 'template' && !selectedTemplateId)}
            >
              {generateLabel()}
            </Button>
          </CardContent>
        </Card>

        {/* Right: Messages */}
        <div className="space-y-4">
          {messages.length > 0 && (
            <>
              {/* Variant selector */}
              {messages.length > 1 && (
                <div className="flex gap-2">
                  {messages.map((m) => (
                    <Button
                      key={m.id}
                      variant={selectedVariant?.id === m.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedVariant(m)}
                    >
                      Variante {m.ai_variant}
                    </Button>
                  ))}
                </div>
              )}

              {selectedVariant && (
                <Card>
                  <CardContent className="pt-5 space-y-3">
                    {channel === 'email' && selectedVariant.subject && (
                      <div>
                        <Label className="text-xs text-gray-500">Sujet</Label>
                        <p className="font-medium text-gray-900 mt-1">{selectedVariant.subject}</p>
                      </div>
                    )}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-gray-500">Message</Label>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedVariant.body)
                            toast.success('Copié !')
                          }}
                        >
                          <Copy className="h-3 w-3 mr-1" />Copier
                        </Button>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {selectedVariant.body}
                      </div>
                    </div>

                    {/* Send actions */}
                    {channel === 'email' ? (
                      <div className="pt-2 border-t">
                        {selectedProspect?.email ? (
                          <Button className="w-full" onClick={sendEmail} disabled={sending || !emailAccountId}>
                            {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Envoi...</> : <><Send className="h-4 w-4 mr-2" />Envoyer à {selectedProspect.email}</>}
                          </Button>
                        ) : (
                          <p className="text-sm text-red-500 text-center">⚠️ Ce prospect n'a pas d'email. Scrapez-le d'abord.</p>
                        )}
                      </div>
                    ) : (
                      <div className="pt-2 border-t space-y-2">
                        <p className="text-xs text-gray-500">1. Copiez le message, 2. Ouvrez le profil, 3. Envoyez manuellement, 4. Marquez comme envoyé</p>
                        <div className="flex gap-2 flex-wrap">
                          {selectedProspect && (
                            <Button variant="outline" size="sm" onClick={() => openSocialProfile(selectedProspect, channel)}>
                              <ExternalLink className="h-4 w-4 mr-1" />Ouvrir profil {channel}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => markSocialSent(channel)}
                            disabled={!!markingPlatform}
                          >
                            {markingPlatform === channel ? <Loader2 className="h-3 w-3 animate-spin" /> : '✓'} Marqué comme envoyé
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {messages.length === 0 && !generating && (
            <div className="flex flex-col items-center justify-center h-48 bg-gray-50 rounded-xl border-2 border-dashed text-gray-400 text-sm gap-2">
              <p>Les messages générés apparaîtront ici</p>
              {templates.length === 0 && (
                <Link href="/templates" className="text-xs text-blue-500 hover:underline">
                  + Créer vos premiers modèles
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
