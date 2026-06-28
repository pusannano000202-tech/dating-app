/**
 * 매칭 시스템 튜닝 가능 파라미터 모음
 *
 * 모든 매칭 관련 상수는 이 파일에서만 관리한다.
 * 코드 본문에 매직 넘버를 박지 말 것 — 가상 데이터 실험 시 이 파일만 바꾸면 되도록.
 *
 * Ref: docs/product/matching/MATCHING_SYSTEM_PLAN.md 8-X 결정 사항 (2026-05-21)
 *      lib/appearance/preference.ts, lib/appearance/vector.ts
 *
 * 변경 이력:
 *   - 2026-05-21: 1차 결정 (충현)
 */

// ─────────────────────────────────────────────
// 운영 정책
// ─────────────────────────────────────────────

export const OPERATIONS_CONFIG = {
  /** 보증금 1인당 금액 (KRW). 초기 배포 검증 기준. */
  DEPOSIT_AMOUNT_KRW: 10000,

  /** 매칭 배치 요일 (0=일, 1=월, ..., 6=토). 결정 2-0. */
  BATCH_WEEKDAY: 6,

  /** 배치 발표 시각 (24시간 기준). 결정 8-2. */
  BATCH_HOUR: 14,

  /** 그룹 인원 범위. 결정 8-3. */
  GROUP_SIZE_MIN: 2,
  GROUP_SIZE_MAX: 3,

  /**
   * Forced Match 응답 마감 (토 14:00 + N 시간).
   * 결정 8-4: 일요일 06:00 → 16시간.
   */
  FORCED_MATCH_RESPONSE_DEADLINE_HOURS: 16,

  /** 자동 환불 발동 시점 (연속 이월 횟수). 결정 8-10. */
  AUTO_REFUND_AFTER_ROLLOVERS: 4,
} as const

// ─────────────────────────────────────────────
// Hard filter (점수 처리 없는 on/off 조건)
// ─────────────────────────────────────────────

export const HARD_FILTER_CONFIG = {
  /**
   * 그룹 시간대 교집합 최소 요일 수.
   * 1 = 최소 1개 요일 공통이어야 매칭 가능.
   */
  MIN_TIME_OVERLAP_DAYS: 1,

  /**
   * 외모 백분위 점수대 stratification 폭.
   * 사용자 점수 70 → 풀 후보: 점수 (70 - WIDTH) ~ (70 + WIDTH)
   * 결정 8-5.
   */
  SCORE_BAND_WIDTH: 15,
} as const

// ─────────────────────────────────────────────
// 점수 계산 가중치
// pairScore = Σ(weight_i × component_i) - asymmetry_penalty
// ─────────────────────────────────────────────

export const SCORE_WEIGHTS = {
  /** 외모 양방향 적합도 가중치 */
  APPEARANCE: 0.40,
  /** 성격(Big5) 호환성 가중치 */
  PERSONALITY: 0.20,
  /** 외모 점수대 근접성 가중치 (이미 ±15 안이지만 가까울수록 가점) */
  SCORE_BAND_PROXIMITY: 0.10,
  /** 이상형 가중치 정합 (사용자가 외모/성격 중 무엇 중시) */
  PREFERENCE_WEIGHT_ALIGN: 0.10,
  /** 나이 적합도 (그룹 평균 나이 차이 + 사용자 선호 범위). 결정 8-13 (2026-05-22). */
  AGE_FIT: 0.10,
  /**
   * 시간 적합도 (양 그룹 available_timeslots 교집합 요일 수 / 7).
   * 결정 8-19 (2026-05-22): 자동 시간 배정 정책 이후 시간 유연성이 핵심.
   * Hard filter (MIN_TIME_OVERLAP_DAYS) 와 별개로 부드러운 가점.
   */
  TIME_FIT: 0.10,
} as const

