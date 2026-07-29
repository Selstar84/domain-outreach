'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Upload, FileText, CheckCircle, XCircle, ArrowLeft, Rocket, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

// ── CSV parser (same as prospects page) ──────────────────────────────────────
function detectSep(line: string): string {
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let inQ = false
  for (const c of line) {
    if (c === '"') { inQ = !inQ; continue }
    if (!inQ && c in counts) counts[c as keyof typeof counts]++
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

function parseCsvLine(line: string, sep: string): string[] {
  const vals: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      i++
      let cur = ''
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { cur += '"'; i += 2 }
        else if (line[i] === '"') { i++; break }
        else { cur += line[i++] }
      }
      while (i < line.length && line[i] !== sep) i++
      if (i < line.length) i++
      vals.push(cur.trim())
    } else {
      let cur = ''
      while (i < line.length && line[i] !== sep) cur += line[i++]
      if (i < line.length) i++
      vals.push(cur.trim())
    }
  }
  return vals
}

function normalizeHeader(h: string): string {
  const s = h.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const map: Record<string, string> = {
    portfolio_domain: 'portfolio_domain',
    domaine_vendu: 'portfolio_domain',
    domaine_portfolio: 'portfolio_domain',
    mon_domaine: 'portfolio_domain',
    domaine_cible: 'portfolio_domain',
    target_domain: 'portfolio_domain',
    domaine_a_vendre: 'portfolio_domain',
    domaine: 'domain', site: 'domain', site_web: 'domain', website: 'domain',
    entreprise: 'company_name', company: 'company_name', societe: 'company_name',
    organisation: 'company_name', organization: 'company_name',
    prenom: 'first_name', firstname: 'first_name', first_name: 'first_name',
    nom: 'last_name', lastname: 'last_name', last_name: 'last_name',
    mail: 'email', courriel: 'email', e_mail: 'email', adresse_email: 'email', emails: 'email',
    nom_entreprise: 'company_name', titre: 'company_name',
    tel: 'phone', telephone: 'phone', mobile: 'phone',
    linkedin: 'linkedin_url', profil_linkedin: 'linkedin_url',
    facebook: 'facebook_url', fb: 'facebook_url',
    remarques: 'notes', commentaires: 'notes', note: 'notes',
  }
  return map[s] ?? s
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const sep = detectSep(lines[0])
  const rawHeaders = parseCsvLine(lines[0], sep).map(h => h.replace(/['"]/g, '').trim())
  const headers = rawHeaders.map(normalizeHeader)
  return lines.slice(1).map(line => {
    let vals = parseCsvLine(line.trim(), sep)
    const commasInFirst = (vals[0] ?? '').split(',').length - 1
    if (commasInFirst >= 8) {
      const inner = vals[0].replace(/""/g, '').replace(/"/g, '')
      const innerVals = parseCsvLine(inner, sep)
      if (innerVals.length > 1) vals = innerVals
    }
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { if (h && !(h in row)) row[h] = vals[i] ?? '' })
    return row
  }).filter(r => Object.values(r).some(v => v.trim()))
}

// ── Types ────────────────────────────────────────────────────────────────────
interface PreviewGroup {
  domain: string
  count: number
  withEmail: number
  sample: string[]
}

interface ImportResult {
  domain: string
  status: 'created' | 'existing' | 'error'
  campaign_id?: string
  imported: number
  skipped: number
  error?: string
}

export default function BulkImportPage() {
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [preview, setPreview] = useState<PreviewGroup[]>([])
  const [hasPortfolioDomain, setHasPortfolioDomain] = useState(false)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [fileName, setFileName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    setFileName(file.name)
    setResults(null)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const parsed = parseCSV(text)
      setRows(parsed)

      const hasPD = parsed.length > 0 && 'portfolio_domain' in parsed[0]
      setHasPortfolioDomain(hasPD)

      if (!hasPD) { setPreview([]); return }

      const groups: Record<string, PreviewGroup> = {}
      for (const row of parsed) {
        const d = (row.portfolio_domain ?? '').trim().toLowerCase().replace(/^www\./, '')
        if (!d) continue
        if (!groups[d]) groups[d] = { domain: d, count: 0, withEmail: 0, sample: [] }
        groups[d].count++
        if (row.email) groups[d].withEmail++
        if (groups[d].sample.length < 2 && row.company_name) groups[d].sample.push(row.company_name)
      }
      setPreview(Object.values(groups).sort((a, b) => b.count - a.count))
    }
    reader.readAsText(file, 'UTF-8')
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function handleImport() {
    if (!rows.length || !hasPortfolioDomain) return
    setImporting(true)
    try {
      const res = await fetch('/api/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Erreur import'); return }
      setResults(data.results)
      const total = data.results.reduce((s: number, r: ImportResult) => s + r.imported, 0)
      toast.success(`${total} prospects importés dans ${data.results.filter((r: ImportResult) => r.status !== 'error').length} campagnes`)
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setImporting(false)
    }
  }

  const totalLeads = preview.reduce((s, g) => s + g.count, 0)
  const totalWithEmail = preview.reduce((s, g) => s + g.withEmail, 0)

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/campaigns"><ArrowLeft className="h-5 w-5 text-gray-400 hover:text-gray-600 cursor-pointer" /></Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import en masse</h1>
          <p className="text-sm text-gray-500">Un seul CSV pour plusieurs domaines — une campagne créée par domaine automatiquement</p>
        </div>
      </div>

      {/* Format info */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-blue-800 mb-2">Format CSV requis</p>
          <p className="text-xs text-blue-700 mb-2">Ajoute une colonne <code className="bg-blue-100 px-1 rounded">portfolio_domain</code> qui indique quel domaine tu vends pour chaque lead :</p>
          <pre className="text-xs bg-white border border-blue-200 rounded p-2 overflow-x-auto text-gray-700">
{`portfolio_domain,email,company_name
dmrenovations.ca,contact@example.com,Example Co
dmrenovations.ca,info@acme.com,Acme Inc
renovation.com,hello@test.com,Test Corp`}
          </pre>
          <p className="text-xs text-blue-600 mt-2">Colonnes acceptées : <code>portfolio_domain</code>, <code>domaine_vendu</code>, <code>domaine_portfolio</code></p>
        </CardContent>
      </Card>

      {/* Upload zone */}
      {!results && (
        <div
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
        >
          <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
          <Upload className="h-8 w-8 text-gray-400 mx-auto mb-3" />
          {fileName
            ? <p className="text-sm font-medium text-gray-700 flex items-center justify-center gap-2"><FileText className="h-4 w-4" />{fileName}</p>
            : <>
                <p className="text-sm font-medium text-gray-700">Glisse ton CSV ici ou clique pour sélectionner</p>
                <p className="text-xs text-gray-400 mt-1">Fichier .csv uniquement</p>
              </>
          }
        </div>
      )}

      {/* Warning: no portfolio_domain column */}
      {fileName && !hasPortfolioDomain && rows.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4 flex gap-3 items-start">
            <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-800">Colonne <code>portfolio_domain</code> manquante</p>
              <p className="text-xs text-orange-700 mt-1">
                Ton CSV a {rows.length} lignes mais aucune colonne <code>portfolio_domain</code>. Ajoute cette colonne pour indiquer quel domaine tu vends pour chaque lead.
              </p>
              <p className="text-xs text-orange-600 mt-1">Colonnes détectées : {Object.keys(rows[0] ?? {}).join(', ')}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {preview.length > 0 && !results && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Aperçu — {preview.length} domaine{preview.length > 1 ? 's' : ''} détecté{preview.length > 1 ? 's' : ''}</span>
              <span className="text-sm font-normal text-gray-500">{totalLeads} leads · {totalWithEmail} avec email</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {preview.map(g => (
              <div key={g.domain} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">{g.domain}</p>
                  {g.sample.length > 0 && <p className="text-xs text-gray-400">{g.sample.join(', ')}{g.count > g.sample.length ? ` +${g.count - g.sample.length}` : ''}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{g.count} leads</Badge>
                  <Badge className="bg-green-100 text-green-700">{g.withEmail} emails</Badge>
                </div>
              </div>
            ))}
            <Button onClick={handleImport} disabled={importing} className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white">
              <Rocket className="h-4 w-4 mr-2" />
              {importing ? 'Import en cours...' : `Importer ${totalLeads} leads dans ${preview.length} campagne${preview.length > 1 ? 's' : ''}`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Résultats de l&apos;import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.map(r => (
              <div key={r.domain} className="flex items-start gap-3 py-2 border-b last:border-0">
                {r.status === 'error'
                  ? <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  : <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                }
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800">{r.domain}</p>
                    {r.status === 'created' && <Badge className="bg-blue-100 text-blue-700 text-xs">Nouvelle campagne</Badge>}
                    {r.status === 'existing' && <Badge variant="secondary" className="text-xs">Campagne existante</Badge>}
                  </div>
                  {r.status === 'error'
                    ? <p className="text-xs text-red-600">{r.error}</p>
                    : <p className="text-xs text-gray-500">{r.imported} prospects importés{r.skipped > 0 ? ` · ${r.skipped} ignorés (doublons)` : ''}</p>
                  }
                </div>
                {r.campaign_id && (
                  <Link href={`/campaigns/${r.campaign_id}`} className="text-xs text-blue-600 hover:underline shrink-0">Voir →</Link>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setResults(null); setRows([]); setPreview([]); setFileName(''); setHasPortfolioDomain(false) }}>
                Nouvel import
              </Button>
              <Link href="/campaigns" className="flex-1">
                <Button className="w-full bg-gray-900 hover:bg-gray-800 text-white">Voir les campagnes</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
