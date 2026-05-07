'use client'

import { useState } from 'react'
import { useAccounts, useAddAccounts, useDeleteAccount } from '@/hooks/use-accounts'
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
import { MdAdd, MdDelete, MdPeople } from 'react-icons/md'

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
