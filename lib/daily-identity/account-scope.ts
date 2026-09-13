export type IdentityAccountLease = { account: string; generation: number }

/** Invalidates pending private reveals, including A -> B -> A authentication changes. */
export class DailyIdentityAccountScope {
  private account: string | null | undefined
  private generation = 0

  bind(account: string | null): boolean {
    if (account === this.account) return false
    this.account = account
    this.generation += 1
    return true
  }

  capture(): IdentityAccountLease | null {
    return this.account ? { account: this.account, generation: this.generation } : null
  }

  isCurrent(lease: IdentityAccountLease): boolean {
    return this.account === lease.account && this.generation === lease.generation
  }
}
