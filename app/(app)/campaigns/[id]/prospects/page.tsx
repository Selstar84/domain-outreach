'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { ArrowLeft, ExternalLink, Mail, Linkedin, Facebook, Instagram, Twitter, MessageCircle, Loader2, PlusCircle } from 'lucide-react'
import Link from 'next/link'
import type { Prospect } from '@/types/database'

const STATUS_LABELS: Record<string, string> = {
  to_contact: 'À contacter', contacted: 'Contacté', replied: 'A répondu',
  negotiating: 'En négociation', sold: 'Vendu', dead: 'Mort', skipped: 'Ignoré',
}
const STATUS_COLORS: Record<string, string> = {
  to_contact: 'bg-blue-100 text-blue-800', contacted: 'bg-yellow-100 text-yellow-800',
  replied: 'bg-purple-100 text-purple-800', negotiating: 'bg-orange-100 text-orange-800',
  sold: 'bg-green-100 text-green-800', dead: 'bg-red-100 text-red-800',
  skipped: 'bg-gray-100 text-gray-700',
}
const SCRAPE_COLORS: Record<string, string> = {
  pending: 'text-gray-400', running: 'text-blue-500', completed: 'text-green-600', failed: 'text-red-500', skipped: 'text-gray-400',
}

export default function ProspectsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(params)
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [selected, setSelected] = useState<Prospect | null>(null)
  const [scrapingIds, setScrapingIds] = useState<Set<string>>(new Set())

  // Manual add dialog state
  const [addOpen, setAddOpen] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [addForm, setAddForm] = useState({ domain: '', company_name: '', email: '', notes: '' })

  const supabase = createClient()

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('prospects')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
    setProspects(data ?? [])
    setLoading(false)
  }, [campaignId])

  useEffect(() => { load() }, [load])

  async function scrapeOne(prospect: Prospect) {
    setScrapingIds(prev => new Set(prev).add(prospect.id))
    const res = await fetch(`/api/prospects/${prospect.id}/scrape`, { method: 'POST' })
    setScrapingIds(prev => { const s = new Set(prev); s.delete(prospect.id); return s })
    if (res.ok) {
      toast.success(`Scraped ${prospect.domain}`)
      load()
      if (selected?.id === prospect.id) {
        const { data } = await supabase.from('prospects').select('*').eq('id', prospect.id).single()
        if (data) setSelected(data)
      }
    } else {
      toast.error(`Erreur scraping ${prospect.domain}`)
    }
  }

  async function scrapeAll() {
    const toScrape = prospects.filter(p => p.scrape_status === 'pending' || p.scrape_status === 'failed')
    toast.info(`Scraping ${toScrape.length} prospects...`)
    for (const p of toScrape) {
      await scrapeOne(p)
      await new Promise(r => setTimeout(r, 500)) // Small delay
    }
    toast.success('Scraping terminé')
  }

  async function updateStatus(prospectId: string, status: string) {
    await supabase.from('prospects').update({ status }).eq('id', prospectId)
    load()
    if (selected?.id === prospectId) setSelected(prev => prev ? { ...prev, status: status as any } : null)
  }

  async function handleAddManual() {
    const domain = addForm.domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!domain) { toast.error('Domaine requis'); return }
    if (!domain.includes('.')) { toast.error('Domaine invalide (ex: exemple.fr)'); return }

    setAddSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Non authentifié'); setAddSaving(false); return }

    const parts = domain.split('.')
    const tld = parts[parts.length - 1]

    const { data, error } = await supabase.from('prospects').insert({
      campaign_id: campaignId,
      user_id: user.id,
      domain,
      tld,
      domain_type: 'other',
      scrape_status: 'pending',
      status: 'to_contact',
      priority: 5,
      company_name: addForm.company_name || null,
      email: addForm.email || null,
      notes: addForm.notes || null,
    }).select().single()

    if (error) {
      toast.error(error.message.includes('unique') ? 'Ce domaine est déjà dans la campagne' : 'Erreur : ' + error.message)
      setAddSaving(false)
      return
    }

    toast.success(`${domain} ajouté !`)
    setAddOpen(false)
    setAddForm({ domain: '', company_name: '', email: '', notes: '' })
    setAddSaving(false)
    await load()

    // Auto-trigger scrape
    if (data?.id) {
      setTimeout(() => scrapeOne(data as Prospect), 300)
    }
  }

  const filtered = filterStatus === 'all' ? prospects : prospects.filter(p => p.status === filterStatus)
  const pendingScrape = prospects.filter(p => p.scrape_status === 'pending' || p.scrape_status === 'failed').length

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/campaigns/${campaignId}`}><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Retour</Button></Link>
        <h1 className="text-xl font-bold text-gray-900">Prospects — {prospects.length} trouvés</h1>
      </div>

      {/* Filters & Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous ({prospects.length})</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {pendingScrape > 0 && (
          <Button variant="outline" size="sm" onClick={scrapeAll}>
            Scraper tout ({pendingScrape} en attente)
          </Button>
        )}

        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <PlusCircle className="h-4 w-4 mr-1" />
          Ajouter manuellement
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400">Aucun prospect.</p>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Domaine</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Contact</th>
                <th className="text-left px-4 py-3 font-medium">Réseaux</th>
                <th className="text-left px-4 py-3 font-medium">Statut</th>
                <th className="text-left px-4 py-3 font-medium">Scraping</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(p)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{p.domain}</span>
                      <a href={`https://${p.domain}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                        <ExternalLink className="h-3 w-3 text-gray-400 hover:text-blue-500" />
                      </a>
                    </div>
                    {p.company_name && <p className="text-xs text-gray-400">{p.company_name}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">
                      {p.domain_type === 'same_word_diff_tld' ? 'Même mot' : p.domain_type === 'contains_word' ? 'Contient mot' : 'Manuel'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.email ? (
                      <div>
                        <span className="text-xs font-mono text-gray-700">{p.email}</span>
                        <span className="ml-1 text-xs text-gray-400">({p.email_confidence}%)</span>
                      </div>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {p.linkedin_url && <Linkedin className="h-4 w-4 text-blue-600" />}
                      {p.facebook_url && <Facebook className="h-4 w-4 text-blue-500" />}
                      {p.instagram_url && <Instagram className="h-4 w-4 text-pink-500" />}
                      {p.twitter_url && <Twitter className="h-4 w-4 text-sky-500" />}
                      {p.whatsapp_number && <MessageCircle className="h-4 w-4 text-green-500" />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${SCRAPE_COLORS[p.scrape_status]}`}>{p.scrape_status}</span>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={scrapingIds.has(p.id) || p.scrape_status === 'running'}
                      onClick={() => scrapeOne(p)}
                    >
                      {scrapingIds.has(p.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : '↺'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un prospect manuellement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Domaine <span className="text-red-500">*</span></Label>
              <Input
                placeholder="exemple.fr ou www.exemple.fr"
                value={addForm.domain}
                onChange={e => setAddForm(prev => ({ ...prev, domain: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAddManual()}
              />
              <p className="text-xs text-gray-400">Le site sera automatiquement scrappé pour trouver email et réseaux sociaux.</p>
            </div>
            <div className="space-y-2">
              <Label>Nom de l'entreprise</Label>
              <Input
                placeholder="Karate Club Paris"
                value={addForm.company_name}
                onChange={e => setAddForm(prev => ({ ...prev, company_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Email (optionnel, si déjà connu)</Label>
              <Input
                type="email"
                placeholder="contact@exemple.fr"
                value={addForm.email}
                onChange={e => setAddForm(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                placeholder="Trouvé via Google, très pertinent..."
                value={addForm.notes}
                onChange={e => setAddForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addSaving}>Annuler</Button>
            <Button onClick={handleAddManual} disabled={addSaving}>
              {addSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PlusCircle className="h-4 w-4 mr-1" />}
              Ajouter et scraper
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[480px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selected.domain}
                  <a href={`https://${selected.domain}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 text-gray-400" />
                  </a>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-5">
                {/* Status */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Statut CRM</p>
                  <Select value={selected.status} onValueChange={(v) => updateStatus(selected.id, v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Company */}
                {selected.company_name && (
                  <InfoRow label="Entreprise" value={selected.company_name} />
                )}
                {selected.website_description && (
                  <InfoRow label="Description site" value={selected.website_description} />
                )}

                {/* Email */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Mail className="h-4 w-4" /> Email
                  </p>
                  {selected.email ? (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="font-mono text-sm">{selected.email}</p>
                      <p className="text-xs text-gray-400 mt-1">Source: {selected.email_source} · Confiance: {selected.email_confidence}%</p>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <p className="text-sm text-gray-400">Aucun email trouvé.</p>
                      <Button size="sm" variant="outline" onClick={() => scrapeOne(selected)} disabled={scrapingIds.has(selected.id)}>
                        {scrapingIds.has(selected.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Re-scraper'}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Social links */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Réseaux sociaux</p>
                  <div className="space-y-2">
                    {selected.linkedin_url && <SocialLink icon={<Linkedin className="h-4 w-4 text-blue-600" />} label="LinkedIn" url={selected.linkedin_url} />}
                    {selected.facebook_url && <SocialLink icon={<Facebook className="h-4 w-4 text-blue-500" />} label="Facebook" url={selected.facebook_url} />}
                    {selected.instagram_url && <SocialLink icon={<Instagram className="h-4 w-4 text-pink-500" />} label="Instagram" url={selected.instagram_url} />}
                    {selected.twitter_url && <SocialLink icon={<Twitter className="h-4 w-4 text-sky-500" />} label="Twitter/X" url={selected.twitter_url} />}
                    {selected.whatsapp_number && (
                      <SocialLink icon={<MessageCircle className="h-4 w-4 text-green-500" />} label="WhatsApp" url={`https://wa.me/${selected.whatsapp_number.replace(/[^0-9]/g, '')}`} />
                    )}
                    {!selected.linkedin_url && !selected.facebook_url && !selected.instagram_url && !selected.twitter_url && !selected.whatsapp_number && (
                      <p className="text-sm text-gray-400">Aucun réseau trouvé.</p>
                    )}
                  </div>
                </div>

                {/* Outreach link */}
                <div className="pt-2 border-t">
                  <Link href={`/campaigns/${campaignId}/outreach?prospect=${selected.id}`}>
                    <Button className="w-full">✉️ Générer un message pour ce prospect</Button>
                  </Link>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  )
}

function SocialLink({ icon, label, url }: { icon: React.ReactNode; label: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
      {icon}
      <span className="text-sm text-gray-700">{label}</span>
      <ExternalLink className="h-3 w-3 text-gray-400 ml-auto" />
    </a>
  )
}
