import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MdAdd } from 'react-icons/md'
import type { IconType } from 'react-icons'

interface EmptyStateProps {
  icon?: IconType
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        {Icon && <Icon className="h-12 w-12 text-muted-foreground/50 mb-4" />}
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-muted-foreground mt-1 max-w-sm">{description}</p>
        {actionLabel && onAction && (
          <Button className="mt-4" onClick={onAction}>
            <MdAdd className="h-4 w-4 mr-2" />
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
