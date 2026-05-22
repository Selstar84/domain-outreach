'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { getEffectiveDailyLimit } from '@/lib/social/limits'

export default function SettingsPage() {
  const [form, setForm] = useState({
    // Core
    whoisxml_api_key: '',
    hunter_api_key: '',
    anthropic_api_key: '',
    google_places_api_key: '',

    // Prospect discovery
    prospect_finder_tool: '' as string,
    apollo_api_key: '',
    snov_api_key: '',
    dropcontact_api_key: '',

    // LinkedIn
    linkedin_tool: '' as string,
    phantombuster_api_key: '',
    phantombuster_linkedin_agent_id: '',
    lemlist_api_key: '',

    // WhatsApp
    whatsapp_tool: '' as string,
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_whatsapp_number: '',

    // Instagram & Facebook
    apify_api_key: '',
    instagram_session_cookie: '',
    facebook_session_cookie: '',

    // Atom.com
    atom_api_key: '',
    atom_appraisal_api_key: '',

    // Limits
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
        const d = data as any
        setForm({
          whoisxml_api_key: d.whoisxml_api_key ?? '',
          hunter_api_key: d.hunter_api_key ?? '',
          anthropic_api_key: d.anthropic_api_key ?? '',
          google_places_api_key: d.google_places_api_key ?? '',

          prospect_finder_tool: d.prospect_finder_tool ?? '',
          apollo_api_key: d.apollo_api_key ?? '',
          snov_api_key: d.snov_api_key ?? '',
          dropcontact_api_key: d.dropcontact_api_key ?? '',

          linkedin_tool: d.linkedin_tool ?? '',
          phantombuster_api_key: d.phantombuster_api_key ?? '',
          phantombuster_linkedin_agent_id: d.phantombuster_linkedin_agent_id ?? '',
          lemlist_api_key: d.lemlist_api_key ?? '',

          whatsapp_tool: d.whatsapp_tool ?? '',
          twilio_account_sid: d.twilio_account_sid ?? '',
          twilio_auth_token: d.twilio_auth_token ?? '',
          twilio_whatsapp_number: d.twilio_whatsapp_number ?? '',

          apify_api_key: d.apify_api_key ?? '',
          instagram_session_cookie: d.instagram_session_cookie ?? '',
          facebook_session_cookie: d.facebook_session_cookie ?? '',

          atom_api_key: d.atom_api_key ?? '',
          atom_appraisal_api_key: d.atom_appraisal_api_key ?? '',

          social_daily_limit: String(d.social_daily_limit ?? 15),
          email_daily_limit_global: String(d.email_daily_limit_global ?? 500),
          check_timeout_ms: String(d.check_timeout_ms ?? 5000),
          social_warmup_enabled: d.social_warmup_enabled ?? false,
          social_warmup_start_date: d.social_warmup_start_date ?? '',
          social_warmup_start_count: String(d.social_warmup_start_count ?? 5),
          social_warmup_increment: String(d.social_warmup_increment ?? 2),
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
      // Core
      whoisxml_api_key: form.whoisxml_api_key || null,
      hunter_api_key: form.hunter_api_key || null,
      anthropic_api_key: form.anthropic_api_key || null,
      google_places_api_key: form.google_places_api_key || null,

      // Prospect discovery
      prospect_finder_tool: form.prospect_finder_tool || null,
      apollo_api_key: form.apollo_api_key || null,
      snov_api_key: form.snov_api_key || null,
      dropcontact_api_key: form.dropcontact_api_key || null,

      // LinkedIn
      linkedin_tool: form.linkedin_tool || null,
      phantombuster_api_key: form.phantombuster_api_key || null,
      phantombuster_linkedin_agent_id: form.phantombuster_linkedin_agent_id || null,
      lemlist_api_key: form.lemlist_api_key || null,

      // WhatsApp
      whatsapp_tool: form.whatsapp_tool || null,
      twilio_account_sid: form.twilio_account_sid || null,
      twilio_auth_token: form.twilio_auth_token || null,
      twilio_whatsapp_number: form.twilio_whatsapp_number || null,

      // Instagram & Facebook
      apify_api_key: form.apify_api_key || null,
      instagram_session_cookie: form.instagram_session_cookie || null,
      facebook_session_cookie: form.facebook_session_cookie || null,

      // Atom.com
      atom_api_key: form.atom_api_key || null,
      atom_appraisal_api_key: form.atom_appraisal_api_key || null,

      // Limits
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

      {/* Core API Keys */}
      <Card>
        <CardHeader><CardTitle className="text-base">Clés API essentielles</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Anthropic Claude API Key *</Label>
            <Input type="password" value={form.anthropic_api_key} onChange={e => f('anthropic_api_key', e.target.value)} placeholder="sk-ant-..." />
            <p className="text-xs text-gray-400">Pour générer les messages personnalisés et analyser les domaines. <a href="https://console.anthropic.com" target="_blank" className="text-blue-500 underline">console.anthropic.com</a></p>
          </div>
          <div className="space-y-2">
            <Label>WhoisXML API Key</Label>
            <Input type="password" value={form.whoisxml_api_key} onChange={e => f('whoisxml_api_key', e.target.value)} placeholder="at_..." />
            <p className="text-xs text-gray-400">Pour les infos WHOIS des prospects. Optionnel.</p>
          </div>
          <div className="space-y-2">
            <Label>Google Places API Key</Label>
            <Input type="password" value={form.google_places_api_key} onChange={e => f('google_places_api_key', e.target.value)} placeholder="AIza..." />
            <p className="text-xs text-gray-400">
              Pour découvrir des entreprises locales via Google Maps.{' '}
              <a href="https://console.cloud.google.com/apis/library/places-backend.googleapis.com" target="_blank" className="text-blue-500 underline">
                Activer l'API Places (New)
              </a>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Prospect Discovery */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">🔍 Recherche de prospects (contacts décideurs)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">Trouver les emails et profils LinkedIn des décideurs (CEO, Owner, Founder…) via une base de données B2B.</p>
          <div className="space-y-2">
            <Label>Outil de recherche</Label>
            <Select value={form.prospect_finder_tool} onValueChange={v => f('prospect_finder_tool', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un outil…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="apollo">Apollo.io — base de 275M contacts, emails vérifiés</SelectItem>
                <SelectItem value="snov">Snov.io — enrichissement par domaine</SelectItem>
                <SelectItem value="hunter">Hunter.io — recherche par domaine d'entreprise</SelectItem>
                <SelectItem value="dropcontact">Dropcontact — enrichissement RGPD (France)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.prospect_finder_tool === 'apollo' && (
            <div className="space-y-2 border rounded-lg p-3 bg-gray-50">
              <Label>Apollo.io API Key</Label>
              <Input type="password" value={form.apollo_api_key} onChange={e => f('apollo_api_key', e.target.value)} placeholder="..." />
              <p className="text-xs text-gray-400">Plan gratuit : 50 crédits/mois. Plan Basic (~$49/mois) : 10 000/mois. <a href="https://app.apollo.io/#/settings/integrations/api" target="_blank" className="text-blue-500 underline">Obtenir la clé</a></p>
            </div>
          )}

          {form.prospect_finder_tool === 'snov' && (
            <div className="space-y-2 border rounded-lg p-3 bg-gray-50">
              <Label>Snov.io Client ID / API Key</Label>
              <Input type="password" value={form.snov_api_key} onChange={e => f('snov_api_key', e.target.value)} placeholder="..." />
              <p className="text-xs text-gray-400">Plan Starter ~$39/mois. <a href="https://app.snov.io/api-setting" target="_blank" className="text-blue-500 underline">Obtenir la clé</a></p>
            </div>
          )}

          {form.prospect_finder_tool === 'hunter' && (
            <div className="space-y-2 border rounded-lg p-3 bg-gray-50">
              <Label>Hunter.io API Key</Label>
              <Input type="password" value={form.hunter_api_key} onChange={e => f('hunter_api_key', e.target.value)} placeholder="..." />
              <p className="text-xs text-gray-400">Plan gratuit : 25 req/mois. Starter $49/mois : 500 req. <a href="https://hunter.io/api-keys" target="_blank" className="text-blue-500 underline">Obtenir la clé</a></p>
            </div>
          )}

          {form.prospect_finder_tool === 'dropcontact' && (
            <div className="space-y-2 border rounded-lg p-3 bg-gray-50">
              <Label>Dropcontact API Key</Label>
              <Input type="password" value={form.dropcontact_api_key} onChange={e => f('dropcontact_api_key', e.target.value)} placeholder="..." />
              <p className="text-xs text-gray-400">Enrichissement uniquement (pas de recherche par mot-clé). <a href="https://app.dropcontact.com/api" target="_blank" className="text-blue-500 underline">Obtenir la clé</a></p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* LinkedIn Automation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">💼 Automatisation LinkedIn</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">Envoyer des messages directs LinkedIn automatiquement via un agent cloud.</p>
          <div className="space-y-2">
            <Label>Outil LinkedIn</Label>
            <Select value={form.linkedin_tool} onValueChange={v => f('linkedin_tool', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un outil…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="phantombuster">Phantombuster — agent cloud LinkedIn DM</SelectItem>
                <SelectItem value="lemlist">Lemlist — séquences multicanal avec LinkedIn</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.linkedin_tool === 'phantombuster' && (
            <div className="space-y-3 border rounded-lg p-3 bg-gray-50">
              <div className="space-y-2">
                <Label>Phantombuster API Key</Label>
                <Input type="password" value={form.phantombuster_api_key} onChange={e => f('phantombuster_api_key', e.target.value)} placeholder="..." />
              </div>
              <div className="space-y-2">
                <Label>LinkedIn Message Sender Agent ID</Label>
                <Input value={form.phantombuster_linkedin_agent_id} onChange={e => f('phantombuster_linkedin_agent_id', e.target.value)} placeholder="1234567890" />
                <p className="text-xs text-gray-400">
                  Créer le phantom "LinkedIn Message Sender" sur Phantombuster et copier son ID. Plan Starter ~$56/mois.{' '}
                  <a href="https://phantombuster.com/phantombuster?category=linkedin&q=message+sender" target="_blank" className="text-blue-500 underline">Trouver le phantom</a>
                </p>
              </div>
            </div>
          )}

          {form.linkedin_tool === 'lemlist' && (
            <div className="space-y-2 border rounded-lg p-3 bg-gray-50">
              <Label>Lemlist API Key</Label>
              <Input type="password" value={form.lemlist_api_key} onChange={e => f('lemlist_api_key', e.target.value)} placeholder="..." />
              <p className="text-xs text-gray-400">Plan Email Pro + LinkedIn ~$99/mois. <a href="https://app.lemlist.com/settings/api" target="_blank" className="text-blue-500 underline">Obtenir la clé</a></p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* WhatsApp */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📱 WhatsApp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">Envoyer des messages WhatsApp via l'API officielle (nécessite un numéro WhatsApp Business vérifié).</p>
          <div className="space-y-2">
            <Label>Outil WhatsApp</Label>
            <Select value={form.whatsapp_tool} onValueChange={v => f('whatsapp_tool', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un outil…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="twilio">Twilio — API WhatsApp Business officielle</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.whatsapp_tool === 'twilio' && (
            <div className="space-y-3 border rounded-lg p-3 bg-gray-50">
              <div className="space-y-2">
                <Label>Twilio Account SID</Label>
                <Input type="password" value={form.twilio_account_sid} onChange={e => f('twilio_account_sid', e.target.value)} placeholder="AC..." />
              </div>
              <div className="space-y-2">
                <Label>Twilio Auth Token</Label>
                <Input type="password" value={form.twilio_auth_token} onChange={e => f('twilio_auth_token', e.target.value)} placeholder="..." />
              </div>
              <div className="space-y-2">
                <Label>Numéro WhatsApp Twilio (format E.164)</Label>
                <Input value={form.twilio_whatsapp_number} onChange={e => f('twilio_whatsapp_number', e.target.value)} placeholder="+14155238886" />
                <p className="text-xs text-gray-400">
                  Environ $0.005/message. Nécessite une approbation Meta (~3-4 semaines) ou utiliser le sandbox pour les tests.{' '}
                  <a href="https://console.twilio.com" target="_blank" className="text-blue-500 underline">console.twilio.com</a>
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instagram & Facebook */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📸 Instagram & Facebook (Apify)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Envoyer des messages directs Instagram et Facebook via des acteurs Apify (automatisation navigateur cloud).
            Nécessite un cookie de session actif pour chaque plateforme.
          </p>
          <div className="space-y-2">
            <Label>Apify API Key</Label>
            <Input type="password" value={form.apify_api_key} onChange={e => f('apify_api_key', e.target.value)} placeholder="apify_api_..." />
            <p className="text-xs text-gray-400">
              Utilisée pour Instagram ET Facebook. Plan Starter ~$49/mois (100 USD de compute).{' '}
              <a href="https://console.apify.com/account/integrations" target="_blank" className="text-blue-500 underline">Obtenir la clé</a>
            </p>
          </div>
          <div className="space-y-2">
            <Label>Cookie de session Instagram</Label>
            <Input
              value={form.instagram_session_cookie}
              onChange={e => f('instagram_session_cookie', e.target.value)}
              placeholder='[{"name":"sessionid","value":"...","domain":".instagram.com"}]'
              className="font-mono text-xs"
            />
            <p className="text-xs text-gray-400">
              Exporter depuis votre navigateur (extension "Cookie-Editor") après connexion Instagram. Format JSON.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Cookie de session Facebook</Label>
            <Input
              value={form.facebook_session_cookie}
              onChange={e => f('facebook_session_cookie', e.target.value)}
              placeholder='[{"name":"c_user","value":"...","domain":".facebook.com"}]'
              className="font-mono text-xs"
            />
            <p className="text-xs text-gray-400">
              Exporter depuis votre navigateur après connexion Facebook. Format JSON. Expiration ~90 jours.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Atom.com */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">⚛️ Atom.com Marketplace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Synchroniser automatiquement vos domaines Atom.com, obtenir des analytics de vues/leads et l'évaluation Atom.
            La clé Seller est dans <a href="https://www.atom.com/account/api" target="_blank" className="text-blue-500 underline">atom.com/account/api</a>.
          </p>
          <div className="space-y-2">
            <Label>Clé API Seller (Atom.com)</Label>
            <Input
              type="password"
              value={form.atom_api_key}
              onChange={e => f('atom_api_key', e.target.value)}
              placeholder="atom_..."
            />
            <p className="text-xs text-gray-400">
              Pour importer vos domaines, synchroniser les prix et accéder aux analytics (vues, leads, offres).
            </p>
          </div>
          <div className="space-y-2">
            <Label>Clé API Appraisal (séparée)</Label>
            <Input
              type="password"
              value={form.atom_appraisal_api_key}
              onChange={e => f('atom_appraisal_api_key', e.target.value)}
              placeholder="atom_appraisal_..."
            />
            <p className="text-xs text-gray-400">
              Clé distincte pour l'endpoint d'évaluation Atom. Visible dans votre compte sous "Appraisal API".
              Optionnelle — sans elle, l'évaluation utilise les 4 autres sources (GoDaddy, NameBio, Trends, Claude).
            </p>
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
              <div className="space-y-2">
                <Label>Date de début du warm-up</Label>
                <Input
                  type="date"
                  value={form.social_warmup_start_date}
                  onChange={e => f('social_warmup_start_date', e.target.value)}
                />
                <p className="text-xs text-gray-400">Jour 1 de votre progression</p>
              </div>

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
