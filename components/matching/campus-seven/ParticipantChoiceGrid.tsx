'use client'

import Image from 'next/image'
import { Check, UserRound } from 'lucide-react'
import { useState } from 'react'

export type CampusSevenChoiceParticipant = {
  userId: string
  alias: string
  photoUrl: string | null
  verifiedName: string | null
  exactAge: number | null
  entryRole: 'starter' | 'newcomer'
}

type ParticipantChoiceGridProps = {
  participants: CampusSevenChoiceParticipant[]
  selectedUserIds: string[]
  onToggle: (userId: string) => void
  maxSelections?: number
  disabled?: boolean
  label: string
}

export function participantDisplayName(participant: CampusSevenChoiceParticipant): string {
  return participant.verifiedName ?? participant.alias
}

export function ParticipantPortrait({
  participant,
  sizes = '96px',
  className = '',
}: {
  participant: CampusSevenChoiceParticipant | null | undefined
  sizes?: string
  className?: string
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const photoUrl = participant?.photoUrl ?? null
  const showPhoto = Boolean(photoUrl && failedUrl !== photoUrl)

  return (
    <span className={`relative block overflow-hidden bg-boot-soft ${className}`}>
      {participant && showPhoto && photoUrl ? (
        <Image
          src={photoUrl}
          alt={`${participantDisplayName(participant)} 대표사진`}
          fill
          sizes={sizes}
          className="object-cover"
          onError={() => setFailedUrl(photoUrl)}
        />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-boot-muted">
          <UserRound size={28} strokeWidth={1.8} />
          <span className="text-[10px] font-black">사진 준비 중</span>
        </span>
      )}
    </span>
  )
}

export default function ParticipantChoiceGrid({
  participants,
  selectedUserIds,
  onToggle,
  maxSelections = 1,
  disabled = false,
  label,
}: ParticipantChoiceGridProps) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {participants.map((participant) => {
        const selected = selectedUserIds.includes(participant.userId)
        const selectionLimitReached = maxSelections > 1 && !selected && selectedUserIds.length >= maxSelections
        const displayName = participantDisplayName(participant)

        return (
          <button
            key={participant.userId}
            type="button"
            aria-label={`${displayName} 선택`}
            aria-pressed={selected}
            disabled={disabled || selectionLimitReached}
            onClick={() => onToggle(participant.userId)}
            className={`relative min-w-0 overflow-hidden rounded-lg border bg-white text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-boot-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed ${
              selected
                ? 'border-boot-primary shadow-[0_0_0_2px_rgba(13,148,136,0.18)]'
                : 'border-boot-hairline hover:border-boot-primary/50 disabled:opacity-45'
            }`}
          >
            <ParticipantPortrait participant={participant} sizes="(max-width: 640px) 45vw, 180px" className="aspect-[4/5] w-full" />
            <span className="block min-w-0 px-3 py-2.5">
              <span className="block truncate text-sm font-black text-boot-ink">
                {displayName}{participant.exactAge ? ` · ${participant.exactAge}세` : ''}
              </span>
              <span className="mt-0.5 block truncate text-[11px] font-bold text-boot-muted">
                {participant.entryRole === 'newcomer' ? 'Day 2 합류' : 'Day 1 시작'}
              </span>
            </span>
            {selected && (
              <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-boot-primary text-white shadow-md" aria-hidden="true">
                <Check size={17} strokeWidth={3} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
