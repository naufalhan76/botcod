'use client'

import { useState } from 'react'
import { usePool, useKiroPool, useSetPoolStatus } from '@/hooks/use-pool'
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
import { MdRefresh, MdMoreVert, MdCloud } from 'react-icons/md'

export default function ProviderPoolPage() {
  const { data: poolData, isLoading: poolLoading, isError: poolError, refetch: refetchPool } = usePool()
  const { data: kiroData, isLoading: kiroLoading, isError: kiroError, refetch: refetchKiro } = useKiroPool()
  const setStatus = useSetPoolStatus()
  const qc = useQueryClient()
  const [reloading, setReloading] = useState(false)

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
            <Button
              variant="outline"
              size="sm"
              onClick={handleReload}
              disabled={reloading}
            >
              <MdRefresh className={`mr-2 h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
              Reload
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
                  {poolData.entries.map((entry) => (
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kiro Pool */}
      <Card>
        <CardHeader>
          <CardTitle>Kiro Pool</CardTitle>
          <CardDescription>
            {kiroData && (
              <span className="text-sm">
                {kiroData.summary.active} active, {kiroData.summary.cooldown} cooldown, {kiroData.summary.dead} dead
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                  {kiroData.entries.map((entry) => (
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
