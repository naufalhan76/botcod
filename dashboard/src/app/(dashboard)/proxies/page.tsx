'use client'

import { useState } from 'react'
import { useProxies, useAddProxies, useDeleteProxy } from '@/hooks/use-proxies'
import { TableSkeleton } from '@/components/skeletons'
import { ErrorState } from '@/components/error-state'
import { EmptyState } from '@/components/empty-state'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { showSuccess, showError } from '@/lib/toast'
import { MdAdd, MdDelete, MdRouter } from 'react-icons/md'

export default function ProxiesPage() {
  const { data, isLoading, isError, refetch } = useProxies()
  const addProxies = useAddProxies()
  const deleteProxy = useDeleteProxy()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [proxiesText, setProxiesText] = useState('')
  const [replaceAll, setReplaceAll] = useState(false)
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null)

  const maskProxy = (proxy: string) => {
    try {
      const url = new URL(proxy)
      if (url.username && url.password) {
        return `${url.protocol}//***:***@${url.host}`
      }
      return proxy
    } catch {
      return proxy
    }
  }

  const handleAddProxies = async () => {
    const lines = proxiesText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (lines.length === 0) {
      showError('Please enter at least one proxy')
      return
    }

    try {
      await addProxies.mutateAsync({ lines, replace: replaceAll })
      showSuccess(replaceAll ? 'Proxies replaced' : `Added ${lines.length} proxy(ies)`)
      setProxiesText('')
      setReplaceAll(false)
      setAddDialogOpen(false)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add proxies')
    }
  }

  const handleDeleteClick = (idx: number) => {
    setDeleteIdx(idx)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (deleteIdx === null) return

    try {
      await deleteProxy.mutateAsync(deleteIdx)
      showSuccess('Proxy deleted')
      setDeleteDialogOpen(false)
      setDeleteIdx(null)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete proxy')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Proxies</h1>
          <p className="text-muted-foreground mt-2">Manage proxy list for bot operations.</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <MdAdd className="mr-2 h-4 w-4" />
              Add Proxies
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Proxies</DialogTitle>
              <DialogDescription>
                Enter proxies one per line (format: http://user:pass@host:port)
              </DialogDescription>
            </DialogHeader>
            <Textarea
              placeholder="http://user:pass@1.2.3.4:8080&#10;http://user:pass@5.6.7.8:8080"
              value={proxiesText}
              onChange={(e) => setProxiesText(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
            <div className="flex items-center space-x-2">
              <Checkbox
                id="replace"
                checked={replaceAll}
                onChange={(e) => setReplaceAll(e.target.checked)}
              />
              <Label htmlFor="replace" className="text-sm font-normal cursor-pointer">
                Replace all existing proxies
              </Label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddProxies} disabled={addProxies.isPending}>
                {addProxies.isPending ? 'Adding...' : replaceAll ? 'Replace All' : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Proxy List</CardTitle>
          <CardDescription>
            {data && <span>{data.entries.length} proxy(ies) configured</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : isError ? (
            <ErrorState
              title="Failed to load proxies"
              message="Could not fetch proxy data. Please try again."
              onRetry={refetch}
            />
          ) : !data || data.entries.length === 0 ? (
            <EmptyState
              icon={MdRouter}
              title="No proxies configured"
              description="Add proxies to enable bot operations with proxy rotation."
              actionLabel="Add Proxies"
              onAction={() => setAddDialogOpen(true)}
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">#</TableHead>
                    <TableHead>Proxy URL</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.entries.map((entry) => (
                    <TableRow key={entry.idx}>
                      <TableCell className="font-medium">{entry.idx}</TableCell>
                      <TableCell className="font-mono text-sm">{maskProxy(entry.proxy)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(entry.idx)}
                        >
                          <MdDelete className="h-4 w-4 text-rose-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Proxy</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this proxy? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteProxy.isPending}
            >
              {deleteProxy.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
