export type MyMeetup = {
  id: string
  kind: 'scheduled' | 'activity_room'
  title: string | null
  activity_key: string | null
  room_number: number | null
  member_count: number
  capacity: number
  scheduled_at: string | null
  place_name: string | null
  status: 'open' | 'full'
}
export type MyMeetups = { items: MyMeetup[]; has_more: boolean }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
export function parseMyMeetups(value: unknown): MyMeetups | null {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 100 || typeof value.has_more !== 'boolean') return null
  for (const row of value.items) {
    if (!record(row) || typeof row.id !== 'string' || !uuid.test(row.id)
      || !['scheduled', 'activity_room'].includes(String(row.kind)) || !['open', 'full'].includes(String(row.status))
      || !Number.isInteger(row.capacity) || Number(row.capacity) < 2 || Number(row.capacity) > 20
      || !Number.isInteger(row.member_count) || Number(row.member_count) < 1 || Number(row.member_count) > Number(row.capacity)
      || !(row.title === null || typeof row.title === 'string') || !(row.place_name === null || typeof row.place_name === 'string')
      || !(row.activity_key === null || typeof row.activity_key === 'string')
      || !(row.scheduled_at === null || typeof row.scheduled_at === 'string' && Number.isFinite(Date.parse(row.scheduled_at)))) return null
    if (row.kind === 'scheduled' && (typeof row.title !== 'string' || !row.title.trim() || row.scheduled_at === null || row.room_number !== null)) return null
    if (row.kind === 'activity_room' && (typeof row.activity_key !== 'string' || !/^[a-z0-9-]+$/.test(row.activity_key) || !Number.isInteger(row.room_number) || Number(row.room_number) < 1)) return null
  }
  if (new Set(value.items.map(row => row.kind + ':' + row.id)).size !== value.items.length) return null
  return value as MyMeetups
}
export function myMeetupHref(row: MyMeetup): string {
  return row.kind === 'activity_room' ? `/meetups/rooms/${row.id}` : `/meetups/${row.id}#meetup-chat`
}
