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
import { ArrowLeft, Loader2, Copy, Send, ExternalLink, Linkedin, Facebook, Instagram, Twitter, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import type { Prospect, EmailAccount, OutreachMessage } from '@/types/database'

const CHANNELS = [
  { value: 'email', label: '📧 Email' },
  { value: 'linkedin', label: '💼 LinkedIn' },
  { value: 'facebook', label: '👤 Facebook' },
  { value: 'instagram', label: '📸 Instagram' },
  { value: 'whatsapp', label: '💬 WhatsApp' },
  { value: 'twitter', label: '🐦 Twitter/X' },
]

const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  linkedin: <Linkedin className="h-4 w-4" />,
  facebook: <Facebook className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
  twitter: <Twitter className="h-4 w-4" />,
  whatsapp: <MessageCircle className="h-4 w-4" />,
}

export default function OutreachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(params)
  const searchParams = useSearchParams()
  const defaultProspectId = searchParams.get('prospect')

  const [prospects, setProspects] = useState<Prospect[]>([])
  const [emailAccounts, setEmailAccounts] = useState<Pick<EmailAccount, 'id' | 'email_address' | 'display_name' | 'is_active' | 'is_verified' | 'daily_limit' | 'sent_today'>[]>([])
  const [selectedProspectId, setSelectedProspectId] = useState(defaultProspectId ?? '')
  const [channel, setChannel] = useState('email')
  const [step, setStep] = useState('1')
  const [messages, setMessages] = useState<OutreachMessage[]>([])
  const [selectedVariant, setSelectedVariant] = useState<OutreachMessage | null>(null)
  const [emailAccountId, setEmailAccountId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [markingPlatform, setMarkingPlatform] = useState('')
  const supabase = createClient()

  const selectedProspect = prospects.find(p => p.id === selectedProspectId)

  const load = useCallback(async () => {
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from('prospects').select('*').eq('campaign_id', campaignId).order('priority', { ascending: false }),
      supabase.from('email_accounts').select('id, email_address, display_name, is_active, is_verified, daily_limit, sent_today').eq('is_active', true),
    ])
    setProspects(p ?? [])
    setEmailAccounts(a ?? [])
    if (a && a.length > 0 && !emailAccountId) setEmailAccountId(a[0].id)
  }, [campaignId])

  useEffect(() => { load() }, [load])

  async function generate() {
    if (!selectedProspectId) { toast.error('Sélectionner un prospect'); return }
    setGenerating(true)
    setMessages([])
    setSelectedVariant(null)

    const res = await fetch('/api/ai/generate-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospect_id: selectedProspectId,
        channel,
        sequence_step: parseInt(step),
      }),
    })

    const data = await res.json()
    setGenerating(false)
    if (!res.ok) { toast.error(typeof data.error === 'string' ? data.error : 'Erreur génération'); return }
    setMessages(data.messages ?? [])
    if (data.messages?.[0]) setSelectedVariant(data.messages[0])
    toast.success(`${data.messages?.length ?? 0} variantes générées`)
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
            <div className="space-y-2">
              <Label>Prospect *</Label>
              <Select value={selectedProspectId} onValueChange={setSelectedProspectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un prospect..." />
                </SelectTrigger>
                <SelectContent>
                  {prospects.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.domain} {p.company_name ? `— ${p.company_name}` : ''}
                      {!p.email && channel === 'email' ? ' ⚠️' : ''}
                    </SelectItem>
                  ))}
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

            <div className="space-y-2">
              <Label>Canal</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

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

            <Button className="w-full" onClick={generate} disabled={generating || !selectedProspectId}>
              {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Génération en cours...</> : '✨ Générer les messages'}
            </Button>
          </CardContent>
        </Card>

        {/* Right: Messages */}
        <div className="space-y-4">
          {messages.length > 0 && (
            <>
              {/* Variant selector */}
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
                        <p className="text-xs text-gray-500">1. Copiez le message ci-dessus, 2. Ouvrez le profil, 3. Envoyez manuellement, 4. Marquez comme envoyé</p>
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
            <div className="flex items-center justify-center h-48 bg-gray-50 rounded-xl border-2 border-dashed text-gray-400 text-sm">
              Les messages générés apparaîtront ici
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
