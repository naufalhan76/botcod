'use client'

import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { MdLightMode, MdDarkMode, MdMenu } from 'react-icons/md'
import { Button } from '@/components/ui/button'

const pageTitles: Record<string, string> = {
  '/': 'Overview',
  '/provider-pool': 'Provider Pool',
  '/accounts': 'Accounts',
  '/proxies': 'Proxies',
  '/run-bot': 'Run Bot',
  '/temp-mail': 'Temp Mail',
  '/history': 'History',
  '/content-filter': 'Content Filter',
  '/settings': 'Settings',
}

interface TopbarProps {
  onMenuClick?: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()

  const title = pageTitles[pathname] || 'Dashboard'

  return (
    <header className="sticky top-0 z-30 flex items-center h-14 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden mr-2"
        onClick={onMenuClick}
      >
        <MdMenu className="h-5 w-5" />
      </Button>

      {/* Page title */}
      <h1 className="text-lg font-semibold">{title}</h1>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? (
          <MdLightMode className="h-5 w-5" />
        ) : (
          <MdDarkMode className="h-5 w-5" />
        )}
      </Button>
    </header>
  )
}
