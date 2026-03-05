'use client'

import { use, useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { ArrowLeft, ExternalLink, Mail, Linkedin, Facebook, Instagram, Twitter, MessageCircle, Loader2, PlusCircle, Upload, AlertTriangle, Ban, LayoutGrid } from 'lucide-react'
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

const FIELD_LABELS: Record<string, string> = {
  email: 'Email', linkedin_url: 'LinkedIn', facebook_url: 'Facebook',
  instagram_url: 'Instagram', twitter_url: 'Twitter', whatsapp_number: 'WhatsApp',
}

// ── CSV parser (no external dep) ──────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''))
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      // Handle quoted fields with commas inside
      const vals: string[] = []
      let cur = ''
      let inQ = false
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ }
        else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = '' }
        else { cur += ch }
      }
      vals.push(cur.trim())
      return Object.fromEntries(headers.map((h, i) => [h, vals[i]?.replace(/^['"]|['"]$/g, '') ?? '']))
    })
}

// ── Duplicate finder ──────────────────────────────────────────────────────────
type DupGroup = { field: string; value: string; prospects: Prospect[] }

function findDuplicates(prospects: Prospect[]): DupGroup[] {
  const groups: DupGroup[] = []
  const fields = ['email', 'linkedin_url', 'facebook_url', 'instagram_url', 'twitter_url', 'whatsapp_number'] as const
  for (const field of fields) {
    const map = new Map<string, Prospect[]>()
    for (const p of prospects) {
      const val = (p as any)[field] as string | undefined
      if (!val) continue
      if (!map.has(val)) map.set(val, [])
      map.get(val)!.push(p)
    }
    for (const [val, group] of map.entries()) {
      if (group.length > 1) groups.push({ field, value: val, prospects: group })
    }
  }
  return groups
}

export default function ProspectsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(params)
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [selected, setSelected] = useState<Prospect | null>(null)
  const [scrapingIds, setScrapingIds] = useState<Set<string>>(new Set())
  const [unsubscribingId, setUnsubscribingId] = useState<string | null>(null)

  // ── Manual add dialog ─────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [addForm, setAddForm] = useState({
    domain: '', company_name: '', first_name: '', last_name: '', email: '', notes: ''
  })

  // ── CSV import dialog ─────────────────────────────────────────────────────
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvStep, setCsvStep] = useState<'upload' | 'preview'>('upload')
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [csvImporting, setCsvImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Duplicates dialog ─────────────────────────────────────────────────────
  const [dupOpen, setDupOpen] = useState(false)
  const [dupSelected, setDupSelected] = useState<Set<string>>(new Set())
  const [dupDeleting, setDupDeleting] = useState(false)

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

  // ── Scraping ──────────────────────────────────────────────────────────────
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
      await new Promise(r => setTimeout(r, 500))
    }
    toast.success('Scraping terminé')
  }

  async function unsubscribeProspect(prospect: Prospect) {
    if (!confirm(`Marquer "${prospect.domain}" comme "ne plus contacter" ? Tous les messages en attente seront annulés.`)) return
    setUnsubscribingId(prospect.id)
    const res = await fetch(`/api/prospects/${prospect.id}/unsubscribe`, { method: 'POST' })
    setUnsubscribingId(null)
    if (res.ok) {
      toast.success(`${prospect.domain} marqué "ne plus contacter"`)
      setSelected(null)
      load()
    } else {
      toast.error('Erreur')
    }
  }

  async function updateStatus(prospectId: string, status: string) {
    await supabase.from('prospects').update({ status }).eq('id', prospectId)
    load()
    if (selected?.id === prospectId) setSelected(prev => prev ? { ...prev, status: status as any } : null)
  }

  // ── Manual add ────────────────────────────────────────────────────────────
  async function handleAddManual() {
    const domain = addForm.domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!domain) { toast.error('Domaine requis'); return }
    if (!domain.includes('.')) { toast.error('Domaine invalide (ex: exemple.fr)'); return }

    setAddSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Non authentifié'); setAddSaving(false); return }

    const tld = domain.split('.').slice(-1)[0]

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
      first_name: addForm.first_name || null,
      last_name: addForm.last_name || null,
      email: addForm.email || null,
      email_source: addForm.email ? 'manual' : null,
      notes: addForm.notes || null,
    }).select().single()

    if (error) {
      toast.error(error.message.includes('unique') ? 'Ce domaine est déjà dans la campagne' : 'Erreur : ' + error.message)
      setAddSaving(false)
      return
    }

    toast.success(`${domain} ajouté !`)
    setAddOpen(false)
    setAddForm({ domain: '', company_name: '', first_name: '', last_name: '', email: '', notes: '' })
    setAddSaving(false)
    await load()
    if (data?.id) setTimeout(() => scrapeOne(data as Prospect), 300)
  }

  // ── CSV Import ─────────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.csv')) { toast.error('Fichier CSV requis'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = parseCSV(text)
      if (rows.length === 0) { toast.error('Fichier vide ou mal formaté'); return }
      if (!rows[0].domain && !rows[0]['domain']) {
        toast.error('Colonne "domain" manquante dans le CSV')
        return
      }
      setCsvRows(rows)
      setCsvStep('preview')
    }
    reader.readAsText(file)
  }

  async function handleCsvImport() {
    setCsvImporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Non authentifié'); setCsvImporting(false); return }

    const validRows = csvRows.filter(r => (r.domain ?? '').trim().includes('.'))
    if (validRows.length === 0) { toast.error('Aucun domaine valide'); setCsvImporting(false); return }

    const inserts = validRows.map(r => {
      const domain = (r.domain ?? '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
      const tld = domain.split('.').slice(-1)[0]
      return {
        campaign_id: campaignId,
        user_id: user.id,
        domain,
        tld,
        domain_type: 'other' as const,
        scrape_status: 'pending' as const,
        status: 'to_contact' as const,
        priority: 5,
        company_name: r.company_name?.trim() || null,
        first_name: r.first_name?.trim() || null,
        last_name: r.last_name?.trim() || null,
        email: r.email?.trim() || null,
        email_source: r.email?.trim() ? 'manual' : null,
        phone: r.phone?.trim() || null,
        linkedin_url: r.linkedin_url?.trim() || null,
        facebook_url: r.facebook_url?.trim() || null,
        instagram_url: r.instagram_url?.trim() || null,
        twitter_url: r.twitter_url?.trim() || null,
        whatsapp_number: r.whatsapp_number?.trim() || null,
        notes: r.notes?.trim() || null,
      }
    })

    const { data: saved, error } = await supabase
      .from('prospects')
      .upsert(inserts, { onConflict: 'campaign_id,domain', ignoreDuplicates: true })
      .select()

    setCsvImporting(false)
    if (error) { toast.error('Erreur import : ' + error.message); return }

    const imported = saved?.length ?? 0
    const skipped = inserts.length - imported
    toast.success(`${imported} prospect${imported > 1 ? 's' : ''} importé${imported > 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} ignoré${skipped > 1 ? 's' : ''} — déjà présents)` : ''} !`)
    setCsvOpen(false)
    setCsvStep('upload')
    setCsvRows([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    await load()

    // Auto-scrape all new prospects
    if (saved && saved.length > 0) {
      const toScrape = saved as Prospect[]
      toast.info(`Lancement du scraping de ${toScrape.length} prospect${toScrape.length > 1 ? 's' : ''}...`)
      for (const p of toScrape) {
        await scrapeOne(p)
        await new Promise(r => setTimeout(r, 400))
      }
      toast.success('Scraping terminé !')
    }
  }

  function openCsvDialog() {
    setCsvStep('upload')
    setCsvRows([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    setCsvOpen(true)
  }

  // ── Duplicates ─────────────────────────────────────────────────────────────
  const dupGroups = findDuplicates(prospects)
  const dupCount = new Set(dupGroups.flatMap(g => g.prospects.slice(1).map(p => p.id))).size

  function openDuplicates() {
    // Pre-select all but the first in each group
    const preSelected = new Set<string>()
    for (const g of dupGroups) {
      g.prospects.slice(1).forEach(p => preSelected.add(p.id))
    }
    setDupSelected(preSelected)
    setDupOpen(true)
  }

  function toggleDupSelect(id: string) {
    setDupSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleDeleteDuplicates() {
    if (dupSelected.size === 0) return
    if (!confirm(`Supprimer définitivement ${dupSelected.size} prospect${dupSelected.size > 1 ? 's' : ''} en doublon ?`)) return

    setDupDeleting(true)
    const ids = [...dupSelected]
    const { error } = await supabase.from('prospects').delete().in('id', ids)
    setDupDeleting(false)

    if (error) { toast.error('Erreur suppression : ' + error.message); return }

    toast.success(`${ids.length} doublon${ids.length > 1 ? 's' : ''} supprimé${ids.length > 1 ? 's' : ''}`)
    setDupOpen(false)
    setDupSelected(new Set())
    await load()
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  const filtered = filterStatus === 'all' ? prospects : prospects.filter(p => p.status === filterStatus)
  const pendingScrape = prospects.filter(p => p.scrape_status === 'pending' || p.scrape_status === 'failed').length

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href={`/campaigns/${campaignId}`}><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Retour</Button></Link>
        <h1 className="text-xl font-bold text-gray-900">Prospects — {prospects.length} trouvés</h1>
        <div className="ml-auto">
          <Link href={`/campaigns/${campaignId}/platforms`}>
            <Button variant="outline" size="sm">
              <LayoutGrid className="h-4 w-4 mr-1" />Vue par plateforme
            </Button>
          </Link>
        </div>
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

        <Button size="sm" variant="outline" onClick={openCsvDialog}>
          <Upload className="h-4 w-4 mr-1" />
          Importer CSV
        </Button>

        {dupCount > 0 && (
          <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={openDuplicates}>
            <AlertTriangle className="h-4 w-4 mr-1" />
            {dupCount} doublon{dupCount > 1 ? 's' : ''}
          </Button>
        )}
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
                    {((p as any).first_name || (p as any).last_name) && (
                      <p className="text-xs text-gray-500">
                        👤 {[(p as any).first_name, (p as any).last_name].filter(Boolean).join(' ')}
                      </p>
                    )}
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
                        {p.email_confidence && <span className="ml-1 text-xs text-gray-400">({p.email_confidence}%)</span>}
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

      {/* ── Manual Add Dialog ─────────────────────────────────────────────── */}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Prénom du contact</Label>
                <Input
                  placeholder="Jean"
                  value={addForm.first_name}
                  onChange={e => setAddForm(prev => ({ ...prev, first_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Nom du contact</Label>
                <Input
                  placeholder="Dupont"
                  value={addForm.last_name}
                  onChange={e => setAddForm(prev => ({ ...prev, last_name: e.target.value }))}
                />
              </div>
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

      {/* ── CSV Import Dialog ─────────────────────────────────────────────── */}
      <Dialog open={csvOpen} onOpenChange={(o) => { if (!o) { setCsvOpen(false); setCsvStep('upload'); setCsvRows([]) } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {csvStep === 'upload' ? 'Importer des prospects via CSV' : `Aperçu — ${csvRows.length} ligne${csvRows.length > 1 ? 's' : ''} détectée${csvRows.length > 1 ? 's' : ''}`}
            </DialogTitle>
          </DialogHeader>

          {csvStep === 'upload' ? (
            <div className="space-y-5 py-2">
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm space-y-2">
                <p className="font-medium text-blue-800">Format CSV attendu :</p>
                <code className="block bg-white rounded border border-blue-200 p-2 text-xs text-gray-700 font-mono overflow-x-auto whitespace-pre">
{`domain,company_name,first_name,last_name,email,phone,linkedin_url,facebook_url,instagram_url,twitter_url,whatsapp_number,notes
karate-club.fr,Karate Club Paris,Jean,Dupont,jean@karate-club.fr,+33612345678,linkedin.com/in/jean,facebook.com/karateclub,,@karateclub,,`}
                </code>
                <p className="text-blue-700 text-xs">Seule la colonne <strong>domain</strong> est obligatoire. Les profils sociaux déjà connus ne seront pas re-scrappés.</p>
              </div>
              <div className="space-y-2">
                <Label>Fichier CSV</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="cursor-pointer"
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0 py-2">
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {Object.keys(csvRows[0] ?? {}).map(k => (
                        <th key={k} className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {csvRows.slice(0, 50).map((row, i) => (
                      <tr key={i} className={!row.domain?.includes('.') ? 'bg-red-50' : 'hover:bg-gray-50'}>
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-3 py-2 text-gray-700 max-w-[200px] truncate">{v || <span className="text-gray-300">—</span>}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvRows.length > 50 && (
                <p className="text-xs text-gray-400 mt-2 text-center">Affichage limité aux 50 premières lignes — {csvRows.length} lignes au total.</p>
              )}
              {csvRows.some(r => !r.domain?.includes('.')) && (
                <p className="text-xs text-red-500 mt-2">⚠️ Les lignes en rouge ont un domaine invalide et seront ignorées.</p>
              )}
            </div>
          )}

          <DialogFooter className="mt-2 flex-shrink-0">
            {csvStep === 'upload' ? (
              <Button variant="outline" onClick={() => setCsvOpen(false)}>Annuler</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setCsvStep('upload'); setCsvRows([]); if (fileInputRef.current) fileInputRef.current.value = '' }}>
                  ← Changer de fichier
                </Button>
                <Button onClick={handleCsvImport} disabled={csvImporting}>
                  {csvImporting
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Import en cours...</>
                    : <><Upload className="h-4 w-4 mr-2" />Importer {csvRows.filter(r => r.domain?.includes('.')).length} prospects</>
                  }
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Duplicates Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Doublons détectés
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 -mt-1">
            Les prospects ci-dessous partagent le même email ou profil social. Cochez ceux à supprimer, gardez ceux qui ont le plus de données.
          </p>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2">
            {dupGroups.map((group, gi) => (
              <div key={gi} className="rounded-lg border border-orange-200 bg-orange-50 overflow-hidden">
                <div className="px-3 py-2 bg-orange-100 border-b border-orange-200">
                  <span className="text-xs font-semibold text-orange-800">
                    {FIELD_LABELS[group.field]} : <span className="font-mono">{group.value.length > 50 ? group.value.substring(0, 50) + '…' : group.value}</span>
                  </span>
                  <span className="ml-2 text-xs text-orange-600">({group.prospects.length} prospects)</span>
                </div>
                <div className="divide-y divide-orange-100">
                  {group.prospects.map((p, pi) => {
                    const isChecked = dupSelected.has(p.id)
                    return (
                      <label
                        key={p.id}
                        className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${isChecked ? 'bg-red-50' : 'hover:bg-orange-50'}`}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleDupSelect(p.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-gray-900">{p.domain}</span>
                            {pi === 0 && <Badge variant="outline" className="text-xs text-green-700 border-green-300">À garder</Badge>}
                            {isChecked && <Badge variant="destructive" className="text-xs">À supprimer</Badge>}
                          </div>
                          <div className="text-xs text-gray-500 flex gap-3 mt-0.5 flex-wrap">
                            {p.company_name && <span>🏢 {p.company_name}</span>}
                            {(p as any).first_name && <span>👤 {(p as any).first_name} {(p as any).last_name ?? ''}</span>}
                            {p.email && <span>📧 {p.email}</span>}
                            <span className={`${STATUS_COLORS[p.status]} px-1.5 rounded-full`}>{STATUS_LABELS[p.status]}</span>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="mt-2 flex-shrink-0 flex items-center justify-between w-full">
            <span className="text-sm text-gray-500">
              {dupSelected.size} sélectionné{dupSelected.size > 1 ? 's' : ''}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDupOpen(false)}>Annuler</Button>
              <Button
                variant="destructive"
                onClick={handleDeleteDuplicates}
                disabled={dupDeleting || dupSelected.size === 0}
              >
                {dupDeleting
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Suppression...</>
                  : `Supprimer ${dupSelected.size} doublon${dupSelected.size > 1 ? 's' : ''}`
                }
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail Sheet ──────────────────────────────────────────────────── */}
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

                {/* Company / Contact */}
                {selected.company_name && <InfoRow label="Entreprise" value={selected.company_name} />}
                {((selected as any).first_name || (selected as any).last_name) && (
                  <InfoRow
                    label="Contact"
                    value={[(selected as any).first_name, (selected as any).last_name].filter(Boolean).join(' ')}
                  />
                )}
                {selected.website_description && <InfoRow label="Description site" value={selected.website_description} />}

                {/* Email */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Mail className="h-4 w-4" /> Email
                  </p>
                  {selected.email ? (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="font-mono text-sm">{selected.email}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Source: {selected.email_source}
                        {selected.email_confidence ? ` · Confiance: ${selected.email_confidence}%` : ''}
                      </p>
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
                <div className="pt-2 border-t space-y-2">
                  <Link href={`/campaigns/${campaignId}/outreach?prospect=${selected.id}`}>
                    <Button className="w-full">✉️ Générer un message pour ce prospect</Button>
                  </Link>
                  <Button
                    variant="outline"
                    className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => unsubscribeProspect(selected)}
                    disabled={unsubscribingId === selected.id}
                  >
                    {unsubscribingId === selected.id
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />En cours...</>
                      : <><Ban className="h-4 w-4 mr-2" />Ne plus contacter</>
                    }
                  </Button>
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
