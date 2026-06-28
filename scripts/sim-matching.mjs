/**
 * sim-matching.mjs — 가상 200명(남100+여100) 매칭 시뮬레이션
 *
 * 실행: node scripts/sim-matching.mjs
 *
 * 부산대 학생 분포를 최대한 실제처럼 모사.
 * 매칭 로직은 lib/matching/ 과 동일하게 인라인 재구현.
 */

// ──────────────────────────────────────────────
// 상수 (lib/matching/config.ts 와 동일)
// ──────────────────────────────────────────────

const SCORE_WEIGHTS = {
  APPEARANCE: 0.40,
  PERSONALITY: 0.20,
  SCORE_BAND_PROXIMITY: 0.10,
  PREFERENCE_WEIGHT_ALIGN: 0.10,
  AGE_FIT: 0.10,
  TIME_FIT: 0.10,
}
const SCORE_BAND_WIDTH = 15
const PAIR_SCORE_MIN = 0.45
const ASYMMETRY_PENALTY = 0.30
const DEFAULT_AGE_TOLERANCE = 3
const SOFT_AGE_DECAY = 5
const WEEKDAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

// ──────────────────────────────────────────────
// 부산대 학과 코드 (실제 분포 반영)
// ──────────────────────────────────────────────

const DEPT_POOL = [
  // 공과대학 (30%)
  { code: 'ECE',  name: '전기전자공학부',  weight: 10 },
  { code: 'CSE',  name: '정보컴퓨터공학부', weight: 9 },
  { code: 'ME',   name: '기계공학부',       weight: 6 },
  { code: 'CE',   name: '토목공학과',       weight: 5 },
  // 경영/사회 (20%)
  { code: 'BIZ',  name: '경영학과',         weight: 10 },
  { code: 'ECON', name: '경제학부',         weight: 5 },
  { code: 'SOC',  name: '사회학과',         weight: 5 },
  // 의학/간호 (10%)
  { code: 'MED',  name: '의학과',           weight: 5 },
  { code: 'NUR',  name: '간호학과',         weight: 5 },
  // 사범대 (10%)
  { code: 'EDU',  name: '교육학과',         weight: 5 },
  { code: 'LANG', name: '국어교육과',       weight: 5 },
  // 인문/예술 (10%)
  { code: 'KOR',  name: '국어국문학과',     weight: 5 },
  { code: 'ENG',  name: '영어영문학과',     weight: 5 },
  // 자연과학 (10%)
  { code: 'MATH', name: '수학과',           weight: 4 },
  { code: 'PHYS', name: '물리학과',         weight: 3 },
  { code: 'CHEM', name: '화학과',           weight: 3 },
  // 기타 (10%)
  { code: 'ARCH', name: '건축학과',         weight: 5 },
  { code: 'ART',  name: '예술문화영상학과', weight: 5 },
]

// ──────────────────────────────────────────────
// 난수 유틸
// ──────────────────────────────────────────────

function randn() {
  // Box-Muller 변환 → N(0,1)
  const u = Math.random(), v = Math.random()
  return Math.sqrt(-2 * Math.log(u + 1e-10)) * Math.cos(2 * Math.PI * v)
}

function normal(mu, sigma) {
  return mu + sigma * randn()
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x))
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0
  return clamp(x, 0, 1)
}

