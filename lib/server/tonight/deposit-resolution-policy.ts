export interface TonightDepositResolutionPolicyEnv {
  readonly [key: string]: string | undefined
  TONIGHT_NO_SHOW_FORFEIT_POLICY_APPROVED?: string
}

/**
 * This is intentionally exact and fail-closed. Legal/terms approval is an
 * operator fact, not something the application may infer from another flag.
 */
export function isTonightNoShowForfeitPolicyApproved(
  env: TonightDepositResolutionPolicyEnv = process.env,
): boolean {
  return env.TONIGHT_NO_SHOW_FORFEIT_POLICY_APPROVED === 'true'
}
