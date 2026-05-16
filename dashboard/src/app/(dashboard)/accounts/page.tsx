'use client'

import { useState } from 'react'
import { useAccounts, useAddAccounts, useDeleteAccount } from '@/hooks/use-accounts'
import { useKiroTokens, useDeleteKiroToken, type KiroTokenEntry } from '@/hooks/use-kiro-tokens'
import { TableSkeleton } from '@/components/skeletons'
import { ErrorState } from '@/components/error-state'
import { EmptyState } from '@/components/empty-state'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
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
import { showSuccess, showError } from '@/lib/toast'
import { MdAdd, MdContentCopy, MdDelete, MdPeople, MdVpnKey } from 'react-icons/md'

function truncateToken(token: string, head = 12, tail = 6) {
  if (!token) return ''
  if (token.length <= head + tail + 3) return token
  return `${token.slice(0, head)}…${token.slice(-tail)}`
}

function formatTimestamp(ms: number | null) {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return '—'
  }
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
  return false
}

export default function AccountsPage() {
  const { data, isLoading, isError, refetch } = useAccounts()
  const addAccounts = useAddAccounts()
  const deleteAccount = useDeleteAccount()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [accountsText, setAccountsText] = useState('')
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null)

  const handleAddAccounts = async () => {
    const lines = accountsText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (lines.length === 0) {
      showError('Please enter at least one account')
      return
    }

    try {
      await addAccounts.mutateAsync({ lines, replace: false })
      showSuccess(`Added ${lines.length} account(s)`)
      setAccountsText('')
      setAddDialogOpen(false)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add accounts')
    }
  }

  const handleDeleteClick = (idx: number) => {
    setDeleteIdx(idx)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (deleteIdx === null) return

    try {
      await deleteAccount.mutateAsync(deleteIdx)
      showSuccess('Account deleted')
      setDeleteDialogOpen(false)
      setDeleteIdx(null)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete account')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <p className="text-muted-foreground mt-2">Manage Google accounts for bot signup.</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <MdAdd className="mr-2 h-4 w-4" />
              Add Accounts
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Accounts</DialogTitle>
              <DialogDescription>
                Enter accounts one per line in format: email:password
              </DialogDescription>
            </DialogHeader>
            <Textarea
              placeholder="user1@gmail.com:password1&#10;user2@gmail.com:password2"
              value={accountsText}
              onChange={(e) => setAccountsText(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddAccounts} disabled={addAccounts.isPending}>
                {addAccounts.isPending ? 'Adding...' : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account List</CardTitle>
          <CardDescription>
            {data && <span>{data.entries.length} account(s) configured</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : isError ? (
            <ErrorState
              title="Failed to load accounts"
              message="Could not fetch account data. Please try again."
              onRetry={refetch}
            />
          ) : !data || data.entries.length === 0 ? (
            <EmptyState
              icon={MdPeople}
              title="No accounts configured"
              description="Add accounts to get started with bot signup."
              actionLabel="Add Accounts"
              onAction={() => setAddDialogOpen(true)}
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">#</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="w-[150px]">Has Password</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.entries.map((entry) => (
                    <TableRow key={entry.idx}>
                      <TableCell className="font-medium">{entry.idx}</TableCell>
                      <TableCell>{entry.email}</TableCell>
                      <TableCell>
                        {entry.has_password ? (
                          <span className="text-emerald-600">✓</span>
                        ) : (
                          <span className="text-muted-foreground">✗</span>
                        )}
                      </TableCell>
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

      <KiroTokensSection />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this account? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteAccount.isPending}
            >
              {deleteAccount.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KiroTokensSection() {
  const { data, isLoading, isError, refetch } = useKiroTokens()
  const deleteToken = useDeleteKiroToken()
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const tokens = data?.tokens ?? []

  const handleCopy = async (entry: KiroTokenEntry) => {
    const ok = await copyToClipboard(entry.refreshToken)
    if (ok) {
      showSuccess(`Copied refresh token for ${entry.email}`)
    } else {
      showError('Failed to copy to clipboard')
    }
  }

  const handleDelete = async (email: string) => {
    try {
      await deleteToken.mutateAsync(email)
      showSuccess(`Removed token for ${email}`)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove token')
    }
  }

  const toggleReveal = (email: string) => {
    setRevealed((prev) => ({ ...prev, [email]: !prev[email] }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MdVpnKey className="h-5 w-5 text-amber-500" />
          Kiro refresh tokens
        </CardTitle>
        <CardDescription>
          Captured during Kiro signup (auto or manual). Click a token to copy or reveal.
          {tokens.length > 0 && <span> {tokens.length} stored.</span>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TableSkeleton rows={3} />
        ) : isError ? (
          <ErrorState
            title="Failed to load Kiro tokens"
            message="Could not fetch kiro_tokens.json. Please try again."
            onRetry={refetch}
          />
        ) : tokens.length === 0 ? (
          <EmptyState
            icon={MdVpnKey}
            title="No Kiro tokens captured yet"
            description="Run a Kiro signup (mode 4/12/14/15). On success, the refresh token is stored here."
          />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Refresh token</TableHead>
                  <TableHead className="w-[180px]">Captured</TableHead>
                  <TableHead className="w-[160px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((entry) => {
                  const isRevealed = !!revealed[entry.email]
                  return (
                    <TableRow key={entry.email}>
                      <TableCell className="font-medium">{entry.email}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleReveal(entry.email)}
                          className="font-mono text-xs break-all text-left hover:underline"
                          title={isRevealed ? 'Click to hide' : 'Click to reveal full token'}
                        >
                          {isRevealed ? entry.refreshToken : truncateToken(entry.refreshToken)}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTimestamp(entry.capturedAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(entry)}
                            title="Copy refresh token"
                          >
                            <MdContentCopy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(entry.email)}
                            disabled={deleteToken.isPending}
                            title="Remove token"
                          >
                            <MdDelete className="h-4 w-4 text-rose-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