// 합이 1.0 인지 컴파일 타임 보장은 못 하니 런타임 sanity check
const _weightSum =
  SCORE_WEIGHTS.APPEARANCE +
  SCORE_WEIGHTS.PERSONALITY +
  SCORE_WEIGHTS.SCORE_BAND_PROXIMITY +
  SCORE_WEIGHTS.PREFERENCE_WEIGHT_ALIGN +
  SCORE_WEIGHTS.AGE_FIT +
  SCORE_WEIGHTS.TIME_FIT
if (Math.abs(_weightSum - 1.0) > 1e-6) {
  // eslint-disable-next-line no-console
  console.warn(
    `[matching/config] SCORE_WEIGHTS 합이 1.0 이 아닙니다: ${_weightSum.toFixed(4)}`,
  )
}

// ─────────────────────────────────────────────
// 나이 매칭 파라미터 (결정 8-13, 2026-05-22)
// 사용자가 명시한 선호 폭이 없으면 본인 나이 ±DEFAULT_AGE_TOLERANCE 안에서 1.0,
// 밖이면 SOFT_AGE_DECAY 살마다 점수 1/0 으로 부드럽게 감소
// ─────────────────────────────────────────────

export const AGE_FIT_CONFIG = {
  /** 사용자 명시 선호 폭이 없을 때 기본 허용 나이차 (양쪽). */
  DEFAULT_AGE_TOLERANCE: 3,
  /**
   * 선호 폭 바깥일 때 감점 부드러움 (살). 큰 값일수록 너그러움.
   * fit = max(0, 1 - excess/SOFT_AGE_DECAY)
   */
  SOFT_AGE_DECAY: 5,
  /** 선호 나이 입력 시 사용자에게 노출되는 슬라이더 범위. */
  USER_INPUT_MIN: 18,
  USER_INPUT_MAX: 35,
  USER_INPUT_DEFAULT_TOLERANCE: 3,
} as const

// ─────────────────────────────────────────────
// 헝가리안 임계값 / 페널티
// ─────────────────────────────────────────────

export const THRESHOLD_CONFIG = {
  /**
   * 페어 점수 최소 기준. 미달이면 cost = +∞ (매칭 거부).
   * 결정 8-6. 가상 데이터 튜닝 대상.
   */
  PAIR_SCORE_MIN: 0.45,

  /**
   * 양방향 비대칭 페널티 계수.
   * pair_score = avg - PENALTY × |score_ab - score_ba|
   * 결정 8-7.
   */
  ASYMMETRY_PENALTY: 0.3,
} as const

// ─────────────────────────────────────────────
// Forced Match (1차 매칭 실패 후 점수 완화 재시도)
// ─────────────────────────────────────────────

export const FORCED_MATCH_CONFIG = {
  /** Forced Match 의 페어 점수 최소 기준. 결정 8-8: 0.30. */
  PAIR_SCORE_MIN: 0.30,
  /** Forced Match 의 점수대 폭 확장. 결정 8-8: ±25. */
  SCORE_BAND_WIDTH: 25,
  /** 양방향 페널티는 일반 매칭과 동일 유지. */
  ASYMMETRY_PENALTY: 0.3,
} as const

// ─────────────────────────────────────────────
// 분쟁 / 노쇼 / 환불
// ─────────────────────────────────────────────

export const DISPUTE_CONFIG = {
  /**
   * 노쇼 페널티 배분 방식. 결정 8-9.
   *   - 'attendees_equal': 출석자 균등 분배
   *   - 'operations_fund': 운영비 적립
   *   - 'mixed_5050': 절반 출석자, 절반 운영비
   */
  NO_SHOW_DISTRIBUTION: 'attendees_equal' as
    | 'attendees_equal'
    | 'operations_fund'
    | 'mixed_5050',

  /**
   * 거짓말/프로필 불일치 신고 처리. 결정 8-11.
   *   - 'operator_review': 운영자 검토 후 결정 (기본)
   *   - 'auto_unanimous':  같은 매칭 양측 만장일치 시 자동 환불
   *   - 'auto_any_report': 1명 신고로도 자동 환불 (악용 위험)
   */
  PROFILE_MISMATCH_HANDLING: 'operator_review' as
    | 'operator_review'
    | 'auto_unanimous'
    | 'auto_any_report',
} as const

