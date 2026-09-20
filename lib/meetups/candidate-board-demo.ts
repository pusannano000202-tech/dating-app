import type {CandidateBoard, CandidateInvite, CandidateRow, CandidateScope, HostRoom} from './candidate-board-contract'

/**
 * Synthetic development rehearsal only. The 30 people, captain room and invitations
 * are fixtures, not fetched accounts. No server, payment, clock or membership calls.
 * A joining/joined scenario must never be presented as live payment verification.
 * Keep this module behind the development route; it is not a production fallback.
 */
const OTHER_COUNT = 30
const PREVIEW_SIZE = 3
const ROW_LIMIT = 20
const DEMO_JOINING_UNTIL = '2099-09-12T12:20:00.000Z'
const LOL_POSITIONS = ['top', 'jungle', 'mid', 'adc', 'support']
const FOOTBALL_POSITIONS = ['goalkeeper', 'defender', 'midfielder', 'forward']
const LOL_TIERS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'grandmaster', 'challenger']
const FOOTBALL_TIERS = ['beginner', 'intermediate', 'advanced']

function roles(scope: CandidateScope): string[] {
  return scope.kind === 'league' ? scope.key === 'lol' ? LOL_POSITIONS : FOOTBALL_POSITIONS : scope.kind === 'mentoring' ? ['mentor', 'mentee'] : []
}

function slots(scope: CandidateScope): string[] {
  if (scope.kind === 'mentoring') return ['mentor', 'mentee']
  if (scope.kind !== 'league') return []
  if (scope.key === 'lol') return LOL_POSITIONS
  return scope.key === 'futsal' ? ['gk', 'ld', 'rd', 'lm', 'rm', 'st'] : ['gk', 'lb', 'lcb', 'rcb', 'rb', 'lcm', 'cm', 'rcm', 'lw', 'st', 'rw']
}

function validScope(scope: CandidateScope): boolean {
  return ['league', 'mentoring', 'study', 'meetup'].includes(scope.kind)
    && /^[A-Za-z0-9:_-]{1,100}$/.test(scope.key)
    && (scope.kind !== 'league' || ['lol', 'football', 'futsal'].includes(scope.key))
    && (scope.kind !== 'mentoring' || ['courses', 'career', 'campus'].includes(scope.key))
}

