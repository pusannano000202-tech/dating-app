'use client'

import Image from 'next/image'
import {
  Check,
  Download,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  SCORE_BANDS,
  applyAnchorReview,
  summarizeAnchorReviews,
  type AppearanceAnchor,
  type AppearanceAnchorReviewAction,
  type AppearanceGenderBank,
} from '@/lib/profile/appearance-calibration'

import styles from './appearance-calibration.module.css'

const STORAGE_KEY = 'quantum:appearance-calibration-v2:user-review'

type StoredReview = Pick<
  AppearanceAnchor,
  'anchorId' | 'reviewerScore' | 'reviewStatus'
>

const BANK_LABELS: Record<AppearanceGenderBank, string> = {
  female: '여성 기준',
  male: '남성 기준',
}

export default function AppearanceCalibrationReview() {
  const [anchors, setAnchors] = useState<AppearanceAnchor[]>([])
  const [genderBank, setGenderBank] =
    useState<AppearanceGenderBank>('female')
  const [scoreBand, setScoreBand] = useState<number>(SCORE_BANDS[0])
  const [isLoaded, setIsLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadAnchors() {
      try {
        const response = await fetch(
          '/appearance-calibration-v2/anchors.json',
          { cache: 'no-store' }
        )
        if (!response.ok) {
          throw new Error('manifest')
        }

        const manifest = (await response.json()) as AppearanceAnchor[]
        const savedReviews = readStoredReviews()
        const savedById = new Map(
          savedReviews.map((review) => [review.anchorId, review])
        )
        const merged = manifest.map((anchor) => {
          const saved = savedById.get(anchor.anchorId)
          return saved
            ? {
                ...anchor,
                reviewerScore: saved.reviewerScore,
                reviewStatus: saved.reviewStatus,
              }
            : anchor
        })

        if (!cancelled) {
          setAnchors(merged)
          setIsLoaded(true)
        }
      } catch {
        if (!cancelled) {
          setLoadError('기준 이미지 목록을 불러오지 못했습니다.')
        }
      }
    }

    loadAnchors()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isLoaded) return

    const reviews: StoredReview[] = anchors.map(
      ({ anchorId, reviewerScore, reviewStatus }) => ({
        anchorId,
        reviewerScore,
        reviewStatus,
      })
    )
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews))
  }, [anchors, isLoaded])

  const currentAnchors = useMemo(
    () =>
      anchors.filter(
        (anchor) =>
          anchor.genderBank === genderBank &&
          anchor.targetScore === scoreBand
      ),
    [anchors, genderBank, scoreBand]
  )
  const bankSummary = useMemo(
    () =>
      summarizeAnchorReviews(
        anchors.filter((anchor) => anchor.genderBank === genderBank)
      ),
    [anchors, genderBank]
  )

  function updateAnchor(
    anchorId: string,
    action: AppearanceAnchorReviewAction
  ) {
    setAnchors((current) =>
      current.map((anchor) =>
        anchor.anchorId === anchorId
          ? applyAnchorReview(anchor, action)
          : anchor
      )
    )
  }

  function resetReviews() {
    if (!window.confirm('이 브라우저에 저장된 검수 결과를 초기화할까요?')) {
      return
    }

    window.localStorage.removeItem(STORAGE_KEY)
    window.location.reload()
  }

  function exportReviews() {
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      anchors,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'quantum-appearance-calibration-v2-review.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loadError) {
    return (
      <main className={styles.page}>
        <p className={styles.error}>{loadError}</p>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>QUANTUM INTERNAL CALIBRATION</p>
          <h1>외모 점수 기준 사진 검수</h1>
          <p className={styles.description}>
            같은 점수대의 두 사진을 비교하고, 납득되는 점수만 승인하세요.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={resetReviews}
          >
            <RotateCcw size={16} aria-hidden="true" />
            초기화
          </button>
          <button
            className={styles.exportButton}
            type="button"
            onClick={exportReviews}
            disabled={!isLoaded}
          >
            <Download size={16} aria-hidden="true" />
            결과 내보내기
          </button>
        </div>
      </header>

      <section className={styles.safetyNotice}>
        <ShieldCheck size={20} aria-hidden="true" />
        <div>
          <strong>운영 점수 미적용</strong>
          <span>
            이 화면의 판단은 현재 브라우저에만 저장됩니다. 승인본을 따로
            확정하기 전에는 실제 회원 점수와 매칭에 반영되지 않습니다.
          </span>
        </div>
      </section>

      <section className={styles.toolbar} aria-label="검수 범위">
        <div className={styles.segmentedControl}>
          {(['female', 'male'] as const).map((bank) => (
            <button
              key={bank}
              type="button"
              className={genderBank === bank ? styles.selectedSegment : ''}
              aria-pressed={genderBank === bank}
              onClick={() => setGenderBank(bank)}
            >
              {BANK_LABELS[bank]}
            </button>
          ))}
        </div>
        <div className={styles.progress}>
          <span>{BANK_LABELS[genderBank]}</span>
          <strong>
            {bankSummary.reviewed}/{bankSummary.total} 검수
          </strong>
        </div>
      </section>

      <nav className={styles.scoreTabs} aria-label="점수대 선택">
        {SCORE_BANDS.map((score) => (
          <button
            key={score}
            type="button"
            className={scoreBand === score ? styles.selectedScore : ''}
            aria-current={scoreBand === score ? 'page' : undefined}
            onClick={() => setScoreBand(score)}
          >
            {score}점
          </button>
        ))}
      </nav>

      <section className={styles.reviewHeading}>
        <div>
          <span>{BANK_LABELS[genderBank]}</span>
          <h2>{scoreBand}점 비교군</h2>
        </div>
        <p>두 사진은 서로 독립적으로 점수를 수정하거나 제외할 수 있습니다.</p>
      </section>

      <section className={styles.anchorGrid} aria-live="polite">
        {!isLoaded
          ? ['a', 'b'].map((key) => (
              <div className={styles.loadingCard} key={key} />
            ))
          : currentAnchors.map((anchor, index) => (
              <article className={styles.anchorCard} key={anchor.anchorId}>
                <div className={styles.portraitFrame}>
                  <Image
                    src={anchor.imagePath}
                    alt={`${BANK_LABELS[anchor.genderBank]} ${anchor.targetScore}점 후보 ${index + 1}`}
                    fill
                    priority
                    sizes="(max-width: 640px) 46vw, 360px"
                    className={styles.portrait}
                  />
                  <span
                    className={`${styles.statusBadge} ${styles[anchor.reviewStatus]}`}
                  >
                    {statusLabel(anchor.reviewStatus)}
                  </span>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.cardTitle}>
                    <div>
                      <span>생성 기준</span>
                      <strong>{anchor.targetScore}점</strong>
                    </div>
                    <div>
                      <span>내 판단</span>
                      <strong>{anchor.reviewerScore}점</strong>
                    </div>
                  </div>

                  <div className={styles.scoreEditor}>
                    <button
                      type="button"
                      aria-label={`${anchor.anchorId} 5점 낮추기`}
                      onClick={() =>
                        updateAnchor(anchor.anchorId, { type: 'lower' })
                      }
                    >
                      <Minus size={16} aria-hidden="true" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={anchor.reviewerScore}
                      aria-label={`${anchor.anchorId} 직접 점수`}
                      onChange={(event) =>
                        updateAnchor(anchor.anchorId, {
                          type: 'set-score',
                          score: Number(event.target.value),
                        })
                      }
                    />
                    <button
                      type="button"
                      aria-label={`${anchor.anchorId} 5점 높이기`}
                      onClick={() =>
                        updateAnchor(anchor.anchorId, { type: 'raise' })
                      }
                    >
                      <Plus size={16} aria-hidden="true" />
                    </button>
                  </div>

                  <button
                    className={styles.approveButton}
                    type="button"
                    onClick={() =>
                      updateAnchor(anchor.anchorId, { type: 'approve' })
                    }
                  >
                    <Check size={17} aria-hidden="true" />
                    이 점수가 적절함
                  </button>
                  <button
                    className={styles.excludeButton}
                    type="button"
                    onClick={() =>
                      updateAnchor(anchor.anchorId, { type: 'exclude' })
                    }
                  >
                    <X size={16} aria-hidden="true" />
                    기준에서 제외
                  </button>
                </div>
              </article>
            ))}
      </section>

      <footer className={styles.footer}>
        <span>승인 {bankSummary.approved}</span>
        <span>제외 {bankSummary.excluded}</span>
        <span>미검수 {bankSummary.pending}</span>
      </footer>
    </main>
  )
}

function readStoredReviews(): StoredReview[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return []

    const parsed = JSON.parse(stored) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed.filter(isStoredReview)
  } catch {
    return []
  }
}

function isStoredReview(value: unknown): value is StoredReview {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<StoredReview>
  return (
    typeof candidate.anchorId === 'string' &&
    typeof candidate.reviewerScore === 'number' &&
    candidate.reviewerScore >= 0 &&
    candidate.reviewerScore <= 100 &&
    (candidate.reviewStatus === 'pending' ||
      candidate.reviewStatus === 'approved' ||
      candidate.reviewStatus === 'excluded')
  )
}

function statusLabel(status: AppearanceAnchor['reviewStatus']) {
  switch (status) {
    case 'approved':
      return '승인'
    case 'excluded':
      return '제외'
    case 'pending':
      return '미검수'
  }
}
