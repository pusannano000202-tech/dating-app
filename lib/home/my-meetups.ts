export type MyMeetup = {
  id: string
  kind: 'scheduled' | 'activity_room'
  title: string | null
  activity_key: string | null
  category?: string | null
  room_number: number | null
  member_count: number
  capacity: number
  scheduled_at: string | null
  place_name: string | null
  status: 'open' | 'full'
  schedule_status?: 'confirmed' | 'schedule_pending' | null
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
    if (row.kind === 'scheduled') {
      if (typeof row.title !== 'string' || !row.title.trim() || row.room_number !== null) return null
      if (row.schedule_status === 'schedule_pending') {
        if (row.scheduled_at !== null || row.place_name !== null) return null
      } else if ((row.schedule_status !== undefined && row.schedule_status !== 'confirmed') || row.scheduled_at === null) return null
    }
    if (row.kind === 'activity_room' && row.schedule_status !== undefined && row.schedule_status !== null) return null
    if (row.kind === 'activity_room' && (typeof row.activity_key !== 'string' || !/^[a-z0-9-]+$/.test(row.activity_key) || !Number.isInteger(row.room_number) || Number(row.room_number) < 1)) return null
  }
  if (new Set(value.items.map(row => row.kind + ':' + row.id)).size !== value.items.length) return null
  return value as MyMeetups
}
export function myMeetupHref(row: MyMeetup): string {
  if (!uuid.test(row.id) || !['scheduled', 'activity_room'].includes(row.kind)) return '/chat'
  return row.kind === 'activity_room' ? `/chat/rooms/activity_room/${row.id}` : `/chat/rooms/meetup/${row.id}`
}
export function myMeetupDetail(row: MyMeetup): string {
  if (row.kind === 'activity_room') return `${row.room_number}번 방 · 시간·장소는 채팅에서 확인`
  if (row.schedule_status === 'schedule_pending') return '시간·장소는 채팅에서 함께 정하기'
  return `${new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(row.scheduled_at!))} · ${row.place_name || '장소 확인'}`
}
