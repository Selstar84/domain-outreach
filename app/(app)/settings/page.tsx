'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

export default function SettingsPage() {
  const [form, setForm] = useState({
    whoisxml_api_key: '',
    hunter_api_key: '',
    anthropic_api_key: '',
    social_daily_limit: '15',
    email_daily_limit_global: '500',
    check_timeout_ms: '5000',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('settings').select('*').single()
      if (data) {
        setForm({
          whoisxml_api_key: data.whoisxml_api_key ?? '',
          hunter_api_key: data.hunter_api_key ?? '',
          anthropic_api_key: data.anthropic_api_key ?? '',
          social_daily_limit: String(data.social_daily_limit ?? 15),
          email_daily_limit_global: String(data.email_daily_limit_global ?? 500),
          check_timeout_ms: String(data.check_timeout_ms ?? 5000),
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  function f(key: string, val: string) { setForm(prev => ({ ...prev, [key]: val })) }

  async function handleSave() {
    setSaving(true)
    const payload = {
      whoisxml_api_key: form.whoisxml_api_key || null,
      hunter_api_key: form.hunter_api_key || null,
      anthropic_api_key: form.anthropic_api_key || null,
      social_daily_limit: parseInt(form.social_daily_limit),
      email_daily_limit_global: parseInt(form.email_daily_limit_global),
      check_timeout_ms: parseInt(form.check_timeout_ms),
    }

    const { data: existing } = await supabase.from('settings').select('id').single()
    if (existing) {
      await supabase.from('settings').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('settings').insert(payload)
    }

    setSaving(false)
    toast.success('Paramètres sauvegardés')
  }

  if (loading) return <div className="p-8 text-gray-400">Chargement...</div>

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-500 mt-1">Clés API et configuration globale</p>
      </div>

      {/* API Keys */}
      <Card>
        <CardHeader><CardTitle className="text-base">Clés API</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Anthropic Claude API Key *</Label>
            <Input type="password" value={form.anthropic_api_key} onChange={e => f('anthropic_api_key', e.target.value)} placeholder="sk-ant-..." />
            <p className="text-xs text-gray-400">Utilisée pour générer les messages personnalisés. Obtenir sur <a href="https://console.anthropic.com" target="_blank" className="text-blue-500 underline">console.anthropic.com</a></p>
          </div>
          <div className="space-y-2">
            <Label>WhoisXML API Key</Label>
            <Input type="password" value={form.whoisxml_api_key} onChange={e => f('whoisxml_api_key', e.target.value)} placeholder="at_..." />
            <p className="text-xs text-gray-400">Pour obtenir les infos WHOIS des prospects. Optionnel.</p>
          </div>
          <div className="space-y-2">
            <Label>Hunter.io API Key</Label>
            <Input type="password" value={form.hunter_api_key} onChange={e => f('hunter_api_key', e.target.value)} placeholder="..." />
            <p className="text-xs text-gray-400">Pour enrichir les emails manquants. Optionnel.</p>
          </div>
        </CardContent>
      </Card>

      {/* Limits */}
      <Card>
        <CardHeader><CardTitle className="text-base">Limites globales</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Messages sociaux par jour (max)</Label>
            <Input type="number" value={form.social_daily_limit} onChange={e => f('social_daily_limit', e.target.value)} min="1" max="100" />
            <p className="text-xs text-gray-400">Recommandé : 10-20 pour rester discret</p>
          </div>
          <div className="space-y-2">
            <Label>Emails par jour (global, tous comptes)</Label>
            <Input type="number" value={form.email_daily_limit_global} onChange={e => f('email_daily_limit_global', e.target.value)} min="1" max="10000" />
          </div>
          <div className="space-y-2">
            <Label>Timeout HTTP check (ms)</Label>
            <Input type="number" value={form.check_timeout_ms} onChange={e => f('check_timeout_ms', e.target.value)} min="1000" max="30000" />
            <p className="text-xs text-gray-400">Délai max pour vérifier si un site est actif. Défaut : 5000ms</p>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? 'Sauvegarde...' : 'Sauvegarder les paramètres'}
      </Button>
    </div>
  )
}