function weightedChoice(pool) {
  const total = pool.reduce((s, p) => s + p.weight, 0)
  let r = Math.random() * total
  for (const item of pool) {
    r -= item.weight
    if (r <= 0) return item
  }
  return pool[pool.length - 1]
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ──────────────────────────────────────────────
// 외모 벡터 (5 축: 귀여움·샤프함·성숙함·자연스러움·생기)
// 외모 z-벡터는 N(0,1) 분포. 코사인 유사도 계산에 사용.
// ──────────────────────────────────────────────

const AXES = ['cute', 'sharp', 'mature', 'natural', 'vivid']

function makeAppearanceVector(bias = {}) {
  const v = {}
  for (const ax of AXES) {
    // 외모 축 z-score: N(0,1), 개인별 bias 반영
    v[ax] = normal(bias[ax] ?? 0, 1.0)
  }
  return v
}

function makePreferredAxisZVector(gender) {
  // 이성에 대한 선호 벡터 — 성별마다 약간 다른 분포
  const v = {}
  for (const ax of AXES) {
    // 개인마다 어떤 축을 중요하게 보는지 다름
    // 양수: 그 축이 높은 사람을 선호, 음수: 낮은 사람 선호
    v[ax] = normal(0, 0.8)
  }
  return v
}

// ──────────────────────────────────────────────
// 개인 프로필 생성
// ──────────────────────────────────────────────

const AGE_WEIGHTS = [
  { age: 20, w: 28 },
  { age: 21, w: 25 },
  { age: 22, w: 20 },
  { age: 23, w: 14 },
  { age: 24, w: 8 },
  { age: 25, w: 4 },
  { age: 26, w: 1 },
]

function pickAge() {
  return weightedChoice(AGE_WEIGHTS.map(a => ({ age: a.age, weight: a.w }))).age
}

function makeAvailability() {
  // 부산대생 현실 스케줄:
  //   토요일: 95% 참여
  //   금요일: 70%
  //   일요일: 40%
  //   평일 저녁: 20-30%
  const dayProb = {
    monday: 0.20, tuesday: 0.22, wednesday: 0.25,
    thursday: 0.28, friday: 0.70, saturday: 0.95, sunday: 0.40
  }
  const avail = {}
  for (const day of WEEKDAYS) {
    if (Math.random() < dayProb[day]) {
      avail[day] = [{ start: '18:00', end: '23:00' }]
    } else {
      avail[day] = []
    }
  }
  // 최소 1일은 비워두지 않도록 (hard filter 통과용)
  // 토요일은 위에서 95%라 거의 항상 있음
  return avail
}

// Big5 한국 대학생 분포 (openness 0–1 스케일)
const BIG5_MEANS = {
  male:   { openness: 0.53, conscientiousness: 0.58, extraversion: 0.50, agreeableness: 0.60, neuroticism: 0.43 },
  female: { openness: 0.57, conscientiousness: 0.63, extraversion: 0.53, agreeableness: 0.68, neuroticism: 0.50 },
}
const BIG5_STD = { openness: 0.15, conscientiousness: 0.14, extraversion: 0.17, agreeableness: 0.12, neuroticism: 0.17 }

function makeBig5(gender) {
  const mu = BIG5_MEANS[gender]
  const b5 = {}
  for (const k of Object.keys(mu)) {
    b5[k] = clamp01(normal(mu[k], BIG5_STD[k]))
  }
  return b5
}

// 이상형 Big5 — 대략 본인과 비슷하거나 보완적
function makePreferredBig5(myBig5, gender) {
  const pref = {}
  for (const k of Object.keys(myBig5)) {
    // 자신과 비슷한 성격 좋아한다는 연구 기반. 노이즈 추가.
    pref[k] = clamp01(myBig5[k] + normal(0, 0.12))
  }
  return pref
}

function makePreferenceWeights() {
  // 사용자가 외모/성격 중 무엇을 중시하는지
  // 외모 중시파 40%, 균형파 40%, 성격 중시파 20%
  const rand = Math.random()
  let appW, persW
  if (rand < 0.40) {
    // 외모 중시
    appW = clamp01(normal(0.7, 0.1))
    persW = clamp01(normal(0.3, 0.1))
  } else if (rand < 0.80) {
    // 균형
    appW = clamp01(normal(0.5, 0.08))
    persW = clamp01(normal(0.5, 0.08))
  } else {
    // 성격 중시
    appW = clamp01(normal(0.3, 0.1))
    persW = clamp01(normal(0.7, 0.1))
  }
  const total = appW + persW || 1
  appW /= total
  persW /= total
  // time, scoreBand, weightAlignment 는 소값
  return {
    appearance: appW,
    personality: persW,
    time: 0.05,
    scoreBand: 0.05,
    weightAlignment: 0.05,
  }
}

function makePerson(id, gender) {
  const age = pickAge()
  const dept = weightedChoice(DEPT_POOL)
  const big5 = makeBig5(gender)
  // 외모 점수 — 정규분포 μ=50 σ=14, 20~80 클램프
  const appearanceScore = clamp(Math.round(normal(50, 14)), 20, 80)
  // 외모 벡터 (자신의 실제 외모 특성)
  const appearanceVector = makeAppearanceVector()
  // 이성에 대한 선호 외모 벡터 (cosine similarity 계산용)
  const preferredAxisZVector = makePreferredAxisZVector(gender)
  const preferredBig5 = makePreferredBig5(big5, gender)
  const preferenceWeights = makePreferenceWeights()
  const availability = makeAvailability()

  return {
    id,
    gender,
    age,
    dept: dept.code,
    deptName: dept.name,
    appearanceScore,
    appearanceVector,
    preferredAxisZVector,
    big5,
    preferredBig5,
    preferenceWeights,
    availability,
    preferredAgeMin: age - DEFAULT_AGE_TOLERANCE,
    preferredAgeMax: age + DEFAULT_AGE_TOLERANCE + (gender === 'female' ? 2 : 0),
  }
}

// ──────────────────────────────────────────────
// 그룹 생성 (2~3인)
// ──────────────────────────────────────────────

function formGroups(people, genderLabel) {
  const shuffled = shuffleArray([...people])
  const groups = []
  let i = 0
  let groupNum = 1

  while (i < shuffled.length) {
    const remaining = shuffled.length - i
    // 남은 인원이 2 이하면 2인 그룹, 아니면 랜덤 2 or 3
    let size
    if (remaining <= 2) {
      size = remaining
    } else if (remaining === 4) {
      size = 2 // 2+2 가 낫다
    } else {
      size = Math.random() < 0.60 ? 3 : 2
    }

    const members = shuffled.slice(i, i + size)
    i += size

    // GroupSummary 생성 — 멤버 평균 계산
    const avgScore = members.reduce((s, m) => s + m.appearanceScore, 0) / members.length
    const avgAge = members.reduce((s, m) => s + m.age, 0) / members.length

    // 벡터 평균 계산
    function avgVec(key) {
      const out = {}
      for (const ax of AXES) {
        out[ax] = members.reduce((s, m) => s + m[key][ax], 0) / members.length
      }
      return out
    }

    function avgBig5(key) {
      const out = {}
      for (const k of ['openness','conscientiousness','extraversion','agreeableness','neuroticism']) {
        out[k] = members.reduce((s, m) => s + m[key][k], 0) / members.length
      }
      return out
    }

    function avgPrefWeights() {
      const keys = ['appearance','personality','time','scoreBand','weightAlignment']
      const out = {}
      for (const k of keys) {
        out[k] = members.reduce((s, m) => s + m.preferenceWeights[k], 0) / members.length
      }
      return out
    }

    // availability 교집합 (그룹 전원이 되는 요일만)
    function intersectAvailability() {
      const avail = {}
      for (const day of WEEKDAYS) {
        const allHaveDay = members.every(m => m.availability[day]?.length > 0)
        avail[day] = allHaveDay ? [{ start: '18:00', end: '23:00' }] : []
      }
      return avail
    }

    const groupId = `${genderLabel}G${String(groupNum).padStart(2,'0')}`
    groupNum++

    groups.push({
      groupId,
      gender: genderLabel,
      size: members.length,
      departmentCodes: [...new Set(members.map(m => m.dept))],
      avgSelfAppearanceScore: avgScore,
      avgAppearanceVector: avgVec('appearanceVector'),
      avgPreferredAppearanceVector: avgVec('preferredAxisZVector'),
      avgPreferredAxisZVector: avgVec('preferredAxisZVector'),
      avgBig5: avgBig5('big5'),
      preferredBig5: avgBig5('preferredBig5'),
      availability: intersectAvailability(),
      excludedGroupIds: [],
      preferenceWeights: avgPrefWeights(),
      avgAge,
      preferredAgeMin: Math.min(...members.map(m => m.preferredAgeMin)),
      preferredAgeMax: Math.max(...members.map(m => m.preferredAgeMax)),
      // 디버깅용 메타데이터 (실제 GroupSummary 에는 없음)
      _members: members.map(m => ({
        id: m.id,
        age: m.age,
        dept: m.deptName,
        score: m.appearanceScore,
      })),
    })
  }
  return groups
}

// ──────────────────────────────────────────────
// 매칭 로직 (lib/matching/ 인라인 재구현)
// ──────────────────────────────────────────────

function cosineSimilarity(a, b) {
  const keys = Object.keys(a).filter(k => k in b)
  let dot = 0, aMag = 0, bMag = 0
  for (const k of keys) {
    dot += a[k] * b[k]
    aMag += a[k] * a[k]
    bMag += b[k] * b[k]
  }
  if (aMag === 0 || bMag === 0) return 0
  return clamp01(dot / (Math.sqrt(aMag) * Math.sqrt(bMag)))
}

function big5Compatibility(preferred, actual) {
  const keys = Object.keys(preferred)
  const dist = keys.reduce((s, k) => s + Math.abs(preferred[k] - actual[k]), 0)
  return clamp01(1 - dist / keys.length)
}

function prefWeightAlignment(a, b) {
  const keys = Object.keys(a)
  const dist = keys.reduce((s, k) => s + Math.abs(a[k] - b[k]), 0)
  return clamp01(1 - dist / keys.length)
}

function countOverlapDays(avail) {
  return WEEKDAYS.filter(d => avail[d]?.length > 0).length
}

function intersectAvailability(a, b) {
  const result = {}
  for (const day of WEEKDAYS) {
    result[day] = (a[day]?.length > 0 && b[day]?.length > 0) ? [{ start: '18:00', end: '23:00' }] : []
  }
  return result
}

function ageFitScore(a, b) {
  if (a.avgAge == null || b.avgAge == null) return 1.0
  function fitOneSide(self, opp) {
    let minP = self.preferredAgeMin ?? (self.avgAge - DEFAULT_AGE_TOLERANCE)
    let maxP = self.preferredAgeMax ?? (self.avgAge + DEFAULT_AGE_TOLERANCE)
    if (opp.avgAge >= minP && opp.avgAge <= maxP) return 1.0
    const excess = opp.avgAge < minP ? (minP - opp.avgAge) : (opp.avgAge - maxP)
    return Math.max(0, 1 - excess / SOFT_AGE_DECAY)
  }
  return clamp01((fitOneSide(a, b) + fitOneSide(b, a)) / 2)
}

function isMatchable(a, b) {
  if (a.gender === b.gender) return { ok: false, reason: 'same_gender' }
  if (a.size !== b.size) return { ok: false, reason: 'size_mismatch' }

  const overlap = WEEKDAYS.some(d => a.availability[d]?.length > 0 && b.availability[d]?.length > 0)
  if (!overlap) return { ok: false, reason: 'no_time_overlap' }

  const bandGap = Math.abs(a.avgSelfAppearanceScore - b.avgSelfAppearanceScore)
  if (bandGap > SCORE_BAND_WIDTH) return { ok: false, reason: 'score_band_mismatch' }

  if (a.avgPreferredAxisZVector == null || b.avgAppearanceVector == null) {
    return { ok: false, reason: 'missing_required_profile_data' }
  }

  return { ok: true }
}

function computePairScore(a, b) {
  const matchable = isMatchable(a, b)
  if (!matchable.ok) return { groupAId: a.groupId, groupBId: b.groupId, score: 0, matchable, breakdown: null }

  const appearanceAB = cosineSimilarity(a.avgPreferredAxisZVector, b.avgAppearanceVector)
  const appearanceBA = cosineSimilarity(b.avgPreferredAxisZVector, a.avgAppearanceVector)
  const asymmetryPenalty = Math.abs(appearanceAB - appearanceBA) * ASYMMETRY_PENALTY
  const appearance = clamp01((appearanceAB + appearanceBA) / 2 - asymmetryPenalty)

  const personality = (
    big5Compatibility(a.preferredBig5, b.avgBig5) +
    big5Compatibility(b.preferredBig5, a.avgBig5)
  ) / 2

  const overlapDays = countOverlapDays(intersectAvailability(a.availability, b.availability))
  const time = clamp01(overlapDays / 7)

  const scoreBand = clamp01(1 - Math.abs(a.avgSelfAppearanceScore - b.avgSelfAppearanceScore) / SCORE_BAND_WIDTH)

  const weightAlignment = prefWeightAlignment(a.preferenceWeights, b.preferenceWeights)
  const ageFit = ageFitScore(a, b)

  const score = clamp01(
    SCORE_WEIGHTS.APPEARANCE * appearance +
    SCORE_WEIGHTS.PERSONALITY * personality +
    SCORE_WEIGHTS.SCORE_BAND_PROXIMITY * scoreBand +
    SCORE_WEIGHTS.PREFERENCE_WEIGHT_ALIGN * weightAlignment +
    SCORE_WEIGHTS.AGE_FIT * ageFit +
    SCORE_WEIGHTS.TIME_FIT * time
  )

  return {
    groupAId: a.groupId,
    groupBId: b.groupId,
    score,
    matchable,
    breakdown: { appearanceAB, appearanceBA, appearance, personality, time, scoreBand, weightAlignment, asymmetryPenalty, ageFit },
  }
}

function simulateBatch(groups) {
  const candidates = []
  const rejected = []

  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i], b = groups[j]
      const result = computePairScore(a, b)
      if (!result.matchable.ok) {
        rejected.push({ groupAId: a.groupId, groupBId: b.groupId, reason: result.matchable.reason })
        continue
      }
      if (result.score >= PAIR_SCORE_MIN) {
        candidates.push(result)
      } else {
        rejected.push({ groupAId: a.groupId, groupBId: b.groupId, reason: 'below_threshold' })
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return { candidates, rejected }
}

// ──────────────────────────────────────────────
// 출력 유틸
// ──────────────────────────────────────────────

const RESET  = '\x1b[0m'
const BOLD   = '\x1b[1m'
const CYAN   = '\x1b[36m'
const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED    = '\x1b[31m'
const MAGENTA= '\x1b[35m'
const DIM    = '\x1b[2m'

function bar(value, width = 20) {
  const filled = Math.round(value * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function pct(n, d) {
  return d === 0 ? '0.0' : (n / d * 100).toFixed(1)
}

function fmt(x) {
  return x.toFixed(3)
}

// ──────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────

console.log(`\n${BOLD}${CYAN}══════════════════════════════════════════════════${RESET}`)
console.log(`${BOLD}${CYAN}   부산대 과팅앱 — 가상 매칭 시뮬레이션          ${RESET}`)
console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════${RESET}\n`)

// 1. 200명 생성
console.log(`${BOLD}[1] 가상 인물 200명 생성 중...${RESET}`)

const males   = Array.from({ length: 100 }, (_, i) => makePerson(`M${String(i+1).padStart(3,'0')}`, 'male'))
const females = Array.from({ length: 100 }, (_, i) => makePerson(`F${String(i+1).padStart(3,'0')}`, 'female'))

// 기초 통계
function statAge(people) {
  const ages = people.map(p => p.age)
  const counts = {}
  for (const a of ages) counts[a] = (counts[a] || 0) + 1
  return counts
}

function statDept(people) {
  const counts = {}
  for (const p of people) counts[p.deptName] = (counts[p.deptName] || 0) + 1
  return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,5)
}

function statScore(people) {
  const scores = people.map(p => p.appearanceScore)
  const avg = scores.reduce((s,x)=>s+x,0)/scores.length
  const sorted = [...scores].sort((a,b)=>a-b)
  const p25 = sorted[Math.floor(sorted.length*0.25)]
  const p75 = sorted[Math.floor(sorted.length*0.75)]
  return { avg: avg.toFixed(1), p25, p75, min: sorted[0], max: sorted[sorted.length-1] }
}

console.log(`\n  ${BOLD}남성 100명 분포${RESET}`)
const mAgeCount = statAge(males)
const mScores = statScore(males)
console.log(`  나이: ${Object.entries(mAgeCount).map(([a,c])=>`${a}세×${c}`).join(' | ')}`)
console.log(`  외모점수: 평균 ${mScores.avg} | 25%ile ${mScores.p25} | 75%ile ${mScores.p75} | 범위 ${mScores.min}~${mScores.max}`)
console.log(`  상위 학과: ${statDept(males).map(([d,c])=>`${d}(${c}명)`).join(', ')}`)

console.log(`\n  ${BOLD}여성 100명 분포${RESET}`)
const fAgeCount = statAge(females)
const fScores = statScore(females)
console.log(`  나이: ${Object.entries(fAgeCount).map(([a,c])=>`${a}세×${c}`).join(' | ')}`)
console.log(`  외모점수: 평균 ${fScores.avg} | 25%ile ${fScores.p25} | 75%ile ${fScores.p75} | 범위 ${fScores.min}~${fScores.max}`)
console.log(`  상위 학과: ${statDept(females).map(([d,c])=>`${d}(${c}명)`).join(', ')}`)

// 2. 그룹 생성
console.log(`\n${BOLD}[2] 그룹 구성 (2~3인)${RESET}`)
const maleGroups   = formGroups(males,   'male')
const femaleGroups = formGroups(females, 'female')
console.log(`  남성 그룹: ${maleGroups.length}개 (2인: ${maleGroups.filter(g=>g.size===2).length}, 3인: ${maleGroups.filter(g=>g.size===3).length})`)
console.log(`  여성 그룹: ${femaleGroups.length}개 (2인: ${femaleGroups.filter(g=>g.size===2).length}, 3인: ${femaleGroups.filter(g=>g.size===3).length})`)

// 크기별 분포 확인
const m2 = maleGroups.filter(g=>g.size===2).length
const m3 = maleGroups.filter(g=>g.size===3).length
const f2 = femaleGroups.filter(g=>g.size===2).length
const f3 = femaleGroups.filter(g=>g.size===3).length
// 크기 일치 쌍 수
const pairs2 = Math.min(m2, f2)
const pairs3 = Math.min(m3, f3)
console.log(`  매칭 가능 크기 조합 (2인×2인): 최대 ${m2}×${f2} = ${m2*f2}쌍 검토 대상`)
console.log(`  매칭 가능 크기 조합 (3인×3인): 최대 ${m3}×${f3} = ${m3*f3}쌍 검토 대상`)

// 3. 시뮬레이션
console.log(`\n${BOLD}[3] 매칭 시뮬레이션 실행 중...${RESET}`)
const allGroups = [...maleGroups, ...femaleGroups]
const { candidates, rejected } = simulateBatch(allGroups)

const totalPairs = maleGroups.length * femaleGroups.length
console.log(`  전체 남-여 페어 경우의 수: ${totalPairs}`)
console.log(`  후보 통과 (score ≥ ${PAIR_SCORE_MIN}): ${GREEN}${BOLD}${candidates.length}쌍${RESET}`)
console.log(`  거절: ${RED}${rejected.length}건${RESET}`)

// 거절 사유 분석
const rejectCount = {}
for (const r of rejected) {
  rejectCount[r.reason] = (rejectCount[r.reason] || 0) + 1
}
console.log(`\n  ${BOLD}거절 사유 분석${RESET}`)
const rejectLabels = {
  same_gender: '같은 성별',
  size_mismatch: '인원 불일치',
  no_time_overlap: '시간 겹침 없음',
  score_band_mismatch: '외모 점수대 차이 ±15 초과',
  below_threshold: `점수 미달 (< ${PAIR_SCORE_MIN})`,
  missing_required_profile_data: '필수 데이터 없음',
  excluded_pair: '제외 그룹',
}
for (const [reason, count] of Object.entries(rejectCount).sort((a,b)=>b[1]-a[1])) {
  const label = rejectLabels[reason] || reason
  const barStr = bar(count / totalPairs, 15)
  console.log(`  ${DIM}${barStr}${RESET} ${pct(count, totalPairs)}%  ${label} (${count}건)`)
}

// 4. 상위 매칭 결과
console.log(`\n${BOLD}[4] 상위 10 매칭 결과${RESET}`)
console.log(`  ${'순위'.padEnd(4)} ${'점수'.padEnd(7)} ${'남성그룹'.padEnd(8)} ${'여성그룹'.padEnd(8)} ${'외모'.padEnd(7)} ${'성격'.padEnd(7)} ${'시간'.padEnd(7)} ${'점수대'.padEnd(7)} ${'나이'.padEnd(7)}`)
console.log(`  ${'─'.repeat(72)}`)

const topN = candidates.slice(0, 10)
for (let rank = 0; rank < topN.length; rank++) {
  const c = topN[rank]
  const mG = allGroups.find(g => g.groupId === c.groupAId) || allGroups.find(g => g.groupId === c.groupBId)
  const fG = allGroups.find(g => g.groupId === c.groupBId) || allGroups.find(g => g.groupId === c.groupAId)
  const mGroup = maleGroups.find(g => g.groupId === c.groupAId || g.groupId === c.groupBId)
  const fGroup = femaleGroups.find(g => g.groupId === c.groupAId || g.groupId === c.groupBId)
  const bd = c.breakdown
  const scoreStr = `${GREEN}${BOLD}${fmt(c.score)}${RESET}`
  const mId = mGroup?.groupId ?? c.groupAId
  const fId = fGroup?.groupId ?? c.groupBId
  console.log(
    `  ${String(rank+1).padEnd(4)} ${scoreStr.padEnd(15)} ${mId.padEnd(8)} ${fId.padEnd(8)} ` +
    `${fmt(bd.appearance).padEnd(7)} ${fmt(bd.personality).padEnd(7)} ${fmt(bd.time).padEnd(7)} ${fmt(bd.scoreBand).padEnd(7)} ${fmt(bd.ageFit).padEnd(7)}`
  )
}

// 5. 상위 3 페어 상세 분석
console.log(`\n${BOLD}[5] 베스트 매칭 상세 분석 (Top 3)${RESET}`)

function findGroup(id) {
  return allGroups.find(g => g.groupId === id)
}

for (let rank = 0; rank < Math.min(3, candidates.length); rank++) {
  const c = candidates[rank]
  const gA = findGroup(c.groupAId)
  const gB = findGroup(c.groupBId)
  const mG = gA.gender === 'male' ? gA : gB
  const fG = gA.gender === 'female' ? gA : gB
  const bd = c.breakdown

  console.log(`\n  ${BOLD}${CYAN}▶ #${rank+1}  ${mG.groupId} (남${mG.size}인) ↔ ${fG.groupId} (여${fG.size}인)  종합 ${fmt(c.score)}${RESET}`)

  // 멤버 정보
  console.log(`  ${DIM}남: ${mG._members.map(m=>`${m.id}(${m.age}세 ${m.dept} 점${m.score})`).join(' | ')}${RESET}`)
  console.log(`  ${DIM}여: ${fG._members.map(m=>`${m.id}(${m.age}세 ${m.dept} 점${m.score})`).join(' | ')}${RESET}`)

  // 점수 breakdown
  const components = [
    { label: '외모 적합도  (×0.40)', value: bd.appearance, weight: 0.40 },
    { label: '성격 호환성  (×0.20)', value: bd.personality, weight: 0.20 },
    { label: '외모 점수대  (×0.10)', value: bd.scoreBand, weight: 0.10 },
    { label: '선호 정합성  (×0.10)', value: bd.weightAlignment, weight: 0.10 },
    { label: '나이 적합도  (×0.10)', value: bd.ageFit, weight: 0.10 },
    { label: '시간 겹침    (×0.10)', value: bd.time, weight: 0.10 },
  ]
  for (const comp of components) {
    const contribution = comp.value * comp.weight
    const barStr = bar(comp.value, 16)
    const contColor = contribution > 0.05 ? GREEN : DIM
    console.log(
      `    ${comp.label.padEnd(22)} ${barStr} ${fmt(comp.value)}  기여 ${contColor}${(contribution).toFixed(3)}${RESET}`
    )
  }
  console.log(`    ${'비대칭 페널티'.padEnd(22)} ${''.padEnd(16)} ${DIM}−${fmt(bd.asymmetryPenalty)}${RESET}`)
  console.log(`    외모 방향: 남→여 ${fmt(bd.appearanceAB)}  여→남 ${fmt(bd.appearanceBA)}`)

  // 시간 겹침 요일
  const overlapDays = WEEKDAYS.filter(d =>
    mG.availability[d]?.length > 0 && fG.availability[d]?.length > 0
  )
  const dayKor = { monday:'월', tuesday:'화', wednesday:'수', thursday:'목', friday:'금', saturday:'토', sunday:'일' }
  console.log(`    가능 요일: ${overlapDays.length > 0 ? overlapDays.map(d=>dayKor[d]).join(' ') : '없음'}`)
}

// 6. 전체 점수 분포
console.log(`\n${BOLD}[6] 후보 점수 분포 (히스토그램)${RESET}`)
if (candidates.length > 0) {
  const bins = 10
  const binSize = (1 - PAIR_SCORE_MIN) / bins
  const hist = Array(bins).fill(0)
  for (const c of candidates) {
    const idx = Math.min(bins - 1, Math.floor((c.score - PAIR_SCORE_MIN) / binSize))
    hist[idx]++
  }
  const maxBin = Math.max(...hist)
  for (let i = 0; i < bins; i++) {
    const lo = (PAIR_SCORE_MIN + i * binSize).toFixed(2)
    const hi = (PAIR_SCORE_MIN + (i+1) * binSize).toFixed(2)
    const barW = maxBin > 0 ? Math.round(hist[i] / maxBin * 30) : 0
    const barStr = '█'.repeat(barW) + '░'.repeat(30 - barW)
    console.log(`  ${lo}–${hi}  ${barStr} ${hist[i]}`)
  }
} else {
  console.log(`  ${YELLOW}후보 없음 — 임계값(${PAIR_SCORE_MIN}) 낮추면 매칭 발생${RESET}`)
}

// 7. 매칭률 요약
console.log(`\n${BOLD}[7] 매칭 통계 요약${RESET}`)
const matchedMGroups = new Set()
const matchedFGroups = new Set()
for (const c of candidates) {
  const mG = maleGroups.find(g => g.groupId === c.groupAId || g.groupId === c.groupBId)
  const fG = femaleGroups.find(g => g.groupId === c.groupAId || g.groupId === c.groupBId)
  if (mG) matchedMGroups.add(mG.groupId)
  if (fG) matchedFGroups.add(fG.groupId)
}
console.log(`  후보 쌍 수:        ${candidates.length} / ${totalPairs} (${pct(candidates.length, totalPairs)}%)`)
console.log(`  매칭 가능 남성그룹: ${matchedMGroups.size} / ${maleGroups.length} (${pct(matchedMGroups.size, maleGroups.length)}%)`)
console.log(`  매칭 가능 여성그룹: ${matchedFGroups.size} / ${femaleGroups.length} (${pct(matchedFGroups.size, femaleGroups.length)}%)`)

if (candidates.length > 0) {
  const avgScore = candidates.reduce((s,c)=>s+c.score,0)/candidates.length
  console.log(`  후보 평균 점수:     ${fmt(avgScore)}`)
  console.log(`  최고 점수:         ${fmt(candidates[0].score)} (${candidates[0].groupAId} ↔ ${candidates[0].groupBId})`)
  console.log(`  최저 합격 점수:    ${fmt(candidates[candidates.length-1].score)}`)
}

// 8. 시나리오 비교 — Forced Match (임계값 낮추면?)
console.log(`\n${BOLD}[8] Forced Match 시뮬레이션 (임계값 0.30, 점수대 ±25)${RESET}`)
const FORCED_SCORE_MIN = 0.30
const FORCED_BAND = 25

function isMatchableForced(a, b) {
  if (a.gender === b.gender) return { ok: false, reason: 'same_gender' }
  if (a.size !== b.size) return { ok: false, reason: 'size_mismatch' }
  const overlap = WEEKDAYS.some(d => a.availability[d]?.length > 0 && b.availability[d]?.length > 0)
  if (!overlap) return { ok: false, reason: 'no_time_overlap' }
  const bandGap = Math.abs(a.avgSelfAppearanceScore - b.avgSelfAppearanceScore)
  if (bandGap > FORCED_BAND) return { ok: false, reason: 'score_band_mismatch' }
  return { ok: true }
}

let forcedCandidates = 0
for (let i = 0; i < allGroups.length; i++) {
  for (let j = i + 1; j < allGroups.length; j++) {
    const a = allGroups[i], b = allGroups[j]
    const m = isMatchableForced(a, b)
    if (!m.ok) continue
    const r = computePairScore(a, b)
    if (r.score >= FORCED_SCORE_MIN) forcedCandidates++
  }
}
console.log(`  Forced Match 후보 수: ${forcedCandidates} (일반 ${candidates.length} → +${forcedCandidates - candidates.length}쌍 추가)`)

// 9. 결론
console.log(`\n${BOLD}${CYAN}══════════════════════════════════════════════════${RESET}`)
console.log(`${BOLD}결론 및 시사점${RESET}`)
const bandRejects = rejectCount['score_band_mismatch'] || 0
const timeRejects = rejectCount['no_time_overlap'] || 0
const threshRejects = rejectCount['below_threshold'] || 0

if (threshRejects > candidates.length * 2) {
  console.log(`  ⚠  임계값(${PAIR_SCORE_MIN})이 너무 높음 → 점수 가중치 재조정 필요 가능성`)
}
if (bandRejects > totalPairs * 0.30) {
  console.log(`  ⚠  외모 점수대 ±${SCORE_BAND_WIDTH} 필터로 ${pct(bandRejects,totalPairs)}% 거절 — 풀 확대 필요 시 SCORE_BAND_WIDTH 상향 검토`)
}
if (timeRejects > totalPairs * 0.15) {
  console.log(`  ⚠  시간 겹침 부재로 ${pct(timeRejects,totalPairs)}% 거절 — 가용시간 입력 UX 개선 또는 요일 유연화 필요`)
}
if (candidates.length === 0) {
  console.log(`  ${RED}${BOLD}매칭 0쌍! 임계값, 점수대, 가중치 전반 재검토 필요${RESET}`)
} else if (candidates.length < 5) {
  console.log(`  ${YELLOW}매칭 후보가 적음 — v1 오픈 시 풀 확보 전략 필요${RESET}`)
} else {
  console.log(`  ${GREEN}✓  매칭 엔진 정상 동작 확인 (${candidates.length}쌍 후보)${RESET}`)
}
console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════${RESET}\n`)