function uuid(scope: CandidateScope, namespace: string, index: number): string {
  let hash = 2166136261
  for (const character of `${scope.kind}:${scope.key}:${namespace}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return `${(hash >>> 0).toString(16).padStart(8, '0')}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
}

function fixtureCandidates(scope: CandidateScope): CandidateRow[] {
  const availableRoles = roles(scope)
  const adjectives = ['차분한', '든든한', '유쾌한', '성실한', '다정한']
  const names = ['혜성', '바다', '산책', '별빛', '초록', '구름']
  return Array.from({length: OTHER_COUNT}, (_, index) => ({
    id: uuid(scope, 'candidate', index + 1),
    alias: `${adjectives[index % adjectives.length]} ${names[Math.floor(index / adjectives.length)]}`,
    positions: availableRoles.length ? [...new Set([availableRoles[index % availableRoles.length], availableRoles[(index + 1) % availableRoles.length]])] : [],
    tier: scope.kind !== 'league' ? null : scope.key === 'lol' ? LOL_TIERS[index % LOL_TIERS.length] : FOOTBALL_TIERS[index % FOOTBALL_TIERS.length],
    intro: ['처음 만나도 편하게, 약속은 꼭 지켜요.', '함께 배우고 서로 도와주는 모임이 좋아요.', '마지막까지 즐겁게 함께할게요.'][index % 3],
    availability: ['수요일 저녁', '주말 오후', '평일 수업 후'][index % 3],
    status: 'waiting', revision: 1, is_me: false, joining_until: null, next_href: null,
  }))
}

function fixtureRoom(scope: CandidateScope): HostRoom {
  return {
    id: uuid(scope, 'room', 1), title: '우리 과 함께하는 팀 · 예시',
    capacity: scope.kind === 'league' ? scope.key === 'football' ? 11 : scope.key === 'futsal' ? 6 : 5 : 4,
    member_count: 1, revision: 1, slots: [...slots(scope)],
  }
}

function slotRole(scope: CandidateScope, slot: string | null): string | null {
  if (scope.kind !== 'league' || scope.key === 'lol') return slot
  if (slot === 'gk') return 'goalkeeper'
  if (['ld', 'rd', 'lb', 'lcb', 'rcb', 'rb'].includes(slot ?? '')) return 'defender'
  if (['lm', 'rm', 'lcm', 'cm', 'rcm'].includes(slot ?? '')) return 'midfielder'
  return ['lw', 'st', 'rw'].includes(slot ?? '') ? 'forward' : null
}

function compatible(scope: CandidateScope, candidate: CandidateRow, slot: string | null): boolean {
  if (!roles(scope).length) return slot === null
  return typeof slot === 'string' && slots(scope).includes(slot) && candidate.positions.includes(slotRole(scope, slot) ?? '')
}

function preparationHref(scope: CandidateScope, roomId: string, slot: string | null): string {
  if (scope.kind === 'league') return `/chat/league-team/${roomId}`
  if (scope.kind === 'study') return `/meetups/participation/study/${roomId}/apply`
  if (scope.kind === 'mentoring') return `/meetups/participation/mentoring/${roomId}/apply?role=${slot}`
  return `/meetups/${roomId}/apply`
}

function chatHref(scope: CandidateScope, roomId: string): string {
  return scope.kind === 'league' ? `/chat/league-team/${roomId}` : `/chat/rooms/${scope.kind === 'study' ? 'study_room' : scope.kind}/${roomId}`
}

function updateResult(board: CandidateBoard, status: 'updated' | 'joining' = 'updated', nextHref: string | null = null): void {
  board.result = {status, next_href: nextHref, checkout_enabled: false}
}

/** Every public row is a person, irrespective of how many roles they selected. */
function refresh(board: CandidateBoard, otherLimit: number, filter = 'all'): CandidateBoard {
  if (filter !== 'all' && !roles(board.scope).includes(filter)) throw new Error('invalid_candidate_filter')
  const others = fixtureCandidates(board.scope).filter(row => filter === 'all' || row.positions.includes(filter))
  const waiting = board.mine?.status === 'waiting' ? board.mine : null
  const pinned = waiting && (filter === 'all' || waiting.positions.includes(filter)) ? [waiting] : []
  const shown = others.slice(0, Math.max(0, Math.min(otherLimit, ROW_LIMIT - pinned.length)))
  board.total_count = OTHER_COUNT + (waiting ? 1 : 0)
  board.filtered_count = others.length + pinned.length
  board.candidates = [...pinned, ...shown]
  // The synthetic preview stops at the DTO row cap; this is not a claim that all
  // 30 fixtures were fetched from a backend. Real pagination belongs to the API.
  board.next_cursor = shown.length < others.length && board.candidates.length < ROW_LIMIT ? shown.at(-1)?.id ?? null : null
  return board
}

function currentOtherCount(board: CandidateBoard): number {
  return Math.max(PREVIEW_SIZE, board.candidates.filter(row => !row.is_me).length)
}

function checkRevision(actual: number | null, supplied: unknown): void {
  if (actual !== supplied) throw new Error('candidate_revision_conflict')
}

function cleanText(value: unknown, maximum: number, minimum = 0): value is string {
  return typeof value === 'string' && value === value.trim() && value.length >= minimum && value.length <= maximum
    && !/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/.test(value)
}

function unavailable(invite: CandidateInvite): void {
  if (invite.status !== 'pending' && invite.status !== 'joining') return
  invite.status = 'unavailable'
  invite.revision++
  invite.next_href = null
  invite.joining_until = null
}

export function createDemoBoard(scope: CandidateScope): CandidateBoard {
  if (!validScope(scope)) throw new Error('invalid_candidate_scope')
  return refresh({
    owner_id: uuid(scope, 'owner', 1), scope: {...scope}, department_label: scope.kind==='league'?'건축학과':'기계공학과 · 예시',
    total_count: OTHER_COUNT, filtered_count: OTHER_COUNT, candidates: [], next_cursor: null,
    mine: null, incoming: [], outgoing: [], host_rooms: [fixtureRoom(scope)], result: null,
  }, PREVIEW_SIZE)
}

/** Local, immutable action reducer. Errors mirror conflicts; they never simulate success. */
export function applyDemoAction(board: CandidateBoard, action: string, args: Record<string, unknown>): CandidateBoard {
  if (args.scope_kind !== undefined && args.scope_kind !== board.scope.kind || args.scope_key !== undefined && args.scope_key !== board.scope.key) throw new Error('invalid_candidate_scope')
  const next = structuredClone(board)
  const count = currentOtherCount(board)
  const filter = args.filter === undefined ? 'all' : String(args.filter)
  if (action === 'overview' || action === 'more') return refresh(next, action === 'more' ? count + PREVIEW_SIZE : PREVIEW_SIZE, filter)
  if (action === 'register') {
    const allowed = roles(board.scope)
    if (!Array.isArray(args.positions) || args.positions.length > 5 || new Set(args.positions).size !== args.positions.length
      || !args.positions.every(role => typeof role === 'string' && allowed.includes(role))
      || (allowed.length ? !args.positions.length : args.positions.length !== 0)
      || (board.scope.kind === 'league' ? typeof args.tier !== 'string' || !(board.scope.key === 'lol' ? LOL_TIERS : FOOTBALL_TIERS).includes(args.tier) : args.tier !== null)
      || !cleanText(args.intro, 200) || !cleanText(args.availability, 100, 1) || args.consent !== true) throw new Error('invalid_candidate_registration')
    checkRevision(board.mine?.revision ?? null, args.expected_revision)
    if (board.mine?.status === 'joining' || board.mine?.status === 'joined') throw new Error('candidate_unavailable')
    next.mine = {
      id: board.mine?.id ?? uuid(board.scope, 'candidate', OTHER_COUNT + 1), alias: '오늘의 나 · 예시',
      positions: [...args.positions] as string[], tier: args.tier as string | null,
      intro: args.intro, availability: args.availability, status: 'waiting',
      revision: (board.mine?.revision ?? 0) + 1, is_me: true, joining_until: null, next_href: null,
    }
    next.incoming.forEach(invite => { if (!compatible(next.scope, next.mine!, invite.slot)) unavailable(invite) })
    updateResult(next)
    return refresh(next, count, filter)
  }
  if (action === 'cancel') {
    if (!next.mine || !['waiting', 'joining'].includes(next.mine.status)) throw new Error('candidate_unavailable')
    checkRevision(next.mine.revision, args.expected_revision)
    next.mine = {...next.mine, status: 'cancelled', revision: next.mine.revision + 1, joining_until: null, next_href: null}
    next.incoming.forEach(unavailable)
    updateResult(next)
    return refresh(next, count, filter)
  }
  if (action === 'invite') {
    const candidate = next.candidates.find(row => row.id === args.candidate_id && !row.is_me && row.status === 'waiting')
    const room = next.host_rooms.find(row => row.id === args.room_id)
    if (!candidate || !room) throw new Error('candidate_unavailable')
    checkRevision(candidate.revision, args.candidate_revision)
    checkRevision(room.revision, args.room_revision)
    if (room.member_count >= room.capacity || !compatible(next.scope, candidate, args.slot as string | null)
      || args.slot !== null && !room.slots.includes(String(args.slot))) throw new Error('invalid_candidate_slot')
    if (next.outgoing.some(invite => invite.candidate_id === candidate.id && invite.room_id === room.id && invite.slot === args.slot && ['pending', 'joining', 'joined'].includes(invite.status))) return next
    if (next.outgoing.length >= 100) throw new Error('candidate_invite_limit')
    next.outgoing.push({
      id: uuid(board.scope, 'outgoing', next.outgoing.length + 1), candidate_id: candidate.id, candidate_alias: candidate.alias,
      room_id: room.id, room_title: room.title, slot: args.slot as string | null, status: 'pending', revision: 1,
      is_sender: true, joining_until: null, next_href: null, checkout_enabled: false,
    })
    updateResult(next)
    return next
  }
  if (!['accept', 'decline', 'release'].includes(action)) throw new Error('invalid_candidate_action')
  const invite = next.incoming.find(row => row.id === args.invite_id && !row.is_sender)
  if (!invite || !next.mine || invite.candidate_id !== next.mine.id) throw new Error('candidate_invite_unavailable')
  checkRevision(invite.revision, args.expected_revision)
  if (action === 'release') {
    if (invite.status !== 'joining' || next.mine.status !== 'joining' || next.mine.next_href !== invite.next_href) throw new Error('candidate_invite_conflict')
    next.mine = {...next.mine, status: 'waiting', revision: next.mine.revision + 1, joining_until: null, next_href: null}
    Object.assign(invite, {status: 'pending', revision: invite.revision + 1, joining_until: null, next_href: null})
    updateResult(next)
    return refresh(next, count, filter)
  }
  if (invite.status !== 'pending' || next.mine.status !== 'waiting') throw new Error('candidate_invite_conflict')
  if (action === 'decline') {
    Object.assign(invite, {status: 'declined', revision: invite.revision + 1, joining_until: null, next_href: null})
    updateResult(next)
    return refresh(next, count, filter)
  }
  if (!compatible(next.scope, next.mine, invite.slot)) throw new Error('candidate_invite_unavailable')
  const href = preparationHref(next.scope, invite.room_id, invite.slot)
  next.mine = {...next.mine, status: 'joining', revision: next.mine.revision + 1, joining_until: DEMO_JOINING_UNTIL, next_href: href}
  Object.assign(invite, {status: 'joining', revision: invite.revision + 1, joining_until: DEMO_JOINING_UNTIL, next_href: href})
  updateResult(next, 'joining', href)
  return refresh(next, count, filter)
}

/** Rehearse receiving an invitation; receiving never reserves a place or hides a person. */
export function demoIncoming(board: CandidateBoard, count = 1): CandidateBoard {
  if (count !== 1 && count !== 2) throw new Error('invalid_demo_invite_count')
  const pending = board.incoming.filter(invite => invite.status === 'pending').length
  if (board.mine?.status !== 'waiting' || pending >= count || board.incoming.length >= 100) return board
  const next = structuredClone(board)
  const mine = next.mine!
  const slot = roles(next.scope).length ? slots(next.scope).find(position => compatible(next.scope, mine, position)) ?? null : null
  for (let index = 0; index < count && next.incoming.length < 100; index++) {
    const roomId = uuid(next.scope, 'room', index + 2)
    if (next.incoming.some(invite => invite.room_id === roomId && ['pending','joining','joined'].includes(invite.status))) continue
    next.incoming.push({
      id: uuid(next.scope, 'incoming', next.incoming.length + 1), candidate_id: mine.id, candidate_alias: mine.alias,
      room_id: roomId, room_title: index === 0 ? 'A팀 · 수요일 한 판' : 'B팀 · 주말 한 판',
      slot, status: 'pending', revision: 1, is_sender: false, joining_until: null, next_href: null, checkout_enabled: false,
    })
  }
  next.result = null
  return next
}

/** Explicit synthetic finish button only. This does not verify a payment or create chat access. */
export function demoJoined(board: CandidateBoard): CandidateBoard {
  if (board.mine?.status !== 'joining') return board
  const next = structuredClone(board)
  const invite = next.incoming.find(row => row.status === 'joining' && row.candidate_id === next.mine!.id && row.next_href === next.mine!.next_href)
  if (!invite) return board
  const href = chatHref(next.scope, invite.room_id)
  next.mine = {...next.mine!, status: next.scope.kind==='league'?'waiting':'joined', revision: next.mine!.revision + 1, joining_until: null, next_href: next.scope.kind==='league'?null:href}
  Object.assign(invite, {status: 'joined', revision: invite.revision + 1, joining_until: null, next_href: href})
  if(next.scope.kind!=='league')next.incoming.forEach(other => { if (other.id !== invite.id) unavailable(other) })
  updateResult(next, 'updated', href)
  return refresh(next, currentOtherCount(board))
}