// ─────────────────────────────────────────────
// 출석 / GPS
// ─────────────────────────────────────────────

export const ATTENDANCE_CONFIG = {
  /**
   * 기본 체크인 반경 (m).
   * 실제 반경은 venues.checkin_radius_m 우선, 없으면 이 값.
   * 성준의 venue_db_design 권장값 50m.
   */
  DEFAULT_CHECKIN_RADIUS_M: 50,
  /** 그룹 상호 인증 필요 여부 (peer_confirmed) */
  REQUIRE_PEER_CONFIRMATION: true,
} as const

// ─────────────────────────────────────────────
// 알림
// ─────────────────────────────────────────────

export const NOTIFICATION_CONFIG = {
  /** 알림 채널. 결정 8-12. */
  CHANNELS: ['pwa', 'email'] as ('pwa' | 'email' | 'kakao_alimtalk')[],

  /** 만남 D-1 리마인더 발송 시각 (만남 N시간 전) */
  REMINDER_HOURS_BEFORE_MEETING: 24,

  /** GPS 체크인 가능 알림 (만남 N분 전) */
  CHECKIN_ALERT_MINUTES_BEFORE: 30,
} as const

// ─────────────────────────────────────────────
// 시간대 기본 가정 (사용자 입력은 요일 토글)
// ─────────────────────────────────────────────

export const TIMESLOT_DEFAULTS = {
  /** 만남 시작 가능 시각 (24시간) — 대학생 저녁 가정 */
  DEFAULT_START_HOUR: 18,
  /** 만남 종료 가능 시각 (24시간) — 잠자는 시간 전 */
  DEFAULT_END_HOUR: 24,
} as const

// ─────────────────────────────────────────────
// 통합 export
// ─────────────────────────────────────────────

/**
 * 매칭 시스템 전체 설정.
 * 시뮬레이션/테스트에서는 이 객체를 deep copy 후 일부만 override 해서 사용.
 */
export const MATCHING_CONFIG = {
  operations: OPERATIONS_CONFIG,
  hardFilter: HARD_FILTER_CONFIG,
  weights: SCORE_WEIGHTS,
  threshold: THRESHOLD_CONFIG,
  forcedMatch: FORCED_MATCH_CONFIG,
  dispute: DISPUTE_CONFIG,
  attendance: ATTENDANCE_CONFIG,
  notification: NOTIFICATION_CONFIG,
  timeslot: TIMESLOT_DEFAULTS,
  ageFit: AGE_FIT_CONFIG,
} as const

export type MatchingConfig = typeof MATCHING_CONFIG

/**
 * 시뮬레이션용 config 생성 헬퍼.
 *
 * @example
 *   const looseConfig = makeSimConfig({
 *     threshold: { PAIR_SCORE_MIN: 0.30 },
 *     hardFilter: { SCORE_BAND_WIDTH: 25 },
 *   })
 */
export function makeSimConfig(overrides: DeepPartial<MatchingConfig>): MatchingConfig {
  return deepMerge(MATCHING_CONFIG, overrides) as MatchingConfig
}

// ─────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: DeepPartial<T>,
): T {
  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(override) as (keyof T)[]) {
    const baseVal = base[key]
    const overrideVal = override[key]
    if (
      baseVal &&
      overrideVal &&
      typeof baseVal === 'object' &&
      typeof overrideVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      out[key as string] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as DeepPartial<Record<string, unknown>>,
      )
    } else if (overrideVal !== undefined) {
      out[key as string] = overrideVal
    }
  }
  return out as T
}
