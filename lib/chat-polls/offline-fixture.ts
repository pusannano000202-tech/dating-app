const ROOM_ID = '91000000-0000-4000-8000-000000000001'
const VIEWER_ID = '92000000-0000-4000-8000-000000000001'

type RawOption = {
  id: string
  label: string
  position: number
  vote_count: number
  selected_by_me: boolean
}

type RawPoll = {
  id: string
  purpose: 'schedule' | 'place' | 'role' | 'general'
  title: string
  selection_mode: 'single' | 'multiple'
  status: 'open' | 'closed' | 'cancelled'
  revision: number
  creator_alias: string
  is_creator: boolean
  created_at: string
  closed_at: string | null
  ballot_count: number
  options: RawOption[]
  agreement: null | {
    id: string
    version: number
    status: 'proposal' | 'confirmed'
    selected_option_id: string
    summary: string
    confirmation_count: number
    required_count: number
    confirmed_by_me: boolean
    membership_current: boolean
    proposed_at: string
    confirmed_at: string | null
  }
}

type FixtureResponse = { ok: boolean; status: number; json(): Promise<unknown> }

const initialPolls = (): RawPoll[] => [{
  id: '93000000-0000-4000-8000-000000000001',
  purpose: 'place', title: '어디에서 만날까요?', selection_mode: 'single', status: 'open',
  revision: 1, creator_alias: '복숭아여우', is_creator: true,
  created_at: '2026-09-09T08:00:00.000Z', closed_at: null, ballot_count: 2,
  options: [
    { id: '94000000-0000-4000-8000-000000000001', label: '정문 앞', position: 0, vote_count: 1, selected_by_me: false },
    { id: '94000000-0000-4000-8000-000000000002', label: '학생회관 앞', position: 1, vote_count: 1, selected_by_me: false },
  ],
  agreement: null,
}, {
  id: '93000000-0000-4000-8000-000000000002',
  purpose: 'role', title: '각자 어떤 역할을 맡을까요?', selection_mode: 'multiple', status: 'open',
  revision: 1, creator_alias: '복숭아여우', is_creator: true,
  created_at: '2026-09-09T07:55:00.000Z', closed_at: null, ballot_count: 1,
  options: [
    { id: '95000000-0000-4000-8000-000000000001', label: '진행 맡기', position: 0, vote_count: 1, selected_by_me: false },
    { id: '95000000-0000-4000-8000-000000000002', label: '준비물 챙기기', position: 1, vote_count: 0, selected_by_me: false },
    { id: '95000000-0000-4000-8000-000000000003', label: '사진 기록하기', position: 2, vote_count: 0, selected_by_me: false },
  ],
  agreement: null,
}]

function fixtureResponse(data: unknown, status = 200): FixtureResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => status < 400
    ? { data, viewer_binding: VIEWER_ID }
    : { error: data } }
}

function readBody(init?: RequestInit): Record<string, unknown> {
  try { return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> } catch { return {} }
}

export function createChatPollOfflineTransport({ empty = false }: { empty?: boolean } = {}) {
  let polls = empty ? [] : initialPolls()
  let nextId = 10
  const snapshot = () => structuredClone({ room_id: ROOM_ID, polls })

  return {
    roomId: ROOM_ID,
    transport: async (path: string, init?: RequestInit): Promise<FixtureResponse> => {
      const method = init?.method ?? 'GET'
      const parts = new URL(path, 'http://offline.fixture').pathname.split('/').filter(Boolean)
      const action = parts.slice(4)
      if (method === 'GET' && action.length === 0) return fixtureResponse(snapshot())
      if (method !== 'POST') return fixtureResponse('invalid_request', 400)
      const body = readBody(init)
      if (body.expected_viewer_binding !== VIEWER_ID) return fixtureResponse('unauthenticated', 401)

      if (action.length === 0) {
        const id = `96000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`
        const labels = Array.isArray(body.options) ? body.options.filter((label): label is string => typeof label === 'string') : []
        polls = [{
          id,
          purpose: body.purpose as RawPoll['purpose'],
          title: String(body.title ?? ''),
          selection_mode: body.selection_mode as RawPoll['selection_mode'],
          status: 'open', revision: 1, creator_alias: '복숭아여우', is_creator: true,
          created_at: new Date().toISOString(), closed_at: null, ballot_count: 0,
          options: labels.map((label, position) => ({
            id: `97000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
            label, position, vote_count: 0, selected_by_me: false,
          })),
          agreement: null,
        }, ...polls]
        return fixtureResponse(structuredClone(polls[0]), 201)
      }

      const poll = polls.find(item => item.id === action[0])
      if (!poll) return fixtureResponse('activity_poll_not_found', 404)
      if (action.length === 2 && action[1] === 'vote') {
        if (poll.status !== 'open') return fixtureResponse('activity_poll_not_open', 409)
        const selected = new Set(Array.isArray(body.option_ids) ? body.option_ids : [])
        const hadBallot = poll.options.some(option => option.selected_by_me)
        for (const option of poll.options) {
          if (option.selected_by_me) option.vote_count = Math.max(0, option.vote_count - 1)
          option.selected_by_me = selected.has(option.id)
          if (option.selected_by_me) option.vote_count += 1
        }
        if (!hadBallot) poll.ballot_count += 1
        return fixtureResponse(structuredClone(poll))
      }
      if (action.length === 2 && (action[1] === 'close' || action[1] === 'cancel')) {
        if (poll.status === 'open') {
          poll.status = action[1] === 'close' ? 'closed' : 'cancelled'
          poll.revision += 1
          poll.closed_at = action[1] === 'close' ? new Date().toISOString() : null
        }
        return fixtureResponse(structuredClone(poll))
      }
      if (action.length === 2 && action[1] === 'agreement') {
        poll.agreement = {
          id: `98000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
          version: (poll.agreement?.version ?? 0) + 1,
          status: 'proposal', selected_option_id: String(body.selected_option_id),
          summary: String(body.summary ?? ''), confirmation_count: 0, required_count: 3,
          confirmed_by_me: false, membership_current: true,
          proposed_at: new Date().toISOString(), confirmed_at: null,
        }
        return fixtureResponse(structuredClone(poll.agreement))
      }
      if (action.length === 4 && action[1] === 'agreement' && action[3] === 'confirm' && poll.agreement) {
        poll.agreement.confirmed_by_me = true
        poll.agreement.confirmation_count = Math.max(1, poll.agreement.confirmation_count)
        return fixtureResponse(structuredClone(poll.agreement))
      }
      return fixtureResponse('invalid_request', 400)
    },
  }
}
