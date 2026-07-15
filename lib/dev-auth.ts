export const DEV_AUTH_COOKIE = 'booting_dev_auth'

export interface DevAuthPolicyInput {
  nodeEnv?: string
  devAuthBypass?: string
  bootingDemoMode?: string
}

export interface DevAuthCookiePolicyInput extends DevAuthPolicyInput {
  pathname: string
}

function readDevAuthPolicyInput(): DevAuthPolicyInput {
  return {
    nodeEnv: process.env.NODE_ENV,
    devAuthBypass: process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS,
    bootingDemoMode: process.env.NEXT_PUBLIC_BOOTING_DEMO_MODE,
  }
}

function resolveDevAuthPolicyInput(input: DevAuthPolicyInput = {}): DevAuthPolicyInput {
  const current = readDevAuthPolicyInput()
  return {
    nodeEnv: input.nodeEnv ?? current.nodeEnv,
    devAuthBypass: input.devAuthBypass ?? current.devAuthBypass,
    bootingDemoMode: input.bootingDemoMode ?? current.bootingDemoMode,
  }
}

export function isDevAuthBypassEnabled(input: DevAuthPolicyInput = {}): boolean {
  const policy = resolveDevAuthPolicyInput(input)
  return policy.nodeEnv === 'development' && policy.devAuthBypass === 'true'
}

export function isExactDevPreviewPath(pathname: string): boolean {
  return pathname === '/dev/preview'
}

export function shouldIssueDevAuthCookie(input: DevAuthCookiePolicyInput): boolean {
  return isExactDevPreviewPath(input.pathname) && isDevAuthBypassEnabled(input)
}

export function getDevAuthCookieValue(): string {
  return '1'
}

