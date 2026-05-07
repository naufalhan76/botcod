'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  MdDashboard,
  MdCloud,
  MdPeople,
  MdRouter,
  MdSmartToy,
  MdMail,
  MdHistory,
  MdFilterList,
  MdSettings,
  MdChevronLeft,
  MdChevronRight,
} from 'react-icons/md'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'

const navItems = [
  { label: 'Overview', icon: MdDashboard, href: '/' },
  { label: 'Provider Pool', icon: MdCloud, href: '/provider-pool' },
  { label: 'Accounts', icon: MdPeople, href: '/accounts' },
  { label: 'Proxies', icon: MdRouter, href: '/proxies' },
  { label: 'Run Bot', icon: MdSmartToy, href: '/run-bot' },
  { label: 'Temp Mail', icon: MdMail, href: '/temp-mail' },
  { label: 'History', icon: MdHistory, href: '/history' },
  { label: 'Content Filter', icon: MdFilterList, href: '/content-filter' },
  { label: 'Settings', icon: MdSettings, href: '/settings' },
]

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed')
    if (stored !== null) setCollapsed(stored === 'true')
  }, [])

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar-collapsed', String(next))
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex flex-col h-full border-r bg-card transition-all duration-200 ease-out',
          collapsed ? 'w-16' : 'w-60',
          className
        )}
      >
        {/* Logo */}
        <div className="flex items-center h-14 px-4 border-b">
          {!collapsed && (
            <span className="text-lg font-semibold tracking-tight">sambungin</span>
          )}
          {collapsed && (
            <span className="text-lg font-semibold mx-auto">S</span>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-2 space-y-1 px-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            const Icon = item.icon

            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary border-l-2 border-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              )
            }

            return <div key={item.href}>{linkContent}</div>
          })}
        </nav>

        {/* Collapse Toggle */}
        <div className="border-t p-2">
          <button
            onClick={toggleCollapse}
            className="flex items-center justify-center w-full rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {collapsed ? <MdChevronRight className="h-5 w-5" /> : <MdChevronLeft className="h-5 w-5" />}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  )
}
