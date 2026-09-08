import { friendSceneLabel, type FriendSceneEvidence, type FriendSceneKind } from '@/lib/friends/scene'

export default function FriendSceneBadge({ kind, evidence }: {
  kind: FriendSceneKind | null
  evidence: FriendSceneEvidence | null
}) {
  const label = kind && evidence ? friendSceneLabel(kind, evidence) : '출처 확인 불가'
  const tone = kind === 'acquaintance'
    ? 'border-[#E9C9B7] bg-[#FFF5ED] text-[#9A4E30]'
    : kind === 'app_met'
      ? 'border-[#E8D9C9] bg-[#FFF9F2] text-[#9A4E30]'
      : 'border-boot-hairline bg-white text-boot-muted'
  return <span className={`inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[10px] font-black ${tone}`}>{label}</span>
}
