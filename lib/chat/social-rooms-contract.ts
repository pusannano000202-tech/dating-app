export const SOCIAL_CHAT_ROOM_KINDS = ['league_team', 'league_match', 'meetup', 'activity_room', 'study_room', 'mentoring'] as const
export type SocialChatRoomKind = typeof SOCIAL_CHAT_ROOM_KINDS[number]
export type SocialChatRoom = {kind: SocialChatRoomKind; id: string; title: string; affiliation: string; member_count: number; writable: boolean; updated_at: string; activity_key?:string|null; category?:string|null; course_key?:string|null; recruitment_mode?:'hosted'|'legacy'; sport?: 'lol' | 'futsal' | 'football'; challenge_id?: string; latest_message?: {id:string;body:string;created_at:string;is_me:boolean}|null; unread_count?:number}
export type SocialRoomsResponse = {owner_id: string; rooms: SocialChatRoom[]; has_more: boolean; next_cursor: string | null}
export const isChatObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
export const isChatUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
export const isSocialChatRoomKind = (v: unknown): v is SocialChatRoomKind => SOCIAL_CHAT_ROOM_KINDS.includes(v as SocialChatRoomKind)
export function isSocialRoomsCursor(v: unknown): v is string {
 if (typeof v !== 'string') return false
 const sections=v.split('|')
 if(sections.length!==1&&(sections.length!==3||!['0','1'].includes(sections[0])||!isChatTimestamp(sections[1])))return false
 const pieces = sections.at(-1)!.split(':')
 return pieces.length === 2 && isSocialChatRoomKind(pieces[0]) && isChatUuid(pieces[1])
}
export const isChatTimestamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
export const isChatText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && Array.from(v).length <= max
export function parseSocialRoomsResponse(value: unknown, expectedOwner?: string): SocialRoomsResponse | null {
 if (!isChatObject(value) || !isChatUuid(value.owner_id) || (expectedOwner !== undefined && value.owner_id !== expectedOwner) || !Array.isArray(value.rooms) || value.rooms.length > 50 || typeof value.has_more !== 'boolean' || !(value.next_cursor === null || isSocialRoomsCursor(value.next_cursor)) || value.has_more !== (value.next_cursor !== null)) return null
 const keys = new Set<string>()
 for (const room of value.rooms) {
  if (!isChatObject(room) || !isSocialChatRoomKind(room.kind) || !isChatUuid(room.id) || !isChatText(room.title, 200) || !isChatText(room.affiliation, 250) || !Number.isSafeInteger(room.member_count) || (room.member_count as number) < 1 || typeof room.writable !== 'boolean' || !isChatTimestamp(room.updated_at)) return null
  const leagueRoom = room.kind === 'league_team' || room.kind === 'league_match'
  for(const field of ['activity_key','category','course_key'])if(room[field]!==undefined&&room[field]!==null&&(!isChatText(room[field],120)||!/^[-a-zA-Z0-9_:]+$/.test(String(room[field]))))return null
  if(room.recruitment_mode!==undefined&&(room.kind!=='mentoring'||!['hosted','legacy'].includes(String(room.recruitment_mode))))return null
  if(room.unread_count!==undefined&&(!Number.isSafeInteger(room.unread_count)||(room.unread_count as number)<0))return null
  if(room.latest_message!==undefined&&room.latest_message!==null){const m=room.latest_message;if(!isChatObject(m)||!isChatUuid(m.id)||!isChatText(m.body,160)||!isChatTimestamp(m.created_at)||typeof m.is_me!=='boolean')return null}
  if (room.sport !== undefined && (!leagueRoom || !['lol', 'futsal', 'football'].includes(String(room.sport)))) return null
  if (room.challenge_id !== undefined && (!leagueRoom || !isChatUuid(room.challenge_id) || (room.kind === 'league_match' && room.challenge_id !== room.id))) return null
  const key = `${room.kind}:${room.id}`
  if (keys.has(key)) return null
  keys.add(key)
 }
 if (value.has_more && (value.rooms.length !== 50 || (value.next_cursor as string).split('|').at(-1) !== `${value.rooms.at(-1).kind}:${value.rooms.at(-1).id}`)) return null
 return value as SocialRoomsResponse
}
