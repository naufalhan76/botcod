import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ErrorState } from '../error-state'

describe('ErrorState', () => {
  it('renders default error message', () => {
    render(<ErrorState />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('renders custom title and message', () => {
    render(<ErrorState title="Custom Error" message="Custom message" />)
    expect(screen.getByText('Custom Error')).toBeInTheDocument()
    expect(screen.getByText('Custom message')).toBeInTheDocument()
  })

  it('calls onRetry when retry button clicked', () => {
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} />)
    fireEvent.click(screen.getByText('Try Again'))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('does not show retry button when onRetry not provided', () => {
    render(<ErrorState />)
    expect(screen.queryByText('Try Again')).not.toBeInTheDocument()
  })
})
