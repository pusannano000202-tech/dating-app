export function isSafeLocalRedirect(path: string | null | undefined): path is string {
  return Boolean(path && path.startsWith('/') && !path.startsWith('//'))
}

export function getPostLoginDestination({
  requestedRedirect,
}: {
  requestedRedirect?: string | null
}): string {
  if (isSafeLocalRedirect(requestedRedirect)) {
    return requestedRedirect
  }
  return '/profile/basic'
}
