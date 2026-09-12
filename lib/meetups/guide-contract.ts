export const MEETUP_GUIDE_SCENE_IDS = [
  'prepare',
  'gather',
  'greet',
  'start',
  'activity',
  'wrap',
  'next',
  'cancelled',
] as const

export type MeetupGuideSceneId = (typeof MEETUP_GUIDE_SCENE_IDS)[number]
export type ActiveMeetupGuideSceneId = Exclude<MeetupGuideSceneId, 'cancelled'>
export type MeetupGuideActionKind =
  | 'acknowledge'
  | 'open_chat'
  | 'open_map'
  | 'open_activity'
  | 'report_late'
  | 'request_help'
  | 'take_break'

export type MeetupLifecycleStatus = 'open' | 'full' | 'completed' | 'cancelled'

export type MeetupGuideViewInput = Readonly<{
  mode: 'preview' | 'actual'
  lifecycleStatus: MeetupLifecycleStatus
  serverNow: string
  scheduledAt: string | null
  endsAt: string | null
  sharedStep: ActiveMeetupGuideSceneId | null
  personalAcknowledgedStep: ActiveMeetupGuideSceneId | null
  previewStep: ActiveMeetupGuideSceneId | null
}>

export type MeetupGuideView = Readonly<{
  currentSceneId: MeetupGuideSceneId
  personalAcknowledgedStep: ActiveMeetupGuideSceneId | null
  source: 'preview' | 'shared_state' | 'server_clock' | 'lifecycle'
  mayMutateSharedState: boolean
}>

export function resolveMeetupGuideView(input: MeetupGuideViewInput): MeetupGuideView {
  if (input.mode === 'preview') {
    return {
      currentSceneId: input.previewStep ?? 'prepare',
      personalAcknowledgedStep: input.personalAcknowledgedStep,
      source: 'preview',
      mayMutateSharedState: false,
    }
  }

  if (input.lifecycleStatus === 'cancelled') return terminalView('cancelled', input.personalAcknowledgedStep)
  if (input.lifecycleStatus === 'completed') return terminalView('next', input.personalAcknowledgedStep)
  if (input.scheduledAt === null) return { currentSceneId: 'prepare', personalAcknowledgedStep: null, source: 'lifecycle', mayMutateSharedState: false }
  if (input.sharedStep) {
    return {
      currentSceneId: input.sharedStep,
      personalAcknowledgedStep: input.personalAcknowledgedStep,
      source: 'shared_state',
      mayMutateSharedState: false,
    }
  }

  const now = timestamp(input.serverNow)
  const startsAt = timestamp(input.scheduledAt)
  const endsAt = input.endsAt ? timestamp(input.endsAt) : null
  const currentSceneId = now < startsAt - 60 * 60 * 1000
    ? 'prepare'
    : now < startsAt
      ? 'gather'
      : endsAt !== null && now >= endsAt
        ? 'wrap'
        : 'activity'

  return {
    currentSceneId,
    personalAcknowledgedStep: input.personalAcknowledgedStep,
    source: 'server_clock',
    mayMutateSharedState: false,
  }
}

function terminalView(
  currentSceneId: 'next' | 'cancelled',
  personalAcknowledgedStep: ActiveMeetupGuideSceneId | null,
): MeetupGuideView {
  return {
    currentSceneId,
    personalAcknowledgedStep,
    source: 'lifecycle',
    mayMutateSharedState: false,
  }
}

function timestamp(value: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new TypeError('invalid_meetup_guide_timestamp')
  return parsed
}
