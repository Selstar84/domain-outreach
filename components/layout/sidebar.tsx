'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Globe,
  Megaphone,
  Mail,
  Users,
  Calendar,
  Settings,
  LogOut,
  Inbox,
  FileText,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campagnes', icon: Megaphone },
  { href: '/domains', label: 'Mes Domaines', icon: Globe },
  { href: '/queue/email', label: 'File Email', icon: Mail },
  { href: '/queue/social', label: 'File Sociale', icon: Calendar, badgeKey: 'social' },
  { href: '/templates', label: 'Mes Modèles', icon: FileText },
  { href: '/email-accounts', label: 'Comptes Email', icon: Inbox },
  { href: '/settings', label: 'Paramètres', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [socialDueCount, setSocialDueCount] = useState(0)

  useEffect(() => {
    async function fetchDueCount() {
      try {
        const res = await fetch('/api/outreach/social/due-followups')
        if (res.ok) {
          const data = await res.json()
          setSocialDueCount(data.count ?? 0)
        }
      } catch {
        // Silently fail — badge just won't show
      }
    }
    fetchDueCount()
    // Refresh every 5 minutes
    const interval = setInterval(fetchDueCount, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex h-screen w-60 flex-col border-r bg-white">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b">
        <Globe className="h-6 w-6 text-blue-600" />
        <span className="font-bold text-gray-900">Domain Outreach</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const badge = item.badgeKey === 'social' && socialDueCount > 0 ? socialDueCount : null
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {badge !== null && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-xs font-bold text-white">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="border-t px-3 py-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-gray-600 hover:text-red-600"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </Button>
      </div>
    </div>
  )
}
