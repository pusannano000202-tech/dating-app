import {assertTrustedMutationOrigin} from '@/lib/auth/trusted-origin'
import {isChatUuid} from '@/lib/chat/social-rooms-contract'
import {validateLeagueTeamSend} from '@/lib/chat/league-team-contract'
import {socialChatRpc} from '@/lib/chat/social-server'
import {meetupInputErrorResponse, meetupJson} from '@/lib/meetups/http'
import {readStrictJson} from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
 const p = new URL(request.url).searchParams
 const team_id = p.get('team_id'), before = p.get('before')
 if ([...p.keys()].some(k => !['team_id','before'].includes(k) || p.getAll(k).length !== 1) || !isChatUuid(team_id) || (before !== null && !isChatUuid(before))) return meetupJson({error: 'invalid_request'}, 400)
 return socialChatRpc(request, 'league_team_chat', {team_id, before}, 'read')
}
export async function POST(request: Request) {
 try {
  assertTrustedMutationOrigin(request)
  const body = validateLeagueTeamSend(await readStrictJson(request, ['team_id','body','idempotency_key']))
  return socialChatRpc(request, 'league_team_chat', body, 'send')
 } catch (error) { return meetupInputErrorResponse(error) }
}
