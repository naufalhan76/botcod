'use client'

import { MdErrorOutline, MdRefresh } from 'react-icons/md'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function ErrorState({ 
  title = 'Something went wrong', 
  message = 'Failed to load data. Please try again.',
  onRetry 
}: ErrorStateProps) {
  return (
    <Card className="border-destructive/50">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <MdErrorOutline className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-muted-foreground mt-1 max-w-sm">{message}</p>
        {onRetry && (
          <Button variant="outline" className="mt-4" onClick={onRetry}>
            <MdRefresh className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
