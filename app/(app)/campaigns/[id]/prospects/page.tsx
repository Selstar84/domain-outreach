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
import { ArrowLeft, ExternalLink, Mail, Linkedin, Facebook, Instagram, Twitter, MessageCircle, Loader2, PlusCircle, Upload, AlertTriangle, Ban, LayoutGrid, Pencil, Save, X } from 'lucide-react'
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

// ── Column header normalizer (accepts FR/EN variants) ─────────────────────────
function normalizeHeader(h: string): string {
  const s = h.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const map: Record<string, string> = {
    domaine: 'domain', site: 'domain', site_web: 'domain', website: 'domain',
    entreprise: 'company_name', company: 'company_name', societe: 'company_name', organisation: 'company_name', organization: 'company_name',
    prenom: 'first_name', firstname: 'first_name', first_name: 'first_name', given_name: 'first_name',
    nom: 'last_name', lastname: 'last_name', last_name: 'last_name', family_name: 'last_name', surname: 'last_name',
    mail: 'email', courriel: 'email', e_mail: 'email', adresse_email: 'email', emails: 'email',
    title: 'company_name', titre: 'company_name', nom_entreprise: 'company_name',
    tel: 'phone', telephone: 'phone', mobile: 'phone', cellulaire: 'phone',
    linkedin: 'linkedin_url', profil_linkedin: 'linkedin_url', compte_linkedin: 'linkedin_url', lien_linkedin: 'linkedin_url',
    facebook: 'facebook_url', page_facebook: 'facebook_url', compte_facebook: 'facebook_url', fb: 'facebook_url',
    instagram: 'instagram_url', compte_instagram: 'instagram_url', profil_instagram: 'instagram_url', ig: 'instagram_url', insta: 'instagram_url',
    twitter: 'twitter_url', compte_twitter: 'twitter_url', x: 'twitter_url', twitter_x: 'twitter_url',
    whatsapp: 'whatsapp_number', numero_whatsapp: 'whatsapp_number', whatsapp_no: 'whatsapp_number', wa: 'whatsapp_number',
    remarques: 'notes', commentaires: 'notes', note: 'notes', commentaire: 'notes',
  }
  return map[s] ?? s
}

// ── RFC 4180-compliant CSV parser ─────────────────────────────────────────────
function parseCsvLine(line: string, sep: string): string[] {
  const vals: string[] = []
  let i = 0
  while (i <= line.length) {
    if (line[i] === '"') {
      i++
      let cur = ''
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { cur += '"'; i += 2 }
        else if (line[i] === '"') { i++; break }
        else { cur += line[i++] }
      }
      while (i < line.length && line[i] !== sep) i++
      if (line[i] === sep) i++
      vals.push(cur.trim())
    } else {
      let cur = ''
      while (i < line.length && line[i] !== sep) cur += line[i++]
      if (line[i] === sep) i++
      vals.push(cur.trim().replace(/^['"]|['"]$/g, ''))
    }
  }
  return vals
}

function detectSep(line: string): string {
  let inQ = false
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  for (const ch of line) {
    if (ch === '"') inQ = !inQ
    else if (!inQ && ch in counts) counts[ch]++
  }
  if (counts[';'] > counts[','] && counts[';'] > counts['\t']) return ';'
  if (counts['\t'] > counts[',']) return '\t'
  return ','
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const sep = detectSep(lines[0])
  const rawHeaders = parseCsvLine(lines[0], sep).map(h => h.replace(/['"]/g, '').trim())
  const headers = rawHeaders.map(normalizeHeader)
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line, sep)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      if (h && !(h in row)) row[h] = vals[i] ?? '' // first mapping wins
    })
    return row
  })
}

