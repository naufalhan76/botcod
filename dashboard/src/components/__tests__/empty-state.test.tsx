import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EmptyState } from '../empty-state'

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No Data" description="Nothing here yet" />)
    expect(screen.getByText('No Data')).toBeInTheDocument()
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
  })

  it('renders action button when provided', () => {
    const onAction = vi.fn()
    render(<EmptyState title="Empty" description="Add items" actionLabel="Add" onAction={onAction} />)
    fireEvent.click(screen.getByText('Add'))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('does not render action button when not provided', () => {
    render(<EmptyState title="Empty" description="Nothing" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
