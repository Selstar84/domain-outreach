'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import type { OwnedDomain, EmailAccount } from '@/types/database'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NewCampaignPage() {
  const [domains, setDomains] = useState<OwnedDomain[]>([])
  const [accounts, setAccounts] = useState<{ id: string; email_address: string; display_name: string }[]>([])
  const [form, setForm] = useState({
    owned_domain_id: '',
    asking_price: '',
    preferred_email_account_id: '',
    email_subject_template: '',
  })
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const [{ data: d }, { data: a }] = await Promise.all([
        supabase.from('owned_domains').select('*').eq('status', 'active').order('domain'),
        supabase.from('email_accounts').select('id, email_address, display_name').eq('is_active', true),
      ])
      setDomains(d ?? [])
      setAccounts(a ?? [])
    }
    load()
  }, [])

  const selectedDomain = domains.find(d => d.id === form.owned_domain_id)

  async function handleCreate() {
    if (!form.owned_domain_id) { toast.error('Sélectionner un domaine'); return }
    setLoading(true)

    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owned_domain_id: form.owned_domain_id,
        name: `Vente de ${selectedDomain?.domain}`,
        asking_price: form.asking_price ? parseFloat(form.asking_price) : null,
        preferred_email_account_id: (form.preferred_email_account_id && form.preferred_email_account_id !== 'none') ? form.preferred_email_account_id : null,
        email_subject_template: form.email_subject_template || null,
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) { toast.error(typeof data.error === 'string' ? data.error : 'Erreur lors de la création'); return }
    toast.success('Campagne créée !')
    router.push(`/campaigns/${data.id}`)
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/campaigns"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Retour</Button></Link>
        <h1 className="text-2xl font-bold text-gray-900">Nouvelle campagne</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurer la campagne</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Domaine à vendre *</Label>
            <Select value={form.owned_domain_id} onValueChange={(v) => setForm({ ...form, owned_domain_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un domaine..." />
              </SelectTrigger>
              <SelectContent>
                {domains.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.domain} {d.asking_price ? `— $${d.asking_price.toLocaleString()}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedDomain && (
              <p className="text-xs text-gray-400">
                Mot-clé de recherche : <strong className="font-mono">{selectedDomain.word}</strong>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Prix demandé ($)</Label>
            <Input
              type="number"
              value={form.asking_price}
              onChange={(e) => setForm({ ...form, asking_price: e.target.value })}
              placeholder={selectedDomain?.asking_price?.toString() ?? '5000'}
            />
          </div>

          <div className="space-y-2">
            <Label>Compte email préféré</Label>
            <Select value={form.preferred_email_account_id} onValueChange={(v) => setForm({ ...form, preferred_email_account_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un compte..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Automatique</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.display_name} ({a.email_address})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sujet email (optionnel)</Label>
            <Input
              value={form.email_subject_template}
              onChange={(e) => setForm({ ...form, email_subject_template: e.target.value })}
              placeholder="Ex: {domain} — êtes-vous intéressé ?"
            />
            <p className="text-xs text-gray-400">Laissez vide pour laisser l'IA générer le sujet.</p>
          </div>

          <Button className="w-full" onClick={handleCreate} disabled={loading || !form.owned_domain_id}>
            {loading ? 'Création...' : 'Créer la campagne'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
