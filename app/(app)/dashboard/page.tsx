import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Globe, Megaphone, Mail, TrendingUp, Users, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { count: domainsCount },
    { count: campaignsCount },
    { data: prospects },
    { data: messages },
    { data: socialToday },
  ] = await Promise.all([
    supabase.from('owned_domains').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'active'),
    supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'active'),
    supabase.from('prospects').select('status').eq('user_id', user!.id),
    supabase.from('outreach_messages').select('status, channel, created_at').eq('user_id', user!.id),
    supabase.from('social_queue_daily').select('*').eq('user_id', user!.id).eq('date', new Date().toISOString().slice(0, 10)).single(),
  ])

  const stats = {
    totalProspects: prospects?.length ?? 0,
    contacted: prospects?.filter(p => ['contacted', 'replied', 'negotiating', 'sold'].includes(p.status)).length ?? 0,
    replied: prospects?.filter(p => ['replied', 'negotiating'].includes(p.status)).length ?? 0,
    sold: prospects?.filter(p => p.status === 'sold').length ?? 0,
    emailsSent: messages?.filter(m => m.channel === 'email' && m.status === 'sent').length ?? 0,
    emailsOpened: messages?.filter(m => m.status === 'opened').length ?? 0,
    socialSentToday: (socialToday as any)?.sent_count ?? 0,
    socialLimit: (socialToday as any)?.daily_limit ?? 15,
  }

  const openRate = stats.emailsSent > 0 ? Math.round((stats.emailsOpened / stats.emailsSent) * 100) : 0

  // Recent campaigns
  const { data: recentCampaigns } = await supabase
    .from('campaigns')
    .select('*, owned_domain:owned_domains(domain)')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Vue d'ensemble de vos campagnes d'outreach</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Globe className="h-5 w-5 text-blue-600" />} label="Domaines actifs" value={domainsCount ?? 0} />
        <StatCard icon={<Megaphone className="h-5 w-5 text-purple-600" />} label="Campagnes actives" value={campaignsCount ?? 0} />
        <StatCard icon={<Users className="h-5 w-5 text-orange-600" />} label="Prospects trouvés" value={stats.totalProspects} />
        <StatCard icon={<Mail className="h-5 w-5 text-green-600" />} label="Emails envoyés" value={stats.emailsSent} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<TrendingUp className="h-5 w-5 text-blue-600" />} label="Contactés" value={stats.contacted} subtitle={`${stats.totalProspects > 0 ? Math.round(stats.contacted / stats.totalProspects * 100) : 0}% du total`} />
        <StatCard icon={<TrendingUp className="h-5 w-5 text-yellow-600" />} label="Ont répondu" value={stats.replied} subtitle="En négociation inclus" />
        <StatCard icon={<CheckCircle className="h-5 w-5 text-green-600" />} label="Vendus" value={stats.sold} subtitle="Domaines vendus" />
        <StatCard icon={<Mail className="h-5 w-5 text-indigo-600" />} label="Taux d'ouverture" value={`${openRate}%`} subtitle={`${stats.emailsOpened} ouvertures`} />
      </div>

      {/* Social Today */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Messages sociaux aujourd'hui</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-gray-100 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all"
                style={{ width: `${Math.min((stats.socialSentToday / stats.socialLimit) * 100, 100)}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700">
              {stats.socialSentToday} / {stats.socialLimit}
            </span>
            <Link href="/queue/social" className="text-sm text-blue-600 hover:underline">
              Voir la file →
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recent Campaigns */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Campagnes récentes</CardTitle>
          <Link href="/campaigns" className="text-sm text-blue-600 hover:underline">Voir tout →</Link>
        </CardHeader>
        <CardContent>
          {!recentCampaigns?.length ? (
            <p className="text-gray-500 text-sm">Aucune campagne. <Link href="/campaigns/new" className="text-blue-600 hover:underline">Créer une campagne</Link></p>
          ) : (
            <div className="space-y-3">
              {recentCampaigns.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <Link href={`/campaigns/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                      {(c as any).owned_domain?.domain}
                    </Link>
                    <p className="text-sm text-gray-500">{c.total_prospects} prospects trouvés</p>
                  </div>
                  <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>
                    {c.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ icon, label, value, subtitle }: { icon: React.ReactNode; label: string; value: number | string; subtitle?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-2">
          {icon}
          <span className="text-sm text-gray-500">{label}</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}
