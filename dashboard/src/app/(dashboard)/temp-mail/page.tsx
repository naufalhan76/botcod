'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { MdMail, MdRefresh } from 'react-icons/md'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useGenerateAddress, useTempMailMessages, useTempMailOverview } from '@/hooks/use-tempmail'
import { showError, showSuccess } from '@/lib/toast'
import type { TempAddress, TempMessage } from '@/types'

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function safeMessageText(message: TempMessage) {
  if (message.text?.trim()) return message.text.trim()
  if (!message.html) return 'No plain text body available.'

  return message.html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim() || 'No plain text body available.'
}

export default function TempMailPage() {
  const overview = useTempMailOverview()
  const generateAddress = useGenerateAddress()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [domain, setDomain] = useState('')
  const [prefix, setPrefix] = useState('')
  const [label, setLabel] = useState('')
  const [selectedAddress, setSelectedAddress] = useState('')
  const [managementOpen, setManagementOpen] = useState(false)

  const data = overview.data
  const addresses = data?.addresses ?? []
  const domains = data?.domains ?? []
  const inboxes = data?.inboxes ?? []

  useEffect(() => {
    if (!domain && domains[0]?.domain) setDomain(domains[0].domain)
  }, [domain, domains])

  useEffect(() => {
    if (selectedAddress && !addresses.some((item) => item.address === selectedAddress)) {
      setSelectedAddress('')
    }
  }, [addresses, selectedAddress])

  const selectedAddressMeta = useMemo(
    () => addresses.find((item) => item.address === selectedAddress) ?? null,
    [addresses, selectedAddress]
  )

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!domain) {
      showError('Configure a temp mail domain before generating an address')
      return
    }

    try {
      const created = await generateAddress.mutateAsync({
        domain,
        prefix: prefix.trim() || undefined,
        label: label.trim() || undefined,
      })
      showSuccess('Temp address generated')
      setDialogOpen(false)
      setPrefix('')
      setLabel('')
      if (typeof created === 'object' && created && 'address' in created) {
        setSelectedAddress(String(created.address))
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to generate address')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Temp Mail</h1>
          <p className="mt-2 text-muted-foreground">Manage temporary email addresses and inboxes.</p>
        </div>
        <Button variant="outline" onClick={() => overview.refetch()} disabled={overview.isFetching}>
          <MdRefresh /> {overview.isFetching ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader className="gap-4 sm:grid-cols-[1fr_auto] lg:grid-cols-1 xl:grid-cols-[1fr_auto]">
            <div>
              <CardTitle>Addresses</CardTitle>
              <CardDescription>{addresses.length} generated temp addresses</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <MdMail /> Generate Address
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleGenerate} className="space-y-5">
                  <DialogHeader>
                    <DialogTitle>Generate temp address</DialogTitle>
                    <DialogDescription>Create a routed address for one configured domain.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <label className="grid gap-2 text-sm font-medium">
                      Domain
                      <Select value={domain} onValueChange={setDomain} disabled={domains.length === 0}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select domain" />
                        </SelectTrigger>
                        <SelectContent>
                          {domains.map((item) => (
                            <SelectItem key={item.domain} value={item.domain}>
                              {item.domain}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium">
                      Prefix <span className="text-xs font-normal text-muted-foreground">Optional</span>
                      <Input value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="signup" />
                    </label>
                    <label className="grid gap-2 text-sm font-medium">
                      Label <span className="text-xs font-normal text-muted-foreground">Optional</span>
                      <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="CodeBuddy batch 1" />
                    </label>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={generateAddress.isPending || domains.length === 0}>
                      {generateAddress.isPending ? 'Generating...' : 'Generate'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {overview.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading addresses...</p>
            ) : addresses.length === 0 ? (
              <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No temp addresses yet.</p>
            ) : (
              <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
                {addresses.map((item) => (
                  <AddressButton
                    key={item.address}
                    address={item}
                    selected={selectedAddress === item.address}
                    onSelect={() => setSelectedAddress(item.address)}
                  />
                ))}
              </div>
            )}

            <div className="mt-6 rounded-lg border">
              <button
                type="button"
                onClick={() => setManagementOpen((open) => !open)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
              >
                <span>Inbox management</span>
                <span className="text-muted-foreground">{managementOpen ? 'Hide' : 'Show'}</span>
              </button>
              {managementOpen && (
                <div className="space-y-5 border-t px-4 py-4">
                  <div>
                    <h3 className="text-sm font-semibold">Configured inboxes</h3>
                    <div className="mt-2 space-y-2">
                      {inboxes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No inboxes configured.</p>
                      ) : (
                        inboxes.map((inbox) => (
                          <div key={inbox.id} className="rounded-md bg-muted/50 p-3 text-sm">
                            <div className="font-medium">{inbox.email}</div>
                            <div className="text-xs text-muted-foreground">
                              {inbox.host}:{inbox.port} {inbox.tls ? 'TLS' : 'plain'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Configured domains</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {domains.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No domains configured.</p>
                      ) : (
                        domains.map((item) => (
                          <Badge key={item.domain} variant="outline">
                            {item.domain}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <MessagesPanel address={selectedAddressMeta} />
      </div>
    </div>
  )
}

function AddressButton({
  address,
  selected,
  onSelect,
}: {
  address: TempAddress
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-3 text-left transition hover:bg-accent ${selected ? 'border-primary bg-primary/5' : ''}`}
    >
      <div className="truncate font-mono text-sm font-medium">{address.address}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{address.domain}</Badge>
        {address.label ? <span className="truncate">{address.label}</span> : null}
      </div>
    </button>
  )
}

function MessagesPanel({ address }: { address: TempAddress | null }) {
  const messagesQuery = useTempMailMessages(address?.address ?? '')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const messages = messagesQuery.data?.messages ?? []

  useEffect(() => {
    setExpandedId(null)
  }, [address?.address])

  if (!address) {
    return (
      <Card className="min-h-[32rem]">
        <CardContent className="flex flex-1 items-center justify-center p-10 text-center">
          <div>
            <MdMail className="mx-auto mb-4 size-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Select an address</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">Choose a temp address on the left to load its inbox messages.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="gap-4 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <CardTitle className="truncate font-mono text-base">{address.address}</CardTitle>
          <CardDescription>{messages.length} messages for {address.domain}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => messagesQuery.refetch()} disabled={messagesQuery.isFetching}>
          <MdRefresh /> {messagesQuery.isFetching ? 'Refreshing...' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent>
        {messagesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No messages for this address yet.</p>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => {
              const expanded = expandedId === message.id
              return (
                <article key={message.id} className="overflow-hidden rounded-lg border">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : message.id)}
                    className="grid w-full gap-2 p-4 text-left hover:bg-accent md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-center"
                  >
                    <div className="truncate text-sm font-medium">{message.from || 'Unknown sender'}</div>
                    <div className="truncate text-sm">{message.subject || '(no subject)'}</div>
                    <time className="text-xs text-muted-foreground">{formatDate(message.date)}</time>
                  </button>
                  {expanded && (
                    <div className="border-t bg-muted/30 p-4">
                      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">
                        {safeMessageText(message)}
                      </pre>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
        {messagesQuery.error && (
          <p className="mt-3 text-sm text-destructive">
            {messagesQuery.error instanceof Error ? messagesQuery.error.message : 'Failed to load messages'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
