export interface Inbox {
  id: string
  email: string
  host: string
  port: number
  tls: boolean
}

export interface Domain {
  domain: string
  inboxId: string
}

export interface TempAddress {
  address: string
  domain: string
  prefix: string
  label?: string
  createdAt: string
}

export interface TempMessage {
  id: string
  from: string
  to: string
  subject: string
  date: string
  text?: string
  html?: string
}

export interface TempMailOverview {
  summary: { inboxes: number; domains: number; addresses: number }
  inboxes: Inbox[]
  domains: Domain[]
  addresses: TempAddress[]
}
