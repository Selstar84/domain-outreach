'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import type { OwnedDomain } from '@/types/database'
import { Plus, Pencil, Trash2, Globe } from 'lucide-react'

function extractWord(domain: string): string {
  return domain.split('.')[0].toLowerCase()
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<OwnedDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editDomain, setEditDomain] = useState<OwnedDomain | null>(null)
  const [form, setForm] = useState({ domain: '', asking_price: '', notes: '', status: 'active' })
  const supabase = createClient()

  async function load() {
    const { data } = await supabase.from('owned_domains').select('*').order('created_at', { ascending: false })
    setDomains(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditDomain(null)
    setForm({ domain: '', asking_price: '', notes: '', status: 'active' })
    setOpen(true)
  }

  function openEdit(d: OwnedDomain) {
    setEditDomain(d)
    setForm({ domain: d.domain, asking_price: d.asking_price?.toString() ?? '', notes: d.notes ?? '', status: d.status })
    setOpen(true)
  }

  async function handleSave() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Non authentifié'); return }

    const word = extractWord(form.domain)
    const payload = {
      domain: form.domain.toLowerCase().trim(),
      word,
      asking_price: form.asking_price ? parseFloat(form.asking_price) : null,
      notes: form.notes || null,
      status: form.status,
    }

    if (editDomain) {
      const { error } = await supabase.from('owned_domains').update(payload).eq('id', editDomain.id)
      if (error) { toast.error(error.message); return }
      toast.success('Domaine mis à jour')
    } else {
      const { error } = await supabase.from('owned_domains').insert({ ...payload, user_id: user.id })
      if (error) { toast.error(error.message); return }
      toast.success('Domaine ajouté')
    }
    setOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce domaine ?')) return
    const { error } = await supabase.from('owned_domains').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Domaine supprimé')
    load()
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    sold: 'bg-blue-100 text-blue-800',
    paused: 'bg-gray-100 text-gray-700',
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Domaines</h1>
          <p className="text-gray-500 mt-1">Portfolio de domaines à vendre</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> Ajouter un domaine
        </Button>
      </div>

      {loading ? (
        <div className="text-gray-400">Chargement...</div>
      ) : domains.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Globe className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Aucun domaine. Commencez par en ajouter un.</p>
            <Button className="mt-4" onClick={openNew}><Plus className="h-4 w-4 mr-2" />Ajouter</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Domaine</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Mot-clé</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Prix demandé</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Notes</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {domains.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{d.domain}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono">{d.word}</td>
                  <td className="px-4 py-3 text-gray-700">{d.asking_price ? `$${d.asking_price.toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[d.status]}`}>{d.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{d.notes ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(d.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editDomain ? 'Modifier le domaine' : 'Ajouter un domaine'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Domaine</Label>
              <Input
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                placeholder="lussot.com"
                disabled={!!editDomain}
              />
              {form.domain && <p className="text-xs text-gray-400">Mot-clé extrait : <strong>{extractWord(form.domain)}</strong></p>}
            </div>
            <div className="space-y-2">
              <Label>Prix demandé ($)</Label>
              <Input
                type="number"
                value={form.asking_price}
                onChange={(e) => setForm({ ...form, asking_price: e.target.value })}
                placeholder="5000"
              />
            </div>
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Actif</SelectItem>
                  <SelectItem value="paused">En pause</SelectItem>
                  <SelectItem value="sold">Vendu</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="Notes internes..."
              />
            </div>
            <Button className="w-full" onClick={handleSave}>{editDomain ? 'Mettre à jour' : 'Ajouter'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
