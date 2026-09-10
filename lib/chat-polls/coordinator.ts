export type ChatPollScopeToken = number

type ReadToken = { scope: ChatPollScopeToken; request: number }
type MutationToken = { scope: ChatPollScopeToken; request: number; viewerBinding: string }

export class ChatPollRequestCoordinator {
  private scope = 0
  private request = 0
  private viewerBinding: string | null = null
  private busyRequest: number | null = null

  enterScope(): ChatPollScopeToken {
    this.scope += 1
    this.request += 1
    this.viewerBinding = null
    this.busyRequest = null
    return this.scope
  }

  leaveScope(scope: ChatPollScopeToken): void {
    if (scope !== this.scope) return
    this.scope += 1
    this.request += 1
    this.viewerBinding = null
    this.busyRequest = null
  }

  beginRead(scope: ChatPollScopeToken): ReadToken | null {
    if (scope !== this.scope) return null
    this.request += 1
    return { scope, request: this.request }
  }

  isReadCurrent(token: ReadToken): boolean {
    return token.scope === this.scope && token.request === this.request
  }

  acceptRead(token: ReadToken, viewerBinding: string): { accepted: boolean; viewerChanged: boolean } {
    if (token.scope !== this.scope || token.request !== this.request) {
      return { accepted: false, viewerChanged: false }
    }
    const viewerChanged = this.viewerBinding !== null && this.viewerBinding !== viewerBinding
    this.viewerBinding = viewerBinding
    return { accepted: true, viewerChanged }
  }

  revokeRead(token: ReadToken): boolean {
    if (token.scope !== this.scope || token.request !== this.request) return false
    this.request += 1
    this.viewerBinding = null
    this.busyRequest = null
    return true
  }

  beginMutation(scope: ChatPollScopeToken): MutationToken | null {
    if (scope !== this.scope || this.busyRequest !== null || this.viewerBinding === null) return null
    this.request += 1
    this.busyRequest = this.request
    return { scope, request: this.request, viewerBinding: this.viewerBinding }
  }

  currentViewerBinding(): string | null {
    return this.viewerBinding
  }

  acceptMutation(token: MutationToken, viewerBinding: string): { accepted: boolean; viewerChanged: boolean } {
    if (token.scope !== this.scope || token.request !== this.request || token.viewerBinding !== this.viewerBinding) {
      return { accepted: false, viewerChanged: false }
    }
    const viewerChanged = token.viewerBinding !== viewerBinding
    return { accepted: !viewerChanged, viewerChanged }
  }

  revokeMutation(token: MutationToken): boolean {
    if (token.scope !== this.scope || token.request !== this.request || this.busyRequest !== token.request) return false
    this.request += 1
    this.viewerBinding = null
    this.busyRequest = null
    return true
  }

  endMutation(token: MutationToken): boolean {
    if (this.busyRequest !== token.request) return false
    this.busyRequest = null
    return token.scope === this.scope
  }

  matchesViewer(scope: ChatPollScopeToken, viewerBinding: string): boolean {
    return scope === this.scope && viewerBinding === this.viewerBinding
  }
}
