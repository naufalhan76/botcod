export interface Job {
  id: string
  status: 'running' | 'completed' | 'error' | 'aborting' | 'aborted'
  mode: number
  headless: boolean
  browserEngine: 'camoufox' | 'cloakbrowser'
  concurrency: number
  total: number
  processed: number
  success: number
  failed: number
  keysObtained: number
  kiroCredsObtained: number
  error: string | null
  startedAt: number
  finishedAt: number | null
}

export interface JobLog {
  ts: number
  email: string | null
  line: string
}

export interface JobDetail extends Job {
  recentLogs: JobLog[]
}

export interface JobsResponse {
  jobs: Job[]
}
