'use client'

import { ArrowRight, Medal, Trophy } from 'lucide-react'
import { useQuantumLocale } from '@/components/i18n/QuantumLocaleProvider'
import type { LeagueTableRow } from '@/lib/meetups/challenge-journey'
import { groupLeagueHonors } from '@/lib/meetups/league-honors'
import styles from './league-honors.module.css'

const copy = {
  ko: {
    monthly: '이번 달의 선두 학과', overall: '리그의 선두 학과',
    record: '매 경기, 우리 과의 기록이 쌓여요.', confirmed: '양 팀이 확정한 경기 기준',
    rank: (rank: number) => `${rank}위`, tiedRank: (rank: number) => `공동 ${rank}위`,
    tiedDepartments: (count: number) => `공동 ${count}개 학과 · 모두 보기`,
    points: '점', myDepartment: '우리 과', join: '우리 과도 도전하기',
    empty: '첫 주인공을 기다려요', emptyNote: '첫 경기를 마치면 순위가 시작돼요.',
    matches: (count: number) => `${count}경기`,
  },
  en: {
    monthly: 'This month’s leading departments', overall: 'League leaders',
    record: 'Every match adds to your department’s story.', confirmed: 'Results confirmed by both teams',
    rank: (rank: number) => `No. ${rank}`, tiedRank: (rank: number) => `Tied No. ${rank}`,
    tiedDepartments: (count: number) => `${count} tied departments · View all`,
    points: 'pts', myDepartment: 'Your department', join: 'Let’s challenge with our department',
    empty: 'The first spotlight is waiting', emptyNote: 'Complete a match to start the rankings.',
    matches: (count: number) => `${count} ${count === 1 ? 'match' : 'matches'}`,
  },
  ja: {
    monthly: '今月の上位学科', overall: 'リーグの上位学科',
    record: '一試合ずつ、学科の記録を重ねよう。', confirmed: '両チームが確定した試合が対象',
    rank: (rank: number) => `${rank}位`, tiedRank: (rank: number) => `同率${rank}位`,
    tiedDepartments: (count: number) => `同率${count}学科・すべて見る`,
    points: '点', myDepartment: '自分の学科', join: '自分の学科も挑戦する',
    empty: '最初の主役を待っています', emptyNote: '試合を終えると順位が始まります。',
    matches: (count: number) => `${count}試合`,
  },
  zh: {
    monthly: '本月领先院系', overall: '联赛领先院系',
    record: '每场比赛，都为院系留下记录。', confirmed: '仅统计双方确认的比赛',
    rank: (rank: number) => `第${rank}名`, tiedRank: (rank: number) => `并列第${rank}名`,
    tiedDepartments: (count: number) => `${count}个院系并列 · 查看全部`,
    points: '分', myDepartment: '本院系', join: '我们院系也来挑战',
    empty: '等待第一位主角', emptyNote: '完成第一场比赛后即可开启排名。',
    matches: (count: number) => `${count}场比赛`,
  },
}

export type LeagueHonorsProps = {
  rows: readonly LeagueTableRow[]
  monthly: boolean
  onJoin: () => void
}

export function LeagueHonors({ rows, monthly, onJoin }: LeagueHonorsProps) {
  const { locale } = useQuantumLocale()
  const text = copy[locale]
  const groups = groupLeagueHonors(rows)
  const number = new Intl.NumberFormat(locale)
  const names = (members: readonly LeagueTableRow[]) => (
    <ul className={styles.names}>
      {members.map(row => (
        <li key={row.department}>
          <strong className={styles.department}>{row.department}</strong>
          {row.is_me ? <span className={styles.myDepartment}>{text.myDepartment}</span> : null}
          <span className={styles.meta}>{text.matches(row.played)}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <section className={styles.honors} aria-label={monthly ? text.monthly : text.overall}>
      <div className={styles.header}>
        <h2>{monthly ? text.monthly : text.overall}</h2>
        <p>{text.record}</p>
      </div>
      {groups.length ? (
        <ol className={styles.groups}>
          {groups.map(group => {
            const Icon = group.rank === 1 ? Trophy : Medal
            const tied = group.rows.length > 1
            return (
              <li key={group.rank} className={styles.group} data-rank={group.rank} value={group.rank}>
                <div className={styles.rankLine}>
                  <Icon className={styles.icon} aria-hidden="true" strokeWidth={1.7} />
                  <span>{tied ? text.tiedRank(group.rank) : text.rank(group.rank)}</span>
                </div>
                {group.rows.length > 2 ? (
                  <details className={styles.tied}>
                    <summary>{text.tiedDepartments(group.rows.length)}</summary>
                    {names(group.rows)}
                  </details>
                ) : names(group.rows)}
                <p className={styles.points}><strong>{number.format(group.rows[0].points)}</strong><span>{text.points}</span></p>
              </li>
            )
          })}
        </ol>
      ) : (
        <div className={styles.empty}>
          <Trophy className={styles.icon} aria-hidden="true" strokeWidth={1.3} />
          <h3>{text.empty}</h3>
          <p>{text.emptyNote}</p>
        </div>
      )}
      <div className={styles.footer}>
        <small>{text.confirmed}</small>
        <button type="button" className={styles.join} onClick={onJoin}>
          {text.join}<ArrowRight aria-hidden="true" size={16} />
        </button>
      </div>
    </section>
  )
}

export default LeagueHonors
