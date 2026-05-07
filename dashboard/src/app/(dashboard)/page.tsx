'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RequestChart, TokenChart } from '@/components/charts'
import { CardSkeleton, ChartSkeleton } from '@/components/skeletons'
import { useOverview } from '@/hooks/use-overview'
import { useProviderHealth, useRequestStats, useTokenStats } from '@/hooks/use-stats'
import { cn } from '@/lib/utils'
import type { ProviderHealthEntry } from '@/types'

const numberFormatter = new Intl.NumberFormat()
const percentFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  style: 'percent',
})

function formatNumber(value: number) {
  return numberFormatter.format(value)
}

function formatPercent(value: number) {
  return percentFormatter.format(value)
}

function formatLastCheck(value: string | null) {
  if (!value) return 'No checks recorded yet'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Last check unavailable'

  return `Last checked ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-rose-500/30 bg-rose-950/10">
      <CardContent className="pt-6">
        <p className="text-sm font-medium text-rose-300">{message}</p>
      </CardContent>
    </Card>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/20 px-6 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  )
}

function statusStyles(status: ProviderHealthEntry['status']) {
  return {
    up: {
      badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
      dot: 'bg-emerald-400',
      card: 'border-emerald-500/20',
    },
    degraded: {
      badge: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
      dot: 'bg-amber-400',
      card: 'border-amber-500/20',
    },
    down: {
      badge: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
      dot: 'bg-rose-400',
      card: 'border-rose-500/20',
    },
  }[status]
}

function ProviderHealthCard({ provider }: { provider: ProviderHealthEntry }) {
  const styles = statusStyles(provider.status)

  return (
    <Card className={cn('overflow-hidden', styles.card)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="break-all text-base">{provider.name}</CardTitle>
          <Badge variant="outline" className={cn('capitalize', styles.badge)}>
            <span className={cn('size-2 rounded-full', styles.dot)} aria-hidden="true" />
            {provider.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{formatPercent(provider.uptime)}</div>
        <p className="mt-2 text-sm text-muted-foreground">{formatLastCheck(provider.lastCheck)}</p>
      </CardContent>
    </Card>
  )
}

export default function OverviewPage() {
  const overview = useOverview()
  const requestStats = useRequestStats('24h')
  const tokenStats = useTokenStats('24h')
  const providerHealth = useProviderHealth()

  const requestBuckets = requestStats.data?.buckets ?? []
  const tokenRows = tokenStats.data?.byProvider ?? []
  const providers = providerHealth.data?.providers ?? []

  const totalRequests = requestBuckets.reduce((sum, bucket) => sum + bucket.count, 0)
  const totalErrors = requestBuckets.reduce((sum, bucket) => sum + bucket.error, 0)
  const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0
  const activeKeys = (overview.data?.pool.active ?? 0) + (overview.data?.kiro_pool.active ?? 0)
  const totalKeys = (overview.data?.pool.total ?? 0) + (overview.data?.kiro_pool.total ?? 0)
  const totalTokens = tokenRows.reduce((sum, row) => sum + row.total, 0)

  const hasStatsError = overview.isError || requestStats.isError || tokenStats.isError

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-2 text-muted-foreground">Live router health, traffic, and token usage.</p>
      </div>

      {hasStatsError ? (
        <ErrorCard message="Could not load overview metrics. Check the server connection and try again." />
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4" aria-label="Overview stats">
        {overview.isLoading || requestStats.isLoading || tokenStats.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} />)
        ) : (
          <>
            <StatCard title="Total Requests" value={formatNumber(totalRequests)} subtitle="Requests recorded in the last 24 hours" />
            <StatCard title="Active Keys" value={formatNumber(activeKeys)} subtitle={`${formatNumber(totalKeys)} keys across CodeBuddy and Kiro`} />
            <StatCard title="Token Usage" value={formatNumber(totalTokens)} subtitle="Prompt and completion tokens in the last 24 hours" />
            <StatCard title="Error Rate" value={formatPercent(errorRate)} subtitle={`${formatNumber(totalErrors)} failed requests in the last 24 hours`} />
          </>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Traffic charts">
        {requestStats.isLoading ? (
          <ChartSkeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Request Volume</CardTitle>
            </CardHeader>
            <CardContent>
              {requestBuckets.length > 0 ? <RequestChart data={requestBuckets} /> : <EmptyState label="No request volume recorded yet." />}
            </CardContent>
          </Card>
        )}

        {tokenStats.isLoading ? (
          <ChartSkeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Token Consumption</CardTitle>
            </CardHeader>
            <CardContent>
              {tokenRows.length > 0 ? <TokenChart data={tokenRows} /> : <EmptyState label="No token usage recorded yet." />}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-4" aria-label="Provider health">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Provider Health</h2>
          <p className="mt-1 text-sm text-muted-foreground">Status from recent upstream checks.</p>
        </div>

        {providerHealth.isError ? <ErrorCard message="Could not load provider health." /> : null}

        {providerHealth.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => <CardSkeleton key={index} />)}
          </div>
        ) : providers.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {providers.map((provider) => (
              <ProviderHealthCard key={provider.name} provider={provider} />
            ))}
          </div>
        ) : (
          <EmptyState label="No provider checks recorded yet. Health appears after routed traffic." />
        )}
      </section>
    </div>
  )
}
