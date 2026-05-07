export interface AccountEntry {
  idx: number
  email: string
  has_password: boolean
}

export interface AccountsResponse {
  entries: AccountEntry[]
}
