'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Clock, Send, AlertCircle, CheckCircle2, Eye } from 'lucide-react'

const STATUS_ICONS: Record<string, React.ReactNode> = {
  queued: <Clock className="h-4 w-4 text-gray-400" />,
  sending: <Send className="h-4 w-4 text-blue-400 animate-pulse" />,
  sent: <Send className="h-4 w-4 text-blue-600" />,
  delivered: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  opened: <Eye className="h-4 w-4 text-purple-500" />,
  clicked: <Eye className="h-4 w-4 text-purple-700" />,
  replied: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  bounced: <AlertCircle className="h-4 w-4 text-red-500" />,
  failed: <AlertCircle className="h-4 w-4 text-red-500" />,
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon', queued: 'En attente', scheduled: 'Planifié', sending: 'Envoi en cours',
  sent: 'Envoyé', delivered: 'Délivré', opened: 'Ouvert', clicked: 'Cliqué',
  replied: 'A répondu', bounced: 'Rebondi', failed: 'Échec',
}

export default function EmailQueuePage() {
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('outreach_messages')
      .select('*, prospect:prospects(domain, company_name, email), email_account:email_accounts(email_address, display_name)')
      .eq('channel', 'email')
      .not('status', 'eq', 'draft')
      .order('created_at', { ascending: false })
      .limit(100)

    setMessages(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Group by status categories
  const queued = messages.filter(m => ['queued', 'scheduled', 'sending'].includes(m.status))
  const sent = messages.filter(m => ['sent', 'delivered', 'opened', 'clicked'].includes(m.status))
  const replied = messages.filter(m => m.status === 'replied')
  const failed = messages.filter(m => ['bounced', 'failed'].includes(m.status))

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">File Email</h1>
        <p className="text-gray-500 mt-1">Historique et statut des emails envoyés</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-5"><p className="text-sm text-gray-500">En attente</p><p className="text-2xl font-bold text-yellow-600">{queued.length}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-sm text-gray-500">Envoyés/Ouverts</p><p className="text-2xl font-bold text-blue-600">{sent.length}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-sm text-gray-500">Réponses</p><p className="text-2xl font-bold text-green-600">{replied.length}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-sm text-gray-500">Échecs/Rebonds</p><p className="text-2xl font-bold text-red-500">{failed.length}</p></CardContent></Card>
      </div>

      {loading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : messages.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-400">Aucun email envoyé. Commencez depuis les campagnes.</CardContent></Card>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Statut</th>
                <th className="text-left px-4 py-3 font-medium">Prospect</th>
                <th className="text-left px-4 py-3 font-medium">Sujet</th>
                <th className="text-left px-4 py-3 font-medium">Compte</th>
                <th className="text-left px-4 py-3 font-medium">Étape</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {messages.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {STATUS_ICONS[m.status]}
                      <span className="text-xs text-gray-600">{STATUS_LABELS[m.status] ?? m.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{m.prospect?.domain}</p>
                      <p className="text-xs text-gray-400">{m.prospect?.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="truncate text-gray-700">{m.subject ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {m.email_account?.display_name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">Étape {m.sequence_step}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {m.sent_at
                      ? format(new Date(m.sent_at), 'dd MMM HH:mm', { locale: fr })
                      : m.scheduled_for
                      ? `Planifié: ${format(new Date(m.scheduled_for), 'dd MMM HH:mm', { locale: fr })}`
                      : format(new Date(m.created_at), 'dd MMM', { locale: fr })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
