const MEETUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type MeetupShareData = { title: string; text: string; url: string }
export type MeetupShareResult = 'opened' | 'copied' | 'cancelled' | 'unsupported' | 'failed'
export type MeetupShareDevice = {
  share?: (data: MeetupShareData) => Promise<void>
  canShare?: (data: MeetupShareData) => boolean
  clipboard?: { writeText: (text: string) => Promise<void> }
}

// A local room must not be presented as a working room on an unrelated deployment.
// Use only the current public HTTPS origin; never rewrite a local room to an env URL.
export function getMeetupShareUrl(meetupId: string, currentOrigin: string): string | null {
  if (!MEETUP_ID.test(meetupId)) return null
  try {
    const origin = new URL(currentOrigin)
    const hostname = origin.hostname.toLowerCase().replace(/\.$/, '')
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') return null
    if (!hostname.includes('.') || /^[\d.]+$/.test(hostname) || hostname.includes(':')) return null
    if (/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(hostname)) return null
    if (['example.com', 'example.net', 'example.org'].some(host => hostname === host || hostname.endsWith('.' + host))) return null
    return new URL(`/meetups/${meetupId}`, origin.origin).toString()
  } catch { return null }
}

export function canShareMeetup(device: MeetupShareDevice, data: MeetupShareData): boolean {
  if (typeof device.share !== 'function') return false
  try { return !device.canShare || device.canShare(data) } catch { return false }
}

export async function shareMeetupWithDevice(device: MeetupShareDevice, data: MeetupShareData): Promise<MeetupShareResult> {
  if (!canShareMeetup(device, data)) return 'unsupported'
  try {
    // Called from the click handler, without a network request before the share call.
    await device.share!(data)
    return 'opened'
  } catch (error) {
    return error && typeof error === 'object' && 'name' in error && error.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}

export async function copyMeetupShareLink(device: MeetupShareDevice, url: string): Promise<MeetupShareResult> {
  if (!device.clipboard) return 'unsupported'
  try { await device.clipboard.writeText(url); return 'copied' } catch { return 'failed' }
}
