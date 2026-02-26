'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Plus, Mail, CheckCircle, XCircle, Trash2, TestTube } from 'lucide-react'

interface Account {
  id: string; provider: string; email_address: string; display_name: string
  daily_limit: number; hourly_limit: number; min_delay_seconds: number
  sent_today: number; is_active: boolean; is_verified: boolean; created_at: string
}

const DEFAULTS = {
  provider: 'resend', email_address: '', display_name: '',
  resend_api_key: '', resend_domain: '',
  smtp_host: '', smtp_port: '587', smtp_user: '', smtp_password_encrypted: '', smtp_secure: false,
  daily_limit: '50', hourly_limit: '10', min_delay_seconds: '120',
}

export default function EmailAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [testAccountId, setTestAccountId] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [form, setForm] = useState({ ...DEFAULTS })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data } = await supabase.from('email_accounts').select('id, provider, email_address, display_name, daily_limit, hourly_limit, min_delay_seconds, sent_today, is_active, is_verified, created_at').order('created_at')
    setAccounts(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function f(key: string, val: string | boolean) { setForm(prev => ({ ...prev, [key]: val })) }

  async function handleSave() {
    if (!form.email_address || !form.display_name) { toast.error('Email et nom requis'); return }
    setSaving(true)
    const body: Record<string, unknown> = {
      provider: form.provider,
      email_address: form.email_address,
      display_name: form.display_name,
      daily_limit: parseInt(form.daily_limit),
      hourly_limit: parseInt(form.hourly_limit),
      min_delay_seconds: parseInt(form.min_delay_seconds),
    }
    if (form.provider === 'resend') {
      body.resend_api_key = form.resend_api_key || null
      body.resend_domain = form.resend_domain || null
    } else {
      body.smtp_host = form.smtp_host || null
      body.smtp_port = parseInt(form.smtp_port)
      body.smtp_user = form.smtp_user || null
      body.smtp_password_encrypted = form.smtp_password_encrypted || null
      body.smtp_secure = form.smtp_secure
    }
    const res = await fetch('/api/email-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Erreur'); return }
    toast.success('Compte ajouté !')
    setOpen(false)
    setForm({ ...DEFAULTS })
    load()
  }

  async function handleTest(accountId: string) {
    setTestAccountId(accountId)
    setTestOpen(true)
  }

  async function sendTest() {
    if (!testEmail) { toast.error('Entrez un email de test'); return }
    setTesting(true)
    const res = await fetch(`/api/email-accounts/${testAccountId}/test`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: testEmail }),
    })
    setTesting(false)
    const data = await res.json()
    if (res.ok) { toast.success('Email de test envoyé !'); setTestOpen(false); load() }
    else toast.error(data.error ?? 'Erreur envoi test')
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('email_accounts').update({ is_active: !current }).eq('id', id)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce compte email ?')) return
    await supabase.from('email_accounts').delete().eq('id', id)
    toast.success('Compte supprimé')
    load()
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comptes Email</h1>
          <p className="text-gray-500 mt-1">Gérez vos comptes d'envoi et leurs limites</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Ajouter un compte</Button>
      </div>

      {loading ? <p className="text-gray-400">Chargement...</p> : accounts.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <Mail className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Aucun compte email. Ajoutez un compte Resend ou SMTP.</p>
          <Button className="mt-4" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Ajouter</Button>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((a) => (
            <Card key={a.id} className={!a.is_active ? 'opacity-60' : ''}>
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span className="font-semibold text-gray-900">{a.display_name}</span>
                      {a.is_verified ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-gray-300" />}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{a.email_address}</p>
                    <p className="text-xs text-gray-400">{a.provider.toUpperCase()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a.id, a.is_active)} />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 text-center bg-gray-50 rounded-lg p-3">
                  <div><p className="text-xs text-gray-400">Envoyés/jour</p><p className="font-bold text-gray-700">{a.sent_today}/{a.daily_limit}</p></div>
                  <div><p className="text-xs text-gray-400">Max/heure</p><p className="font-bold text-gray-700">{a.hourly_limit}</p></div>
                  <div><p className="text-xs text-gray-400">Délai min</p><p className="font-bold text-gray-700">{a.min_delay_seconds}s</p></div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleTest(a.id)}>
                    <TestTube className="h-3 w-3 mr-1" />Tester
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 ml-auto" onClick={() => handleDelete(a.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Account Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ajouter un compte email</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Fournisseur</Label>
              <Select value={form.provider} onValueChange={(v) => f('provider', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="resend">Resend (Recommandé)</SelectItem>
                  <SelectItem value="smtp">SMTP (Gmail, Outlook, etc.)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Email expéditeur</Label>
                <Input value={form.email_address} onChange={e => f('email_address', e.target.value)} placeholder="vous@domaine.com" />
              </div>
              <div className="space-y-2">
                <Label>Nom affiché</Label>
                <Input value={form.display_name} onChange={e => f('display_name', e.target.value)} placeholder="Votre Nom" />
              </div>
            </div>

            {form.provider === 'resend' ? (
              <>
                <div className="space-y-2">
                  <Label>Clé API Resend</Label>
                  <Input value={form.resend_api_key} onChange={e => f('resend_api_key', e.target.value)} placeholder="re_..." type="password" />
                </div>
                <div className="space-y-2">
                  <Label>Domaine Resend (vérifié)</Label>
                  <Input value={form.resend_domain} onChange={e => f('resend_domain', e.target.value)} placeholder="votre-domaine.com" />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Serveur SMTP</Label>
                    <Input value={form.smtp_host} onChange={e => f('smtp_host', e.target.value)} placeholder="smtp.gmail.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input value={form.smtp_port} onChange={e => f('smtp_port', e.target.value)} placeholder="587" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Utilisateur</Label>
                    <Input value={form.smtp_user} onChange={e => f('smtp_user', e.target.value)} placeholder="user@gmail.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Mot de passe</Label>
                    <Input value={form.smtp_password_encrypted} onChange={e => f('smtp_password_encrypted', e.target.value)} type="password" placeholder="App password" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.smtp_secure} onCheckedChange={v => f('smtp_secure', v)} />
                  <Label>SSL/TLS (port 465)</Label>
                </div>
              </>
            )}

            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Limites d'envoi</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Max/jour</Label>
                  <Input type="number" value={form.daily_limit} onChange={e => f('daily_limit', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Max/heure</Label>
                  <Input type="number" value={form.hourly_limit} onChange={e => f('hourly_limit', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Délai min (sec)</Label>
                  <Input type="number" value={form.min_delay_seconds} onChange={e => f('min_delay_seconds', e.target.value)} />
                </div>
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Ajouter le compte'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test Dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Envoyer un email de test</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Envoyer à</Label>
              <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test@exemple.com" type="email" />
            </div>
            <Button className="w-full" onClick={sendTest} disabled={testing}>
              {testing ? 'Envoi...' : 'Envoyer le test'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
