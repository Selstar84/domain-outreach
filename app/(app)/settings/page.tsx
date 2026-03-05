'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { getEffectiveDailyLimit } from '@/lib/social/limits'

export default function SettingsPage() {
  const [form, setForm] = useState({
    whoisxml_api_key: '',
    hunter_api_key: '',
    anthropic_api_key: '',
    social_daily_limit: '15',
    email_daily_limit_global: '500',
    check_timeout_ms: '5000',
    social_warmup_enabled: false,
    social_warmup_start_date: '',
    social_warmup_start_count: '5',
    social_warmup_increment: '2',
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
          social_warmup_enabled: data.social_warmup_enabled ?? false,
          social_warmup_start_date: data.social_warmup_start_date ?? '',
          social_warmup_start_count: String(data.social_warmup_start_count ?? 5),
          social_warmup_increment: String(data.social_warmup_increment ?? 2),
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  function f(key: string, val: string | boolean) { setForm(prev => ({ ...prev, [key]: val })) }

  const effectiveLimitToday = getEffectiveDailyLimit({
    social_daily_limit: parseInt(form.social_daily_limit) || 15,
    social_warmup_enabled: form.social_warmup_enabled,
    social_warmup_start_date: form.social_warmup_start_date || null,
    social_warmup_start_count: parseInt(form.social_warmup_start_count) || 5,
    social_warmup_increment: parseInt(form.social_warmup_increment) || 2,
  })

  async function handleSave() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Non authentifié'); setSaving(false); return }

    const payload = {
      whoisxml_api_key: form.whoisxml_api_key || null,
      hunter_api_key: form.hunter_api_key || null,
      anthropic_api_key: form.anthropic_api_key || null,
      social_daily_limit: parseInt(form.social_daily_limit),
      email_daily_limit_global: parseInt(form.email_daily_limit_global),
      check_timeout_ms: parseInt(form.check_timeout_ms),
      social_warmup_enabled: form.social_warmup_enabled,
      social_warmup_start_date: form.social_warmup_start_date || null,
      social_warmup_start_count: parseInt(form.social_warmup_start_count) || 5,
      social_warmup_increment: parseInt(form.social_warmup_increment) || 2,
    }

    const { error } = await supabase
      .from('settings')
      .upsert({ ...payload, user_id: user.id }, { onConflict: 'user_id' })

    setSaving(false)
    if (error) {
      toast.error('Erreur sauvegarde : ' + error.message)
      return
    }
    toast.success('Paramètres sauvegardés ✓')
  }

  if (loading) return <div className="p-8 text-gray-400">Chargement...</div>

  const startCount = parseInt(form.social_warmup_start_count) || 5
  const increment = parseInt(form.social_warmup_increment) || 2
  const maxLimit = parseInt(form.social_daily_limit) || 15

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
            <Label>Messages sociaux par jour (max par plateforme)</Label>
            <Input type="number" value={form.social_daily_limit} onChange={e => f('social_daily_limit', e.target.value)} min="1" max="100" />
            <p className="text-xs text-gray-400">Recommandé : 10-20 par plateforme pour rester discret</p>
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

      {/* Warm-up Social */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">🔥 Warm-up Social</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-gray-500">
            Le warm-up permet de démarrer avec un petit nombre de messages par jour et d'augmenter progressivement pour éviter les restrictions de plateforme.
          </p>

          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Activer le warm-up</Label>
              <p className="text-xs text-gray-400 mt-0.5">Remplace la limite fixe par une progression graduelle</p>
            </div>
            <Switch
              checked={form.social_warmup_enabled}
              onCheckedChange={(v) => f('social_warmup_enabled', v)}
            />
          </div>

          {form.social_warmup_enabled && (
            <>
              {/* Start date */}
              <div className="space-y-2">
                <Label>Date de début du warm-up</Label>
                <Input
                  type="date"
                  value={form.social_warmup_start_date}
                  onChange={e => f('social_warmup_start_date', e.target.value)}
                />
                <p className="text-xs text-gray-400">Jour 1 de votre progression</p>
              </div>

              {/* Start count + increment */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Messages au départ (J1)</Label>
                  <Input
                    type="number"
                    value={form.social_warmup_start_count}
                    onChange={e => f('social_warmup_start_count', e.target.value)}
                    min="1"
                    max="50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Augmentation par jour</Label>
                  <Input
                    type="number"
                    value={form.social_warmup_increment}
                    onChange={e => f('social_warmup_increment', e.target.value)}
                    min="1"
                    max="10"
                  />
                </div>
              </div>

              {/* Progression preview */}
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 space-y-1.5">
                <p className="text-xs font-medium text-blue-700">Progression journalière :</p>
                <p className="text-xs text-blue-600 font-mono">
                  J1 : {startCount} → J2 : {startCount + increment} → J3 : {startCount + 2 * increment} → ... → plafond : {maxLimit}/jour
                </p>
                <div className="border-t border-blue-200 pt-1.5">
                  <p className="text-xs font-semibold text-blue-700">
                    Limite active aujourd'hui : <span className="text-lg">{effectiveLimitToday}</span> / {maxLimit} messages par plateforme
                  </p>
                </div>
              </div>
            </>
          )}

          {!form.social_warmup_enabled && (
            <p className="text-xs text-gray-400 italic">
              Warm-up désactivé — la limite fixe de {maxLimit} messages/plateforme/jour est appliquée.
            </p>
          )}
        </CardContent>
      </Card>

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? 'Sauvegarde...' : 'Sauvegarder les paramètres'}
      </Button>
    </div>
  )
}
