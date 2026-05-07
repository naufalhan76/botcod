'use client'

import { useEffect, useState } from 'react'
import { usePool, useKiroPool, useSetPoolStatus, useWarmupPool, useWarmupKiroPool, usePurgeDeadPool, usePurgeDeadKiroPool } from '@/hooks/use-pool'
import { TableSkeleton } from '@/components/skeletons'
import { ErrorState } from '@/components/error-state'
import { EmptyState } from '@/components/empty-state'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { showSuccess, showError } from '@/lib/toast'
import { apiFetch } from '@/lib/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { MdRefresh, MdMoreVert, MdCloud, MdPlayArrow, MdDeleteSweep } from 'react-icons/md'
import type { WarmupSummary } from '@/types'

const PAGE_SIZE = 10

export default function ProviderPoolPage() {
  const { data: poolData, isLoading: poolLoading, isError: poolError, refetch: refetchPool } = usePool()
  const { data: kiroData, isLoading: kiroLoading, isError: kiroError, refetch: refetchKiro } = useKiroPool()
  const setStatus = useSetPoolStatus()
  const warmupPool = useWarmupPool()
  const warmupKiroPool = useWarmupKiroPool()
  const purgeDeadPool = usePurgeDeadPool()
  const purgeDeadKiroPool = usePurgeDeadKiroPool()
  const qc = useQueryClient()
  const [reloading, setReloading] = useState(false)
  const [cbPage, setCbPage] = useState(1)
  const [kiroPage, setKiroPage] = useState(1)
  const [cbWarmupResult, setCbWarmupResult] = useState<WarmupSummary | null>(null)
  const [kiroWarmupResult, setKiroWarmupResult] = useState<WarmupSummary | null>(null)

  const poolEntryCount = poolData?.entries.length ?? 0
  const kiroEntryCount = kiroData?.entries.length ?? 0
  const cbTotalPages = Math.max(1, Math.ceil(poolEntryCount / PAGE_SIZE))
  const kiroTotalPages = Math.max(1, Math.ceil(kiroEntryCount / PAGE_SIZE))
  const cbPageIndex = Math.min(cbPage, cbTotalPages)
  const kiroPageIndex = Math.min(kiroPage, kiroTotalPages)
  const cbVisibleEntries = poolData?.entries.slice((cbPageIndex - 1) * PAGE_SIZE, cbPageIndex * PAGE_SIZE) ?? []
  const kiroVisibleEntries = kiroData?.entries.slice((kiroPageIndex - 1) * PAGE_SIZE, kiroPageIndex * PAGE_SIZE) ?? []

  useEffect(() => {
    setCbPage(1)
  }, [poolEntryCount])

  useEffect(() => {
    setKiroPage(1)
  }, [kiroEntryCount])

  useEffect(() => {
    setCbWarmupResult(null)
  }, [cbPageIndex])

  useEffect(() => {
    setKiroWarmupResult(null)
  }, [kiroPageIndex])

  useEffect(() => {
    if (!cbWarmupResult) return
    const timer = setTimeout(() => {
      setCbWarmupResult(null)
    }, 30000)
    return () => clearTimeout(timer)
  }, [cbWarmupResult])

  useEffect(() => {
    if (!kiroWarmupResult) return
    const timer = setTimeout(() => {
      setKiroWarmupResult(null)
    }, 30000)
    return () => clearTimeout(timer)
  }, [kiroWarmupResult])

  const handleStatusChange = async (identifier: string, status: string) => {
    try {
      await setStatus.mutateAsync({ identifier, status })
      showSuccess(`Status updated to ${status}`)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const handleReload = async () => {
    setReloading(true)
    try {
      await apiFetch('/api/pool/reload', { method: 'POST' })
      qc.invalidateQueries({ queryKey: ['pool'] })
      showSuccess('Pool reloaded')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to reload pool')
    } finally {
      setReloading(false)
    }
  }

  const handleWarmupCb = async () => {
    setCbWarmupResult(null)
    try {
      const res = await warmupPool.mutateAsync()
      setCbWarmupResult(res)
      showSuccess(`Warmup complete: ${res.ok} OK, ${res.dead} Dead`)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to warmup CodeBuddy pool')
    }
  }

  const handleWarmupKiro = async () => {
    setKiroWarmupResult(null)
    try {
      const res = await warmupKiroPool.mutateAsync()
      setKiroWarmupResult(res)
      showSuccess(`Warmup complete: ${res.ok} OK, ${res.dead} Dead`)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to warmup Kiro pool')
    }
  }

  const handlePurgeDeadCb = async () => {
    if (!confirm('Delete ALL dead CodeBuddy keys? This cannot be undone.')) return
    try {
      const res = await purgeDeadPool.mutateAsync()
      showSuccess(`Purged ${res.removed} dead key(s)`)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to purge dead keys')
    }
  }

  const handlePurgeDeadKiro = async () => {
    if (!confirm('Delete ALL dead Kiro credentials? This cannot be undone.')) return
    try {
      const res = await purgeDeadKiroPool.mutateAsync()
      showSuccess(`Purged ${res.removed} dead credential(s)`)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to purge dead Kiro credentials')
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      active: 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20',
      cooldown: 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20',
      dead: 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20',
    }
    return (
      <Badge variant="outline" className={variants[status as keyof typeof variants] || ''}>
        {status}
      </Badge>
    )
  }

  const renderPagination = (page: number, totalPages: number, setPage: (page: number) => void) => {
    if (totalPages <= 1) return null

    return (
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
        <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page === 1}>
          Previous
        </Button>
        <span className="text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page === totalPages}>
          Next
        </Button>
      </div>
    )
  }

  const renderWarmupResult = (result: WarmupSummary | null) => {
    if (!result) return null
    return (
      <div className="mt-4 rounded-md bg-muted/50 p-4 text-sm">
        <div className="mb-2 font-medium">Warmup Results</div>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-1.5"><span className="text-muted-foreground">Tested:</span> {result.tested}</div>
          <div className="flex items-center gap-1.5"><span className="text-emerald-600">OK:</span> {result.ok}</div>
          <div className="flex items-center gap-1.5"><span className="text-rose-600">Dead:</span> {result.dead}</div>
          <div className="flex items-center gap-1.5"><span className="text-amber-600">Cooldown:</span> {result.cooldown}</div>
          <div className="flex items-center gap-1.5"><span className="text-orange-600">Timeout:</span> {result.timeout}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Provider Pool</h1>
        <p className="text-muted-foreground mt-2">Manage CodeBuddy and Kiro credential pools.</p>
      </div>

      {/* CodeBuddy Pool */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>CodeBuddy Pool</CardTitle>
              <CardDescription>
                {poolData && (
                  <span className="text-sm">
                    {poolData.summary.active} active, {poolData.summary.cooldown} cooldown, {poolData.summary.dead} dead
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleWarmupCb}
                disabled={warmupPool.isPending || poolLoading}
              >
                {warmupPool.isPending ? (
                  <MdRefresh className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <MdPlayArrow className="mr-2 h-4 w-4" />
                )}
                {warmupPool.isPending ? 'Warming up...' : 'Warmup All'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchPool()}
                disabled={poolLoading || reloading}
              >
                <MdRefresh className={`mr-2 h-4 w-4 ${poolLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReload}
                disabled={reloading}
              >
                <MdCloud className={`mr-2 h-4 w-4 ${reloading ? 'animate-bounce' : ''}`} />
                Reload
              </Button>
              {poolData && poolData.summary.dead > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handlePurgeDeadCb}
                  disabled={purgeDeadPool.isPending}
                >
                  <MdDeleteSweep className="mr-2 h-4 w-4" />
                  {purgeDeadPool.isPending ? 'Deleting...' : `Delete dead (${poolData.summary.dead})`}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {renderWarmupResult(cbWarmupResult)}
            {poolLoading ? (
            <TableSkeleton rows={3} />
          ) : poolError ? (
            <ErrorState
              title="Failed to load CodeBuddy pool"
              message="Could not fetch pool data. Please try again."
              onRetry={refetchPool}
            />
          ) : !poolData || poolData.entries.length === 0 ? (
            <EmptyState
              icon={MdCloud}
              title="No keys in pool"
              description="Add keys to codebuddy_keys.txt or run the signup bot to get started."
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cbVisibleEntries.map((entry) => (
                    <TableRow key={entry.email}>
                      <TableCell className="font-medium">{entry.email}</TableCell>
                      <TableCell className="font-mono text-sm">{entry.key_masked}</TableCell>
                      <TableCell>{getStatusBadge(entry.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.last_used_at ? new Date(entry.last_used_at).toLocaleString() : 'Never'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MdMoreVert className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleStatusChange(entry.email, 'active')}>
                              Set Active
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(entry.email, 'cooldown')}>
                              Set Cooldown
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(entry.email, 'dead')}>
                              Set Dead
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {renderPagination(cbPageIndex, cbTotalPages, setCbPage)}
            </div>
          )}
          </div>
        </CardContent>
      </Card>

      {/* Kiro Pool */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Kiro Pool</CardTitle>
              <CardDescription>
                {kiroData && (
                  <span className="text-sm">
                    {kiroData.summary.active} active, {kiroData.summary.cooldown} cooldown, {kiroData.summary.dead} dead
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleWarmupKiro}
                disabled={warmupKiroPool.isPending || kiroLoading}
              >
                {warmupKiroPool.isPending ? (
                  <MdRefresh className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <MdPlayArrow className="mr-2 h-4 w-4" />
                )}
                {warmupKiroPool.isPending ? 'Warming up...' : 'Warmup All'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchKiro()}
                disabled={kiroLoading}
              >
                <MdRefresh className={`mr-2 h-4 w-4 ${kiroLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {kiroData && kiroData.summary.dead > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handlePurgeDeadKiro}
                  disabled={purgeDeadKiroPool.isPending}
                >
                  <MdDeleteSweep className="mr-2 h-4 w-4" />
                  {purgeDeadKiroPool.isPending ? 'Deleting...' : `Delete dead (${kiroData.summary.dead})`}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {renderWarmupResult(kiroWarmupResult)}
            {kiroLoading ? (
            <TableSkeleton rows={3} />
          ) : kiroError ? (
            <ErrorState
              title="Failed to load Kiro pool"
              message="Could not fetch Kiro credentials. Please try again."
              onRetry={refetchKiro}
            />
          ) : !kiroData || kiroData.entries.length === 0 ? (
            <EmptyState
              icon={MdCloud}
              title="No Kiro credentials"
              description="Add credentials via the dashboard or run the signup bot to get started."
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Auth Type</TableHead>
                    <TableHead>Has Token</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kiroVisibleEntries.map((entry) => (
                    <TableRow key={entry.idx}>
                      <TableCell className="font-medium">{entry.label}</TableCell>
                      <TableCell>{getStatusBadge(entry.status)}</TableCell>
                      <TableCell className="text-sm">{entry.auth}</TableCell>
                      <TableCell>
                        {entry.hasAccessToken ? (
                          <span className="text-emerald-600">✓</span>
                        ) : (
                          <span className="text-muted-foreground">✗</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MdMoreVert className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleStatusChange(String(entry.idx), 'active')}>
                              Set Active
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(String(entry.idx), 'cooldown')}>
                              Set Cooldown
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(String(entry.idx), 'dead')}>
                              Set Dead
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {renderPagination(kiroPageIndex, kiroTotalPages, setKiroPage)}
            </div>
          )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
