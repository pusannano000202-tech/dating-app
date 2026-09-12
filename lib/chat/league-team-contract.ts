import {isChatObject, isChatTimestamp, isChatText, isChatUuid} from './social-rooms-contract'

export type LeagueTeamChatMessage = {id: string; body: string; alias: string; is_me: boolean; created_at: string}
export type LeagueTeamChat = {team_id: string; challenge_id: string; title: string; department: string; sport: 'lol' | 'futsal' | 'football'; member_count: number; writable: boolean; messages: LeagueTeamChatMessage[]; has_more: boolean; next_cursor: string | null}
export type LeagueTeamChatResponse = {owner_id: string; chat: LeagueTeamChat}
export type LeagueTeamMessageResponse = {owner_id: string; message: LeagueTeamChatMessage}
export const LEAGUE_TEAM_MESSAGE_MAX = 1000
function validMessage(value: unknown): value is LeagueTeamChatMessage {
 return isChatObject(value) && isChatUuid(value.id) && isChatText(value.body, LEAGUE_TEAM_MESSAGE_MAX) && isChatText(value.alias, 120) && typeof value.is_me === 'boolean' && isChatTimestamp(value.created_at)
}
export function parseLeagueTeamChatResponse(value: unknown, expectedOwner?: string, expectedTeam?: string): LeagueTeamChatResponse | null {
 if (!isChatObject(value) || !isChatUuid(value.owner_id) || (expectedOwner !== undefined && value.owner_id !== expectedOwner) || !isChatObject(value.chat)) return null
 const c = value.chat
 if (!isChatUuid(c.team_id) || (expectedTeam !== undefined && c.team_id !== expectedTeam) || !isChatUuid(c.challenge_id) || !isChatText(c.title, 200) || !isChatText(c.department, 120) || !['lol','futsal','football'].includes(String(c.sport)) || !Number.isSafeInteger(c.member_count) || (c.member_count as number) < 1 || typeof c.writable !== 'boolean' || !Array.isArray(c.messages) || c.messages.length > 50 || !c.messages.every(validMessage) || new Set(c.messages.map(m=>m.id)).size !== c.messages.length || typeof c.has_more !== 'boolean' || !(c.next_cursor === null || isChatUuid(c.next_cursor)) || c.has_more !== (c.next_cursor !== null)) return null
 if (c.has_more && (c.messages.length !== 50 || c.next_cursor !== c.messages[0].id)) return null
 return value as LeagueTeamChatResponse
}
export function parseLeagueTeamMessageResponse(value: unknown, expectedOwner?: string): LeagueTeamMessageResponse | null {
 if (!isChatObject(value) || !isChatUuid(value.owner_id) || (expectedOwner !== undefined && value.owner_id !== expectedOwner) || !validMessage(value.message) || !value.message.is_me) return null
 return value as LeagueTeamMessageResponse
}
export function validateLeagueTeamSend(value: unknown): {team_id: string; body: string; idempotency_key: string} {
 if (!isChatObject(value) || Object.keys(value).length !== 3 || !isChatUuid(value.team_id) || !isChatUuid(value.idempotency_key) || !isChatText(value.body, LEAGUE_TEAM_MESSAGE_MAX) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.body)) throw new Error('invalid_message')
 return {team_id: value.team_id, body: value.body.trim(), idempotency_key: value.idempotency_key}
}
