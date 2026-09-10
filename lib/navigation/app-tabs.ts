/** Navigation belongs to a product section, not always its historical URL prefix. */
export function isAppTabActive(pathname: string, href: string): boolean {
  if (pathname === '/community/department' || pathname.startsWith('/community/department/')) return href === '/meetups'
  if (href === '/') return pathname === '/'
  if (href === '/match') return pathname === '/match' || pathname.startsWith('/match/') || pathname === '/tonight' || pathname.startsWith('/tonight/') || pathname === '/calendar'
  if (href === '/meetups') return pathname === '/meetups' || pathname.startsWith('/meetups/')
  if (href === '/community') return pathname === '/community' || pathname.startsWith('/community/')
  if (href === '/profile/edit') return pathname === '/profile/edit' || pathname.startsWith('/profile/')
  return pathname === href || pathname.startsWith(`${href}/`)
}
