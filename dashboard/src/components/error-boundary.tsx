'use client'

import { Component, type ReactNode } from 'react'
import { ErrorState } from './error-state'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <ErrorState
          title="Unexpected Error"
          message={this.state.error?.message || 'An unexpected error occurred.'}
          onRetry={() => this.setState({ hasError: false })}
        />
      )
    }
    return this.props.children
  }
}
