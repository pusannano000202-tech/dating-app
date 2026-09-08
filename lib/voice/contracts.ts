import type { ParticipationSummary } from '../participation/summary'

export const VOICE_TOPICS = [
  {
    id: 'worries',
    label: '고민 나눔',
    eyebrow: '조언보다, 먼저 들어주는 밤',
    title: '혼자 생각하던 이야기, 같이 나눠요.',
    description: '연애부터 진로까지. 답을 정하지 않고 서로의 이야기를 들어요.',
    color: 'rose',
    symbol: '☾',
  },
  {
    id: 'social',
    label: '가벼운 수다',
    eyebrow: '처음이어도 편안하게',
    title: '오늘 있었던 일부터 시작해요.',
    description: '수업 끝, 자기 전. 잠깐 들러 이야기할 친구를 만나요.',
    color: 'amber',
    symbol: '✦',
  },
  {
    id: 'baseball',
    label: '야구 응원',
    eyebrow: '중계는 각자, 응원은 함께',
    title: '방금 그 장면, 같이 이야기할 사람?',
    description:
      '경기를 각자 보면서 목소리로 함께 응원해요. 영상은 송출하지 않아요.',
    color: 'sage',
    symbol: '⚾',
  },
  {
    id: 'department',
    label: '학과 라운지',
    eyebrow: '같은 과, 새로운 이야기',
    title: '우리 과 사람들과 가볍게 모여요.',
    description: '친구 자동 추가 없이, 관심 있는 이야기에 직접 참여해요.',
    color: 'blue',
    symbol: '⌘',
  },
] as const
export type VoiceTopic = (typeof VOICE_TOPICS)[number]['id']
export type AdviceRole = 'talker' | 'listener'
export type AdviceTopic = 'general' | 'romance' | 'career'
export type VoiceRoomInput = {
  title: string
  topic: VoiceTopic
  description: string
  capacity: number
  startsAt: string
  endsAt: string
  scope: 'school' | 'department'
  departmentKey: string | null
  sourceUrl: string | null
  sourceRevision: string | null
  sourceEventKey: string | null
}
export type VoiceRoom = VoiceRoomInput & {
  id: string
  status: 'scheduled' | 'open' | 'ended' | 'cancelled' | 'delayed'
  revision: number
  connected: ParticipationSummary
  waiting: ParticipationSummary
  scheduleNotice?: string | null
  scheduleChangedAt?: string | null
}
export type VoiceParticipant = {
  identity: string
  displayName: string
  mode: 'listen' | 'speak'
  isModerator: boolean
}
export type VoiceSession = {
  id: string
  roomId: string
  kind: 'group' | 'random' | 'friend'
  state: 'proposed' | 'active' | 'ended'
  revision: number
  generation: number
  mode: 'listen' | 'speak'
  adviceRole: AdviceRole | null
  adviceTopic: AdviceTopic | null
  accepted: boolean
  peerAccepted: boolean
  participants: VoiceParticipant[]
}
export type VoiceCommand = {
  action:
    | 'join'
    | 'leave'
    | 'accept'
    | 'next'
    | 'mode'
    | 'kick'
    | 'close'
    | 'cancel'
    | 'delay'
    | 'open'
    | 'reschedule'
  expectedRevision: number
  idempotencyKey: string
  mode?: 'listen' | 'speak'
  targetIdentity?: string
  startsAt?: string
  endsAt?: string
  scheduleNotice?: string
  sourceRevision?: string
}
