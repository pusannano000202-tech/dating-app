import { normalizeTonightDepositReturnPath } from '../../payments/tonight-deposit'

export function buildTonightPaymentReturnUrl(params: {
  configuredOrigin: string
  requestUrl: string
  status: 'paid' | 'failed' | 'cancelled'
  reason?: string
}): string {
  let origin: string
  try {
    const parsed = new URL(params.configuredOrigin)
    if (
      !params.configuredOrigin
      || parsed.origin !== params.configuredOrigin
      || parsed.username
      || parsed.password
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash
      || !['http:', 'https:'].includes(parsed.protocol)
    ) throw new TypeError('app_origin_required')
    origin = parsed.origin
  } catch {
    throw new TypeError('app_origin_required')
  }

  const request = new URL(params.requestUrl)
  const returnPath = normalizeTonightDepositReturnPath(request.searchParams.get('return_path'))
  const target = new URL(returnPath, origin)
  target.searchParams.set('payment', params.status)
  if (params.reason) target.searchParams.set('reason', params.reason)
  return target.toString()
}
