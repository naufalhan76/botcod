import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.localStorage = localStorageMock as any

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

import { Sidebar } from '../layout/sidebar'

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })

  it('renders all 9 navigation items', () => {
    render(<Sidebar />)
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Provider Pool')).toBeInTheDocument()
    expect(screen.getByText('Accounts')).toBeInTheDocument()
    expect(screen.getByText('Proxies')).toBeInTheDocument()
    expect(screen.getByText('Run Bot')).toBeInTheDocument()
    expect(screen.getByText('Temp Mail')).toBeInTheDocument()
    expect(screen.getByText('History')).toBeInTheDocument()
    expect(screen.getByText('Content Filter')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders logo text', () => {
    render(<Sidebar />)
    expect(screen.getByText('sambungin')).toBeInTheDocument()
  })
})
