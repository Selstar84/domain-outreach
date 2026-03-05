'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { PlusCircle, Pencil, Trash2, Loader2, Info } from 'lucide-react'

const CHANNEL_LABELS: Record<string, string> = {
  all: '🔀 Tous canaux',
  email: '📧 Email',
  linkedin: '💼 LinkedIn',
  facebook: '👤 Facebook',
  instagram: '📸 Instagram',
  whatsapp: '💬 WhatsApp',
  twitter: '🐦 Twitter/X',
}

const VARIABLES = [
  { key: '{{domaine_vente}}', desc: 'Domaine que vous vendez (ex: mykarate.com)' },
  { key: '{{domaine_prospect}}', desc: "Domaine du prospect (ex: mykarateclub.co.uk)" },
  { key: '{{entreprise}}', desc: "Nom de l'entreprise du prospect" },
  { key: '{{prix}}', desc: 'Prix de vente demandé' },
  { key: '{{tld}}', desc: 'Extension du prospect (.fr, .co.uk…)' },
]

interface Template {
  id: string
  name: string
  channel: string
  subject: string | null
  body: string
  created_at: string
}

const EMPTY_FORM = { name: '', channel: 'all', subject: '', body: '' }

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('message_templates')
      .select('*')
      .order('created_at', { ascending: false })
    setTemplates(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(t: Template) {
    setEditingId(t.id)
    setForm({ name: t.name, channel: t.channel, subject: t.subject ?? '', body: t.body })
    setDialogOpen(true)
  }

  function f(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  function insertVar(key: string) {
    setForm(prev => ({ ...prev, body: prev.body + key }))
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Nom requis'); return }
    if (!form.body.trim()) { toast.error('Corps du message requis'); return }
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Non authentifié'); setSaving(false); return }

    const payload = {
      name: form.name.trim(),
      channel: form.channel,
      subject: form.subject.trim() || null,
      body: form.body.trim(),
      user_id: user.id,
    }

    if (editingId) {
      const { error } = await supabase.from('message_templates').update(payload).eq('id', editingId)
      if (error) { toast.error('Erreur : ' + error.message); setSaving(false); return }
      toast.success('Modèle mis à jour ✓')
    } else {
      const { error } = await supabase.from('message_templates').insert(payload)
      if (error) { toast.error('Erreur : ' + error.message); setSaving(false); return }
      toast.success('Modèle créé ✓')
    }

    setSaving(false)
    setDialogOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce modèle ?')) return
    setDeleting(id)
    await supabase.from('message_templates').delete().eq('id', id)
    setDeleting(null)
    load()
    toast.success('Modèle supprimé')
  }

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Modèles</h1>
          <p className="text-gray-500 mt-1">Créez des modèles réutilisables avec des variables automatiques</p>
        </div>
        <Button onClick={openCreate}>
          <PlusCircle className="h-4 w-4 mr-2" />Nouveau modèle
        </Button>
      </div>

      {/* Variables reference */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800 mb-2">Variables disponibles dans vos modèles :</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {VARIABLES.map(v => (
                  <div key={v.key} className="flex items-center gap-2">
                    <code className="text-xs bg-white border border-blue-200 rounded px-1.5 py-0.5 text-blue-700 font-mono">{v.key}</code>
                    <span className="text-xs text-blue-600">{v.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Templates list */}
      {loading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <p>Aucun modèle créé.</p>
            <p className="text-sm mt-1">Cliquez sur "Nouveau modèle" pour commencer.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {templates.map(t => (
            <Card key={t.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{t.name}</span>
                      <Badge variant="outline" className="text-xs">{CHANNEL_LABELS[t.channel] ?? t.channel}</Badge>
                    </div>
                    {t.subject && (
                      <p className="text-xs text-gray-500 mb-1">Sujet : <span className="text-gray-700">{t.subject}</span></p>
                    )}
                    <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">{t.body}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(t.id)}
                      disabled={deleting === t.id}
                    >
                      {deleting === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Modifier le modèle' : 'Nouveau modèle'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom du modèle <span className="text-red-500">*</span></Label>
                <Input placeholder="Ex: Relance LinkedIn karate" value={form.name} onChange={e => f('name', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Canal</Label>
                <Select value={form.channel} onValueChange={v => f('channel', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(form.channel === 'email' || form.channel === 'all') && (
              <div className="space-y-2">
                <Label>Sujet (email)</Label>
                <Input placeholder="Ex: Votre domaine {{domaine_vente}} est disponible" value={form.subject} onChange={e => f('subject', e.target.value)} />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Corps du message <span className="text-red-500">*</span></Label>
                <div className="flex gap-1 flex-wrap justify-end">
                  {VARIABLES.map(v => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVar(v.key)}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded px-1.5 py-0.5 font-mono transition-colors"
                      title={v.desc}
                    >
                      {v.key}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                rows={10}
                placeholder={`Bonjour,\n\nJ'ai remarqué que vous possédez {{domaine_prospect}}. Le domaine {{domaine_vente}} est disponible et pourrait compléter votre présence en ligne...\n\nCordialement`}
                value={form.body}
                onChange={e => f('body', e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-400">Cliquez sur une variable ci-dessus pour l'insérer dans le message.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingId ? 'Enregistrer' : 'Créer le modèle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
