'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, ChevronDown, UsersRound } from 'lucide-react'
import { MEETUP_GENDER_LABELS, MEETUP_GENDER_MODES } from '@/lib/community/meetup-gender'
import { buildMeetupExploreHref, getMeetupDiscoveryActivities, getMeetupDiscoveryGroups, readMeetupDiscoveryState, type MeetupExploreIntent } from '@/lib/meetups/discovery-navigation'
import s from './meetup-discovery.module.css'
import CustomMeetupShelf from './CustomMeetupShelf'
import { useQuantumLocale } from '@/components/i18n/QuantumLocaleProvider'
import LanguagePicker from '@/components/i18n/LanguagePicker'
import { customMeetupBrowseHref } from '@/lib/meetups/create-flow'
import { getMeetupCategoryLabel } from '@/lib/community/catalog'

export default function MeetupExplore({ intent }: { intent: MeetupExploreIntent }) {
  const { t } = useQuantumLocale()
  const params = useSearchParams()
  const state = readMeetupDiscoveryState(params, intent)
  const groups = getMeetupDiscoveryGroups(intent)
  const selected = groups.find(group => group.id === state.group)
  const activities = getMeetupDiscoveryActivities(intent, state.group, state.genderMode)
  const categories = [...new Set(activities.map(activity => activity.category))]
  const activityGroupsOnly = intent === 'play' && activities.some(activity => activity.kind === 'activity')
  const intentTitle = t(intent === 'play' ? 'meetup.play' : 'meetup.achieve')
  const groupTitle = (id:string,title:string) => intent==='play'?t('play.'+id):title
  const backHref = selected ? buildMeetupExploreHref({ ...state, group: null }) : '/meetups'

  return (
    <main className={s.page}>
      <div className={s.container}>
        <header className={s.exploreHeader}>
          <Link href={backHref} className={s.back}><ArrowLeft size={17} aria-hidden="true" />{selected ? intentTitle : '모임'}</Link>
          <div className="flex flex-wrap items-center justify-between gap-2"><p className={s.eyebrow}>{t('학과 상관없이, 같은 학교 친구들과')}</p><LanguagePicker compact/></div>
          <h1>{selected ? groupTitle(selected.id,selected.title) : intentTitle}</h1>
          <p className={s.lead}>{selected ? t('하고 싶은 활동을 고르고, 모임방에서 만나요.') : intent === 'play' ? t('play.heading') : t('함께 해내고 싶은 일을 골라요.')}</p>
        </header>
        {intent === 'achieve' && !selected ? <Link href="/meetups/department/courses" className={s.back}>우리 과 전공 공부는 여기서<ArrowRight size={15} aria-hidden="true" /></Link> : null}

        {!selected ? (
          <nav className={s.groupRows} aria-label={intent === 'play' ? '같이 놀 활동 분류' : '함께할 스터디 주제'}>
            {groups.map(group => (
              <Link key={group.id} href={buildMeetupExploreHref({ ...state, group: group.id })} className={s.photoRow}>
                <Image className={s.rowPhoto} src={group.imageSrc} alt={group.imageAlt} width={700} height={460} sizes="(min-width: 760px) 190px, 43vw" />
                <div className={s.rowText}>
                  <h2>{groupTitle(group.id,group.title)}</h2>
                  <p>{intent==='play'?t('play.'+group.id+'Sub'):group.description}</p>
                  <span className={s.rowAction}>{t('활동 고르기')}<ArrowRight size={14} aria-hidden="true" /></span>
                </div>
              </Link>
            ))}
          </nav>
        ) : (
          <>
            <details className={s.conditions} key={`${state.intent}-${state.group}`}>
              <summary>{t('참여 조건')}<span>{t(MEETUP_GENDER_LABELS[state.genderMode])}<ChevronDown size={15} aria-hidden="true" /></span></summary>
              <nav className={s.genderChoices} aria-label="모임방 성별 조건">
                {MEETUP_GENDER_MODES.map(genderMode => (
                  <Link key={genderMode} href={buildMeetupExploreHref({ ...state, genderMode })} scroll={false} aria-current={state.genderMode === genderMode ? 'true' : undefined}>{t(MEETUP_GENDER_LABELS[genderMode])}</Link>
                ))}
              </nav>
              <p>{t('성별 무관은 남녀 인원 균형을 보장하지 않아요.')}</p>
            </details>
            <p className={s.availabilityNote}>{t('현재 인원과 일정은 모임방에서 확인해요.')}</p>
            <nav className={s.activityRows} aria-label={`${selected.title} 활동 목록`}>
              {activities.map(activity => (
                <Link key={activity.id} href={activity.href} className={`${s.photoRow} ${s.activityRow}`}>
                  <Image className={s.rowPhoto} src={activity.imageSrc} alt={activity.imageAlt} width={700} height={460} sizes="(min-width: 760px) 190px, 40vw" />
                  <div className={s.rowText}>
                    <h2>{activity.title}</h2>
                    <p>{activity.description}</p>
                    <span className={s.capacity}><UsersRound size={13} aria-hidden="true" />{activity.kind === 'category' ? '권장' : '기본 정원'} {activity.capacity}명</span>
                    <span className={s.rowAction}>{t('모임방 보기')}<ArrowRight size={14} aria-hidden="true" /></span>
                  </div>
                </Link>
              ))}
            </nav>
            {activityGroupsOnly ? <details className={s.otherMeetups}>
              <summary>{t('다른 모임 보기')}<ChevronDown size={15} aria-hidden="true" /></summary>
              <p>{t('활동을 지정하지 않고 연 모임도 둘러보세요.')}</p>
              <nav aria-label="분류별 다른 모임">{categories.map(category => <Link key={category} href={customMeetupBrowseHref(category, 'school', state.genderMode)}>{t(getMeetupCategoryLabel(category))}<ArrowRight size={14} aria-hidden="true" /></Link>)}</nav>
            </details> : <CustomMeetupShelf categories={categories} genderMode={state.genderMode} imageSrc={selected.imageSrc} topicGroup={state.intent==='achieve'?selected.id:undefined} fromHref={buildMeetupExploreHref(state)}/>}
          </>
        )}
      </div>
    </main>
  )
}
