export interface Job {
  id: string
  status: 'pending' | 'running' | 'done' | 'error' | 'aborting' | 'aborted'
  mode: number
  headless: boolean
  limit: number
  concurrency: number
  progress: { done: number; total: number; success: number; fail: number }
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface JobDetail extends Job {
  recentLogs: string[]
}

export interface JobsResponse {
  jobs: Job[]
}
