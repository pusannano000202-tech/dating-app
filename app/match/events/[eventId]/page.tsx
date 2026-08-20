import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  CalendarDays,
  ChevronLeft,
  MapPin,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import QuantumEventApplicationStatus from '@/components/matching/QuantumEventApplicationStatus'
import {
  getQuantumEventById,
  isQuantumPartyType,
  quantumEventPhotos,
  type QuantumPartyType,
} from '@/lib/matching/quantum-event-catalog'

type EventReviewPageProps = {
  params: Promise<{ eventId: string }>
  searchParams?: Promise<{ party?: string | string[] }>
}

export default async function EventReviewPage(props: EventReviewPageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const event = getQuantumEventById(params.eventId)
  const partyValue = typeof searchParams?.party === 'string' ? searchParams.party : null

  if (!event || !isQuantumPartyType(partyValue)) notFound()

  const party: QuantumPartyType = partyValue
  const isTonight = event.id.startsWith('tonight-')
  const photo = quantumEventPhotos[event.kind]

  return (
    <main className="min-h-screen bg-boot-canvas pb-24 text-boot-ink">
      <header className={`border-b ${isTonight ? 'border-white/10 bg-[#171A23] text-white' : 'border-boot-hairline bg-white'}`}>
        <div className="mx-auto flex min-h-16 w-full max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/match"
            aria-label="매칭으로 돌아가기"
            className={`flex h-11 w-11 items-center justify-center rounded-md border ${isTonight ? 'border-white/20 text-white hover:border-white/45' : 'border-boot-hairline text-boot-body hover:border-boot-primary hover:text-boot-primary'}`}
          >
            <ChevronLeft size={19} />
          </Link>
          <div>
            <p className={`text-xs font-black ${isTonight ? 'text-[#F3B95F]' : 'text-boot-primary'}`}>QUANTUM FIVE</p>
            <h1 className="text-xl font-black">약속 확인</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-9">
        <section className="grid gap-5 border-b border-boot-hairline pb-6 sm:grid-cols-[minmax(0,1fr)_280px] sm:items-center">
          <div>
            <p className="text-xs font-black text-boot-primary">{isTonight ? '오늘 밤' : '날짜 잡기'}</p>
            <h2 className="mt-2 text-2xl font-black leading-tight">{event.title}</h2>
            <div className="mt-5 space-y-3 text-sm font-bold">
              <EventFact icon={CalendarDays} label={event.schedule} />
              <EventFact icon={MapPin} label={event.location} />
              <EventFact icon={UsersRound} label={`총 5명 · 남 ${event.maleCount}명 · 여 ${event.femaleCount}명`} />
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-boot-hairline bg-white">
            <Image
              src={photo.src}
              alt={photo.alt}
              width={900}
              height={560}
              priority
              className="aspect-[16/10] w-full object-cover"
            />
          </div>
        </section>

        <section className="grid gap-6 border-b border-boot-hairline py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-black text-boot-muted">참여 방식</p>
            <p className="mt-2 text-lg font-black">{party === 'solo' ? '혼자 참여' : '친구와 참여'}</p>
            <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
              {party === 'solo'
                ? '혼자 들어오면 Quantum이 같은 편과 상대 편을 모두 찾아요.'
                : '같은 성별 친구와 본인 포함 최대 3명까지 함께 들어올 수 있어요.'}
            </p>
          </div>
          <div>
            <p className="text-xs font-black text-boot-muted">편성 원칙</p>
            <p className="mt-2 text-lg font-black">3남 2녀 또는 3녀 2남</p>
            <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
              장소와 정확한 만남 시간은 가능한 인원이 모이면 Quantum이 확정해 알려드려요.
            </p>
          </div>
        </section>

        <QuantumEventApplicationStatus eventId={event.id} party={party} />
      </div>
    </main>
  )
}

function EventFact({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon aria-hidden="true" className="shrink-0 text-boot-primary" size={17} />
      <p>{label}</p>
    </div>
  )
}
