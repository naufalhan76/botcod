'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { MdPlayArrow, MdStop, MdDelete } from 'react-icons/md'

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
import { useBotLogs } from '@/hooks/use-bot-logs'
import { useAbortJob, useCreateJob, useJobs } from '@/hooks/use-jobs'
import { showError, showSuccess } from '@/lib/toast'
import type { Job } from '@/types'

const BOT_MODES = [
  { value: '1', label: 'Unlucid + CodeBuddy + Kiro' },
  { value: '2', label: 'CodeBuddy + Kiro' },
  { value: '3', label: 'CodeBuddy only' },
  { value: '4', label: 'Kiro only' },
]

const RUNNING_STATUSES = new Set<Job['status']>(['running', 'aborting'])

function getStatusVariant(status: Job['status']) {
  if (status === 'completed') return 'default' as const
  if (status === 'error' || status === 'aborted') return 'destructive' as const
  if (status === 'running') return 'secondary' as const
  return 'outline' as const
}

function getLogLevelClass(level: string) {
  switch (level) {
    case 'warn':
      return 'text-amber-300'
    case 'error':
      return 'text-rose-300'
    case 'success':
      return 'text-emerald-300'
    default:
      return 'text-slate-200'
  }
}

export default function RunBotPage() {
  const { data, isLoading } = useJobs()
  const createJob = useCreateJob()
  const abortJob = useAbortJob()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [mode, setMode] = useState('1')
  const [headless, setHeadless] = useState(true)
  const [limit, setLimit] = useState(0)
  const [concurrency, setConcurrency] = useState(1)

  const jobs = data?.jobs ?? []
  const runningJobs = jobs.filter((job) => RUNNING_STATUSES.has(job.status))
  const activeLogJob = runningJobs.find((job) => job.status === 'running') ?? runningJobs[0] ?? null

  const handleStart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await createJob.mutateAsync({
        mode: Number(mode),
        headless,
        limit: Math.max(0, Number(limit) || 0),
        concurrency: Math.min(5, Math.max(1, Number(concurrency) || 1)),
      })
      showSuccess('Bot job started')
      setDialogOpen(false)
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to start bot job')
    }
  }

  const handleAbort = async (jobId: string) => {
    try {
      await abortJob.mutateAsync(jobId)
      showSuccess('Abort requested')
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to abort job')
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Run Bot</h1>
        <p className="mt-2 text-muted-foreground">Start and monitor signup bot sessions.</p>
      </div>

      <Card>
        <CardHeader className="gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <CardTitle>Job control</CardTitle>
            <CardDescription>Launch bot batches and stop active sessions without blocking the dashboard.</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <MdPlayArrow /> Start Bot
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleStart} className="space-y-5">
                <DialogHeader>
                  <DialogTitle>Start bot job</DialogTitle>
                  <DialogDescription>Choose the signup pipeline and runtime limits.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <label className="grid gap-2 text-sm font-medium">
                    Mode
                    <Select value={mode} onValueChange={setMode}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BOT_MODES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.value}. {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium">
                    <span>Headless browser</span>
                    <input
                      type="checkbox"
                      checked={headless}
                      onChange={(event) => setHeadless(event.target.checked)}
                      className="size-4 accent-primary"
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium">
                      Limit <span className="text-xs font-normal text-muted-foreground">0 = all accounts</span>
                      <Input type="number" min={0} value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium">
                      Concurrency <span className="text-xs font-normal text-muted-foreground">1-5 sessions</span>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={concurrency}
                        onChange={(event) => setConcurrency(Number(event.target.value))}
                      />
                    </label>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createJob.isPending}>
                    {createJob.isPending ? 'Starting...' : 'Start'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading jobs...</p>
          ) : jobs.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No bot jobs yet.</p>
          ) : (
            <div className="grid gap-3">
              {jobs.map((job) => (
                <div key={job.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{job.id}</span>
                      <Badge variant={getStatusVariant(job.status)}>{job.status}</Badge>
                      <span className="text-xs text-muted-foreground">Mode {job.mode}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{job.processed}/{job.total} done</span>
                      <span>{job.success} success</span>
                      <span>{job.failed} failed</span>
                      <span>{job.concurrency} concurrent</span>
                    </div>
                  </div>
                  {RUNNING_STATUSES.has(job.status) && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleAbort(job.id)}
                      disabled={abortJob.isPending || job.status === 'aborting'}
                    >
                      <MdStop /> Abort
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <BotLogViewer jobId={activeLogJob?.id ?? null} />
    </div>
  )
}

function BotLogViewer({ jobId }: { jobId: string | null }) {
  const { logs, isConnected, error, clearLogs } = useBotLogs(jobId)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [isPinned, setIsPinned] = useState(true)

  const connectionLabel = useMemo(() => {
    if (!jobId) return 'No running job'
    if (error) return 'Log stream error'
    return isConnected ? 'Connected' : 'Connecting'
  }, [error, isConnected, jobId])

  useEffect(() => {
    if (!isPinned) return
    const viewport = viewportRef.current
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [logs, isPinned])

  const handleScroll = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    setIsPinned(distanceFromBottom < 32)
  }

  const scrollToBottom = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollTop = viewport.scrollHeight
    setIsPinned(true)
  }

  return (
    <Card className="min-h-0 flex-1 overflow-hidden">
      <CardHeader className="gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <CardTitle>Log viewer</CardTitle>
          <CardDescription>{jobId ? `Streaming ${jobId}` : 'Start a job to stream bot logs.'}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={error ? 'destructive' : isConnected ? 'default' : 'outline'}>{connectionLabel}</Badge>
          {!isPinned && (
            <Button variant="secondary" size="sm" onClick={scrollToBottom}>
              Scroll to bottom
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={clearLogs} disabled={logs.length === 0}>
            <MdDelete /> Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <div
          ref={viewportRef}
          onScroll={handleScroll}
          className="max-h-[34rem] min-h-[22rem] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-6 shadow-inner"
        >
          {logs.length === 0 ? (
            <p className="text-slate-500">{jobId ? 'Waiting for log events...' : 'No active stream.'}</p>
          ) : (
            logs.map((log, index) => (
              <div key={`${log.timestamp}-${index}`} className={getLogLevelClass(log.level)}>
                <span className="text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>{' '}
                <span className="uppercase text-slate-400">{log.level}</span>{' '}
                {log.worker ? <span className="text-sky-300">[W{log.worker}] </span> : null}
                <span className="whitespace-pre-wrap break-words">{log.message}</span>
              </div>
            ))
          )}
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