// ── Excel parser (SheetJS) ────────────────────────────────────────────────────
async function parseExcel(file: File): Promise<Record<string, string>[]> {
  const { read, utils } = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const wb = read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw: Record<string, unknown>[] = utils.sheet_to_json(ws, { defval: '' })
  return raw.map(row =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [normalizeHeader(String(k)), String(v ?? '')])
    )
  )
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
  const [cancellingEmailsId, setCancellingEmailsId] = useState<string | null>(null)

  // ── Edit mode ─────────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [editSaving, setEditSaving] = useState(false)

  // ── Contact history ────────────────────────────────────────────────────────
  const [contactHistory, setContactHistory] = useState<any[]>([])

  // ── Manual add dialog ─────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [addForm, setAddForm] = useState({
    domain: '', company_name: '', first_name: '', last_name: '', email: '', notes: ''
  })

  // ── CSV import dialog ─────────────────────────────────────────────────────
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvStep, setCsvStep] = useState<'upload' | 'mapping' | 'preview'>('upload')
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [rawCsvRows, setRawCsvRows] = useState<Record<string, string>[]>([])
  const [detectedCols, setDetectedCols] = useState<string[]>([])
  const [colMap, setColMap] = useState<Record<string, string>>({})
  const [csvImporting, setCsvImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Paste URLs dialog ─────────────────────────────────────────────────────
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteImporting, setPasteImporting] = useState(false)

  // ── Platform paste dialog ─────────────────────────────────────────────────
  const [platformOpen, setPlatformOpen] = useState(false)
  const [platformType, setPlatformType] = useState<'instagram' | 'whatsapp' | 'linkedin' | 'facebook' | 'twitter'>('instagram')
  const [platformText, setPlatformText] = useState('')
  const [platformImporting, setPlatformImporting] = useState(false)

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

  const [scrapeAllProgress, setScrapeAllProgress] = useState<{ done: number; total: number } | null>(null)

  async function scrapeAll(all = false) {
    const toScrape = all
      ? prospects
      : prospects.filter(p => p.scrape_status === 'pending' || p.scrape_status === 'failed')
    if (toScrape.length === 0) { toast.info('Aucun prospect à scraper'); return }
    setScrapeAllProgress({ done: 0, total: toScrape.length })
    for (let i = 0; i < toScrape.length; i++) {
      await scrapeOne(toScrape[i])
      setScrapeAllProgress({ done: i + 1, total: toScrape.length })
      await new Promise(r => setTimeout(r, 400))
    }
    setScrapeAllProgress(null)
    toast.success(`Scraping terminé — ${toScrape.length} prospect${toScrape.length > 1 ? 's' : ''} traité${toScrape.length > 1 ? 's' : ''}`)
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

  async function cancelQueuedEmails(prospect: Prospect) {
    const queued = contactHistory.filter(m => m.channel === 'email' && m.status === 'queued')
    if (queued.length === 0) { toast.info('Aucun email planifié à annuler'); return }
    if (!confirm(`Annuler ${queued.length} email${queued.length > 1 ? 's' : ''} planifié${queued.length > 1 ? 's' : ''} pour "${prospect.domain}" ? Les autres canaux ne sont pas affectés.`)) return
    setCancellingEmailsId(prospect.id)
    const ids = queued.map((m: any) => m.id)
    await supabase.from('outreach_messages').update({ status: 'failed' }).in('id', ids)
    setCancellingEmailsId(null)
    toast.success(`${queued.length} email${queued.length > 1 ? 's' : ''} annulé${queued.length > 1 ? 's' : ''}`)
    loadContactHistory(prospect.id)
  }

  async function updateStatus(prospectId: string, status: string) {
    await supabase.from('prospects').update({ status }).eq('id', prospectId)
    load()
    if (selected?.id === prospectId) setSelected(prev => prev ? { ...prev, status: status as any } : null)
  }

  async function loadContactHistory(prospectId: string) {
    const { data } = await supabase
      .from('outreach_messages')
      .select('id, channel, status, sequence_step, sent_at, scheduled_for, created_at, subject')
      .eq('prospect_id', prospectId)
      .order('created_at', { ascending: true })
    setContactHistory(data ?? [])
  }

  function startEdit(p: Prospect) {
    setEditForm({
      email: p.email ?? '',
      company_name: p.company_name ?? '',
      first_name: (p as any).first_name ?? '',
      last_name: (p as any).last_name ?? '',
      linkedin_url: p.linkedin_url ?? '',
      facebook_url: p.facebook_url ?? '',
      instagram_url: p.instagram_url ?? '',
      twitter_url: p.twitter_url ?? '',
      whatsapp_number: p.whatsapp_number ?? '',
      notes: p.notes ?? '',
    })
    setEditMode(true)
  }

  async function saveEdit() {
    if (!selected) return
    setEditSaving(true)
    const updates: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(editForm)) {
      updates[k] = v.trim() || null
    }
    if (updates.email && updates.email !== selected.email) {
      updates.email_source = 'manual'
    }
    const { data, error } = await supabase
      .from('prospects')
      .update(updates)
      .eq('id', selected.id)
      .select()
      .single()
    setEditSaving(false)
    if (error) { toast.error('Erreur : ' + error.message); return }
    toast.success('Prospect mis à jour')
    setEditMode(false)
    setSelected(data as Prospect)
    load()
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

  // ── CSV / Excel Import ─────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    const isCsv = file.name.endsWith('.csv')
    if (!isExcel && !isCsv) { toast.error('Fichier CSV ou Excel (.xlsx, .xls) requis'); return }

    try {
      let rows: Record<string, string>[]
      if (isExcel) {
        rows = await parseExcel(file)
      } else {
        const text = await file.text()
        rows = parseCSV(text)
      }
      if (rows.length === 0) { toast.error('Fichier vide ou mal formaté'); return }

      // Detect raw column names (before normalization) for manual mapping
      const cols = Object.keys(rows[0])
      setDetectedCols(cols)
      setRawCsvRows(rows)

      // Build initial auto-mapping
      const autoMap: Record<string, string> = {}
      const CANONICAL_FIELDS = ['domain','company_name','first_name','last_name','email','phone','linkedin_url','facebook_url','instagram_url','twitter_url','whatsapp_number','notes']
      for (const field of CANONICAL_FIELDS) {
        // Find a detected col that normalizes to this field
        const match = cols.find(c => normalizeHeader(c) === field)
        if (match) autoMap[field] = match
      }
      setColMap(autoMap)

      if (autoMap.domain) {
        // Auto-mapping found domain → go straight to preview
        const mapped = rows.map(r => remapRow(r, autoMap))
        setCsvRows(mapped)
        setCsvStep('preview')
      } else {
        // Need manual mapping
        setCsvStep('mapping')
      }
    } catch (err) {
      toast.error('Erreur lecture du fichier')
    }
  }

  function remapRow(raw: Record<string, string>, map: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [field, col] of Object.entries(map)) {
      if (col && raw[col] !== undefined) out[field] = raw[col]
    }
    return out
  }

  function applyMapping() {
    if (!colMap.domain) { toast.error('La colonne "domain" est obligatoire'); return }
    const mapped = rawCsvRows.map(r => remapRow(r, colMap))
    setCsvRows(mapped)
    setCsvStep('preview')
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
        email: (() => {
          const raw = r.email?.trim() || ''
          if (!raw) return null
          // Handle multiple emails separated by ; or ,
          const first = raw.split(/[;,]/).map(e => e.trim().replace(/^%20/, '').replace(/^\s+/, '')).find(e => e.includes('@') && !e.startsWith('%'))
          return first || null
        })(),
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
    setRawCsvRows([])
    setDetectedCols([])
    setColMap({})
    if (fileInputRef.current) fileInputRef.current.value = ''
    setCsvOpen(true)
  }

  async function handlePasteImport() {
    const lines = pasteText
      .split(/[\n,;]+/)
      .map(l => l.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, ''))
      .filter(l => l.length > 0 && l.includes('.'))

    if (lines.length === 0) { toast.error('Aucun domaine valide trouvé'); return }

    setPasteImporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Non authentifié'); setPasteImporting(false); return }

    // Deduplicate against existing prospects
    const existingDomains = new Set(prospects.map(p => p.domain.toLowerCase()))
    const newDomains = lines.filter(d => !existingDomains.has(d))
    const skippedCount = lines.length - newDomains.length

    if (newDomains.length === 0) {
      toast.info('Tous ces domaines sont déjà présents dans la campagne')
      setPasteImporting(false)
      return
    }

    const inserts = newDomains.map(domain => ({
      campaign_id: campaignId,
      user_id: user.id,
      domain,
      tld: domain.split('.').slice(-1)[0],
      domain_type: 'other' as const,
      scrape_status: 'pending' as const,
      status: 'to_contact' as const,
      priority: 5,
    }))

    const { data: saved, error } = await supabase.from('prospects').insert(inserts).select()
    if (error) { toast.error('Erreur import : ' + error.message); setPasteImporting(false); return }

    const imported = saved?.length ?? 0
    toast.success(`${imported} prospect${imported > 1 ? 's' : ''} importé${imported > 1 ? 's' : ''}${skippedCount > 0 ? ` (${skippedCount} déjà présent${skippedCount > 1 ? 's' : ''})` : ''} !`)
    setPasteOpen(false)
    setPasteText('')
    await load()

    // Auto-scrape all new prospects
    if (saved && saved.length > 0) {
      toast.info(`Lancement du scraping de ${saved.length} prospect${saved.length > 1 ? 's' : ''}...`)
      for (const p of saved as Prospect[]) {
        await scrapeOne(p)
        await new Promise(r => setTimeout(r, 400))
      }
      toast.success('Scraping terminé !')
    }
    setPasteImporting(false)
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

  // ── Clear individual social field ─────────────────────────────────────────
  async function clearSocialField(prospectId: string, field: string) {
    await supabase.from('prospects').update({ [field]: null }).eq('id', prospectId)
    setSelected(prev => prev ? { ...prev, [field]: null } as Prospect : null)
    setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, [field]: null } as Prospect : p))
    toast.success('Contact supprimé')
  }

  // ── Platform paste import ──────────────────────────────────────────────────
  const PLATFORM_CFG: Record<string, { field: string; label: string; hint: string; parse: (line: string) => { domain: string; [k: string]: string } | null }> = {
    instagram: {
      field: 'instagram_url', label: 'Instagram', hint: 'Un compte par ligne : @handle, handle, ou https://instagram.com/handle',
      parse: (line) => {
        const clean = line.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/^@/, '').replace(/[/?#].*$/, '').toLowerCase()
        return clean && clean.length > 1 ? { domain: `instagram.com/${clean}`, instagram_url: `https://instagram.com/${clean}` } : null
      },
    },
    whatsapp: {
      field: 'whatsapp_number', label: 'WhatsApp', hint: 'Un numéro par ligne : +33612345678, wa.me/33612345678...',
      parse: (line) => {
        const clean = line.trim().replace(/^https?:\/\/wa\.me\//, '+').replace(/(?!^\+)[^0-9]/g, '')
        const num = clean.startsWith('+') ? clean : '+' + clean.replace(/^0/, '')
        return num.length >= 8 ? { domain: `wa.me/${num.replace(/^\+/, '')}`, whatsapp_number: num } : null
      },
    },
    linkedin: {
      field: 'linkedin_url', label: 'LinkedIn', hint: 'Un profil par ligne : linkedin.com/in/nom, @nom...',
      parse: (line) => {
        const m = line.trim().match(/linkedin\.com\/(in|company)\/([^/?# ]+)/i)
        if (m) return { domain: `linkedin.com/${m[1]}/${m[2]}`, linkedin_url: `https://linkedin.com/${m[1]}/${m[2]}` }
        const clean = line.trim().replace(/^@/, '').replace(/[/?# ].*/,'').toLowerCase()
        return clean.length > 1 ? { domain: `linkedin.com/in/${clean}`, linkedin_url: `https://linkedin.com/in/${clean}` } : null
      },
    },
    facebook: {
      field: 'facebook_url', label: 'Facebook', hint: 'Un profil/page par ligne : facebook.com/page, @page...',
      parse: (line) => {
        const clean = line.trim().replace(/^https?:\/\/(www\.)?facebook\.com\//, '').replace(/^@/, '').replace(/[/?# ].*/,'').toLowerCase()
        return clean.length > 1 ? { domain: `facebook.com/${clean}`, facebook_url: `https://facebook.com/${clean}` } : null
      },
    },
    twitter: {
      field: 'twitter_url', label: 'Twitter / X', hint: 'Un compte par ligne : @handle, handle, ou https://x.com/handle',
      parse: (line) => {
        const clean = line.trim().replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//, '').replace(/^@/, '').replace(/[/?# ].*/,'').toLowerCase()
        return clean.length > 1 ? { domain: `twitter.com/${clean}`, twitter_url: `https://twitter.com/${clean}` } : null
      },
    },
  }

  async function handlePlatformImport() {
    const cfg = PLATFORM_CFG[platformType]
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Non authentifié'); return }

    const lines = platformText.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean)
    const parsed = lines.map(cfg.parse).filter(Boolean) as { domain: string; [k: string]: string }[]
    if (parsed.length === 0) { toast.error('Aucun contact valide détecté'); return }

    // Dedup against existing
    const existingDomains = new Set(prospects.map(p => p.domain.toLowerCase()))
    const toInsert = parsed.filter(r => !existingDomains.has(r.domain.toLowerCase()))
    const skipped = parsed.length - toInsert.length

    if (toInsert.length === 0) { toast.info('Tous ces contacts sont déjà présents'); return }

    setPlatformImporting(true)
    const rows = toInsert.map(r => ({
      campaign_id: campaignId,
      user_id: user.id,
      domain: r.domain,
      tld: r.domain.split('.').pop() ?? 'com',
      domain_type: 'other' as const,
      scrape_status: 'skipped' as const,
      status: 'to_contact' as const,
      priority: 5,
      [cfg.field]: r[cfg.field],
    }))

    const { data: saved, error } = await supabase.from('prospects').insert(rows).select()
    setPlatformImporting(false)
    if (error) { toast.error('Erreur : ' + error.message); return }

    const n = saved?.length ?? 0
    toast.success(`${n} contact${n > 1 ? 's' : ''} ${cfg.label} importé${n > 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} doublon${skipped > 1 ? 's' : ''} ignoré${skipped > 1 ? 's' : ''})` : ''}`)
    setPlatformOpen(false)
    setPlatformText('')
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

        {scrapeAllProgress ? (
          <span className="text-sm text-blue-600 font-medium flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Scraping {scrapeAllProgress.done}/{scrapeAllProgress.total}...
          </span>
        ) : (
          <>
            {pendingScrape > 0 && (
              <Button variant="outline" size="sm" onClick={() => scrapeAll(false)}>
                ↺ Scraper en attente ({pendingScrape})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => scrapeAll(true)} disabled={prospects.length === 0}>
              ↺ Tout re-scraper ({prospects.length})
            </Button>
          </>
        )}

        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <PlusCircle className="h-4 w-4 mr-1" />
          Ajouter manuellement
        </Button>

        <Button size="sm" variant="outline" onClick={openCsvDialog}>
          <Upload className="h-4 w-4 mr-1" />
          Importer Excel / CSV
        </Button>

        <Button size="sm" variant="outline" onClick={() => { setPasteText(''); setPasteOpen(true) }}>
          <PlusCircle className="h-4 w-4 mr-1" />
          Coller des sites
        </Button>

        <Button size="sm" variant="outline" onClick={() => { setPlatformText(''); setPlatformOpen(true) }}>
          <Instagram className="h-4 w-4 mr-1" />
          Ajouter par plateforme
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
                <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelected(p); loadContactHistory(p.id) }}>
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

      {/* ── Excel / CSV Import Dialog ─────────────────────────────────────── */}
      <Dialog open={csvOpen} onOpenChange={(o) => { if (!o) { setCsvOpen(false); setCsvStep('upload'); setCsvRows([]) } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {csvStep === 'upload' ? 'Importer des prospects (Excel ou CSV)'
                : csvStep === 'mapping' ? `Associer les colonnes — ${rawCsvRows.length} ligne${rawCsvRows.length > 1 ? 's' : ''} détectée${rawCsvRows.length > 1 ? 's' : ''}`
                : `Aperçu — ${csvRows.length} ligne${csvRows.length > 1 ? 's' : ''} détectée${csvRows.length > 1 ? 's' : ''}`}
            </DialogTitle>
          </DialogHeader>

          {csvStep === 'mapping' ? (
            <div className="space-y-4 py-2 overflow-y-auto">
              <p className="text-sm text-gray-500">
                La colonne <strong>domain</strong> n'a pas été détectée automatiquement. Associe tes colonnes aux champs ci-dessous.
              </p>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-600 w-1/2">Champ</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600 w-1/2">Colonne dans ton fichier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {([
                      { field: 'domain', label: 'Domaine / Site web', required: true },
                      { field: 'company_name', label: "Nom de l'entreprise", required: false },
                      { field: 'first_name', label: 'Prénom du contact', required: false },
                      { field: 'last_name', label: 'Nom du contact', required: false },
                      { field: 'email', label: 'Email', required: false },
                      { field: 'phone', label: 'Téléphone', required: false },
                      { field: 'linkedin_url', label: 'LinkedIn', required: false },
                      { field: 'facebook_url', label: 'Facebook', required: false },
                      { field: 'instagram_url', label: 'Instagram', required: false },
                      { field: 'twitter_url', label: 'Twitter / X', required: false },
                      { field: 'whatsapp_number', label: 'WhatsApp', required: false },
                      { field: 'notes', label: 'Notes', required: false },
                    ] as { field: string; label: string; required: boolean }[]).map(({ field, label, required }) => (
                      <tr key={field} className={required && !colMap[field] ? 'bg-red-50' : ''}>
                        <td className="px-4 py-2 text-gray-700">
                          {label}{required && <span className="text-red-500 ml-1">*</span>}
                        </td>
                        <td className="px-4 py-2">
                          <select
                            className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={colMap[field] ?? ''}
                            onChange={e => setColMap(prev => ({ ...prev, [field]: e.target.value }))}
                          >
                            <option value="">— ignorer —</option>
                            {detectedCols.map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-50 rounded p-3 text-xs text-gray-500">
                <strong>Colonnes détectées :</strong> {detectedCols.join(', ')}
              </div>
            </div>
          ) : csvStep === 'upload' ? (
            <div className="space-y-5 py-2">
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm space-y-3">
                <p className="font-medium text-blue-800">Colonnes reconnues automatiquement :</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-blue-700">
                  <div><span className="font-mono bg-white px-1 rounded">domain</span> / domaine / site <span className="text-red-500 font-bold">*</span></div>
                  <div><span className="font-mono bg-white px-1 rounded">company_name</span> / entreprise</div>
                  <div><span className="font-mono bg-white px-1 rounded">first_name</span> / prénom</div>
                  <div><span className="font-mono bg-white px-1 rounded">last_name</span> / nom</div>
                  <div><span className="font-mono bg-white px-1 rounded">email</span> / courriel</div>
                  <div><span className="font-mono bg-white px-1 rounded">phone</span> / téléphone</div>
                  <div><span className="font-mono bg-white px-1 rounded">linkedin</span> / profil_linkedin</div>
                  <div><span className="font-mono bg-white px-1 rounded">facebook</span> / page_facebook</div>
                  <div><span className="font-mono bg-white px-1 rounded">instagram</span> / compte_instagram</div>
                  <div><span className="font-mono bg-white px-1 rounded">twitter</span> / X</div>
                  <div><span className="font-mono bg-white px-1 rounded">whatsapp</span> / numéro_whatsapp</div>
                  <div><span className="font-mono bg-white px-1 rounded">notes</span> / remarques</div>
                </div>
                <p className="text-blue-700 text-xs">Les noms de colonnes en français ou anglais sont acceptés automatiquement. Seul <strong>domain</strong> est obligatoire.</p>
              </div>
              <div className="space-y-2">
                <Label>Fichier Excel (.xlsx, .xls) ou CSV</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
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
            ) : csvStep === 'mapping' ? (
              <>
                <Button variant="outline" onClick={() => { setCsvStep('upload'); setRawCsvRows([]); setDetectedCols([]); if (fileInputRef.current) fileInputRef.current.value = '' }}>
                  ← Changer de fichier
                </Button>
                <Button onClick={applyMapping} disabled={!colMap.domain}>
                  Aperçu →
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setCsvStep('upload'); setCsvRows([]); setRawCsvRows([]); setDetectedCols([]); if (fileInputRef.current) fileInputRef.current.value = '' }}>
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

      {/* ── Paste URLs Dialog ─────────────────────────────────────────────── */}
      <Dialog open={pasteOpen} onOpenChange={(o) => { if (!o) { setPasteOpen(false); setPasteText('') } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Coller une liste de sites</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Colle une liste de domaines ou URLs, un par ligne (ou séparés par des virgules). Les emails seront récupérés automatiquement par scraping.
            </p>
            <textarea
              className="w-full border rounded-lg p-3 text-sm font-mono h-48 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={"exemple.com\nmonsite.fr\nhttps://www.autresite.io\n..."}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              disabled={pasteImporting}
            />
            <p className="text-xs text-gray-400">
              {pasteText.split(/[\n,;]+/).filter(l => l.trim().includes('.')).length} domaine(s) détecté(s)
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPasteOpen(false); setPasteText('') }} disabled={pasteImporting}>
              Annuler
            </Button>
            <Button onClick={handlePasteImport} disabled={pasteImporting || !pasteText.trim()}>
              {pasteImporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Import en cours...</> : <>Importer et scraper</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Platform Paste Dialog ─────────────────────────────────────────── */}
      <Dialog open={platformOpen} onOpenChange={(o) => { if (!o) { setPlatformOpen(false); setPlatformText('') } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter des contacts par plateforme</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Platform selector */}
            <div className="flex flex-wrap gap-2">
              {(Object.entries(PLATFORM_CFG) as [string, typeof PLATFORM_CFG[string]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setPlatformType(key as any)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    platformType === key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
            <div className="rounded bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
              {PLATFORM_CFG[platformType].hint}
            </div>
            <textarea
              className="w-full border rounded-lg p-3 text-sm font-mono h-48 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={`Colle ici ta liste de comptes ${PLATFORM_CFG[platformType].label}...`}
              value={platformText}
              onChange={e => setPlatformText(e.target.value)}
            />
            {platformText.trim() && (
              <p className="text-xs text-gray-500">
                {platformText.split(/[\n,;]+/).map(l => PLATFORM_CFG[platformType].parse(l.trim())).filter(Boolean).length} contact(s) valide(s) détecté(s)
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlatformOpen(false)}>Annuler</Button>
            <Button onClick={handlePlatformImport} disabled={platformImporting || !platformText.trim()}>
              {platformImporting
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Import...</>
                : <><Upload className="h-4 w-4 mr-2" />Importer</>
              }
            </Button>
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
      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setEditMode(false); setContactHistory([]) } }}>
        <SheetContent className="w-[480px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selected.domain}
                  <a href={`https://${selected.domain}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 text-gray-400" />
                  </a>
                  <div className="ml-auto flex gap-2">
                    {editMode ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setEditMode(false)} disabled={editSaving}>
                          <X className="h-3 w-3 mr-1" />Annuler
                        </Button>
                        <Button size="sm" onClick={saveEdit} disabled={editSaving}>
                          {editSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                          Sauvegarder
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => startEdit(selected)}>
                        <Pencil className="h-3 w-3 mr-1" />Modifier
                      </Button>
                    )}
                  </div>
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

                {editMode ? (
                  /* ── Edit form ── */
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Prénom</Label>
                        <Input value={editForm.first_name} onChange={e => setEditForm(p => ({ ...p, first_name: e.target.value }))} placeholder="Jean" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Nom</Label>
                        <Input value={editForm.last_name} onChange={e => setEditForm(p => ({ ...p, last_name: e.target.value }))} placeholder="Dupont" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">Entreprise</Label>
                      <Input value={editForm.company_name} onChange={e => setEditForm(p => ({ ...p, company_name: e.target.value }))} placeholder="Nom de l'entreprise" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500 flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
                      <Input type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} placeholder="contact@exemple.fr" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500 flex items-center gap-1"><Linkedin className="h-3 w-3 text-blue-600" /> LinkedIn</Label>
                      <Input value={editForm.linkedin_url} onChange={e => setEditForm(p => ({ ...p, linkedin_url: e.target.value }))} placeholder="linkedin.com/in/..." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500 flex items-center gap-1"><Facebook className="h-3 w-3 text-blue-500" /> Facebook</Label>
                      <Input value={editForm.facebook_url} onChange={e => setEditForm(p => ({ ...p, facebook_url: e.target.value }))} placeholder="facebook.com/..." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500 flex items-center gap-1"><Instagram className="h-3 w-3 text-pink-500" /> Instagram</Label>
                      <Input value={editForm.instagram_url} onChange={e => setEditForm(p => ({ ...p, instagram_url: e.target.value }))} placeholder="instagram.com/..." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500 flex items-center gap-1"><Twitter className="h-3 w-3 text-sky-500" /> Twitter / X</Label>
                      <Input value={editForm.twitter_url} onChange={e => setEditForm(p => ({ ...p, twitter_url: e.target.value }))} placeholder="x.com/..." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500 flex items-center gap-1"><MessageCircle className="h-3 w-3 text-green-500" /> WhatsApp</Label>
                      <Input value={editForm.whatsapp_number} onChange={e => setEditForm(p => ({ ...p, whatsapp_number: e.target.value }))} placeholder="+33612345678" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">Notes</Label>
                      <Input value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes..." />
                    </div>
                  </div>
                ) : (
                  /* ── Read-only view ── */
                  <>
                    {selected.company_name && <InfoRow label="Entreprise" value={selected.company_name} />}
                    {((selected as any).first_name || (selected as any).last_name) && (
                      <InfoRow label="Contact" value={[(selected as any).first_name, (selected as any).last_name].filter(Boolean).join(' ')} />
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
                        <div className="flex gap-2 items-center">
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
                      <div className="space-y-1.5">
                        {([
                          { field: 'linkedin_url', icon: <Linkedin className="h-4 w-4 text-blue-600" />, label: 'LinkedIn', url: selected.linkedin_url },
                          { field: 'facebook_url', icon: <Facebook className="h-4 w-4 text-blue-500" />, label: 'Facebook', url: selected.facebook_url },
                          { field: 'instagram_url', icon: <Instagram className="h-4 w-4 text-pink-500" />, label: 'Instagram', url: selected.instagram_url },
                          { field: 'twitter_url', icon: <Twitter className="h-4 w-4 text-sky-500" />, label: 'Twitter/X', url: selected.twitter_url },
                          { field: 'whatsapp_number', icon: <MessageCircle className="h-4 w-4 text-green-500" />, label: 'WhatsApp', url: selected.whatsapp_number ? `https://wa.me/${selected.whatsapp_number.replace(/[^0-9]/g, '')}` : null },
                        ] as { field: string; icon: React.ReactNode; label: string; url: string | null | undefined }[]).filter(s => s.url).map(s => (
                          <div key={s.field} className="flex items-center gap-1">
                            <div className="flex-1 min-w-0"><SocialLink icon={s.icon} label={s.label} url={s.url!} /></div>
                            <button
                              onClick={() => clearSocialField(selected.id, s.field)}
                              className="shrink-0 text-gray-300 hover:text-red-500 transition-colors p-1 rounded"
                              title={`Supprimer ${s.label}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        {!selected.linkedin_url && !selected.facebook_url && !selected.instagram_url && !selected.twitter_url && !selected.whatsapp_number && (
                          <p className="text-sm text-gray-400">Aucun réseau trouvé.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Contact history */}
                {!editMode && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-sm font-medium text-gray-700">Historique des contacts</p>
                    {contactHistory.length === 0 ? (
                      <p className="text-sm text-gray-400">Aucun contact envoyé.</p>
                    ) : (
                      <div className="space-y-2">
                        {contactHistory.map((msg) => {
                          const channelEmoji: Record<string, string> = {
                            email: '📧', linkedin: '💼', facebook: '👤',
                            instagram: '📸', whatsapp: '💬', twitter: '🐦', other: '📨'
                          }
                          const statusColor: Record<string, string> = {
                            sent: 'bg-green-100 text-green-700',
                            queued: 'bg-blue-100 text-blue-700',
                            failed: 'bg-red-100 text-red-700',
                            draft: 'bg-gray-100 text-gray-600',
                            sending: 'bg-yellow-100 text-yellow-700',
                            opened: 'bg-purple-100 text-purple-700',
                            replied: 'bg-teal-100 text-teal-700',
                            bounced: 'bg-red-100 text-red-700',
                          }
                          const statusLabel: Record<string, string> = {
                            sent: 'Envoyé', queued: 'Planifié', failed: 'Échec',
                            draft: 'Brouillon', sending: 'En cours', opened: 'Ouvert',
                            replied: 'Répondu', bounced: 'Bounced',
                          }
                          const date = msg.sent_at ?? msg.scheduled_for ?? msg.created_at
                          return (
                            <div key={msg.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm">
                              <span className="text-base">{channelEmoji[msg.channel] ?? '📨'}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium capitalize text-gray-700">{msg.channel}</span>
                                  <span className="text-xs text-gray-400">Étape {msg.sequence_step}</span>
                                </div>
                                {msg.subject && <p className="text-xs text-gray-500 truncate">{msg.subject}</p>}
                                <p className="text-xs text-gray-400">{date ? new Date(date).toLocaleDateString('fr-CA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[msg.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                {statusLabel[msg.status] ?? msg.status}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Outreach link */}
                {!editMode && (
                  <div className="space-y-2">
                    <Link href={`/campaigns/${campaignId}/outreach?prospect=${selected.id}`}>
                      <Button className="w-full">✉️ Générer un message pour ce prospect</Button>
                    </Link>
                    {contactHistory.some(m => m.channel === 'email' && m.status === 'queued') && (
                      <Button
                        variant="outline"
                        className="w-full border-orange-200 text-orange-700 hover:bg-orange-50"
                        onClick={() => cancelQueuedEmails(selected)}
                        disabled={cancellingEmailsId === selected.id}
                      >
                        {cancellingEmailsId === selected.id
                          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Annulation...</>
                          : <>✉️ Annuler les {contactHistory.filter(m => m.channel === 'email' && m.status === 'queued').length} email{contactHistory.filter(m => m.channel === 'email' && m.status === 'queued').length > 1 ? 's' : ''} planifié{contactHistory.filter(m => m.channel === 'email' && m.status === 'queued').length > 1 ? 's' : ''}</>
                        }
                      </Button>
                    )}
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
                )}
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
