export function integratedUiEnvironment(input, mode) {
  if (!['--offline-ui', '--live-local'].includes(mode)) throw new Error('Choose --offline-ui or --live-local')
  const env = {
    ...input,
    NEXT_PUBLIC_APP_ORIGIN: 'http://localhost:3010',
    NEXT_DIST_DIR: mode === '--offline-ui' ? '.next-integrated-qa' : '.next-integrated-live',
    QUANTUM_LOCAL_RUNTIME_MODE: mode === '--offline-ui' ? 'offline-ui' : 'live-local',
    NEXT_PUBLIC_DEV_AUTH_BYPASS: 'false',
    NEXT_PUBLIC_COMMUNITY_ENABLED: 'true',
    TONIGHT_AUTOMATION_ENABLED: 'false',
    TONIGHT_CARD_PAYMENTS_ENABLED: 'false',
  }
  if (mode === '--offline-ui') {
    for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'TOSS_SECRET_KEY', 'NEXT_PUBLIC_TOSS_CLIENT_KEY', 'PHONE_VERIFICATION_DIGEST_SECRET', 'PROFILE_ALIAS_SIGNING_SECRET']) env[key] = ''
    env.CONTINUATION_LOCAL_PAYMENT_SIMULATOR_ENABLED = 'false'
    return env
  }
  if (input.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:56421') throw new Error('Only the isolated integrated DB port 56421 is accepted')
  if (!(input.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || input.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    || !(input.SUPABASE_SECRET_KEY || input.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('Load only the isolated local Auth keys into the process environment')
  if (!input.PHONE_VERIFICATION_DIGEST_SECRET || !input.PROFILE_ALIAS_SIGNING_SECRET || !/^\d+$/.test(input.SUPABASE_PHONE_OTP_TTL_SECONDS || '')) throw new Error('Local phone TTL and private digest/alias secrets are required')
  // Local role UAT is never permission to charge a provider.
  env.TOSS_SECRET_KEY = ''
  env.NEXT_PUBLIC_TOSS_CLIENT_KEY = ''
  return env
}

export function integratedUiLaunchInfo(env, mode, authPreflight) {
  return {
    origin: env.NEXT_PUBLIC_APP_ORIGIN,
    entryUrl: mode === '--offline-ui' ? '/community' : '/login',
    mode,
    authBypass: false,
    databaseStartedByLauncher: false,
    realPayments: false,
    ...(mode === '--live-local' ? { authPreflight } : {}),
  }
}
