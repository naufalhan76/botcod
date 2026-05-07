import { Skeleton } from '@/components/ui/skeleton'

export function ChartSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
