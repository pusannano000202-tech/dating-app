'use client'

import { useQuantumLocale } from '@/components/i18n/QuantumLocaleProvider'
import LanguagePicker from '@/components/i18n/LanguagePicker'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, CalendarDays, Check, ChevronDown, Loader2, Plus, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createManualStudyCourse, getDepartmentCourseSuggestions, getDepartmentStudyCoverage, getDepartmentStudyOptions, getStudyCatalogCoverage, getStudyCourse, getStudyCoursePhoto, searchStudyCourses, type StudyCourse } from '@/lib/meetups/study-catalog'
import { parseStudyDiscoveryPreferences, STUDY_DISCOVERY_STORAGE_KEY, type StudyDiscoveryPreferences } from '@/lib/meetups/study-discovery-preferences'
import { getDepartmentCollege, PNU_DEPARTMENT_GROUPS, PNU_DEPARTMENT_REGISTRY, PNU_DEPARTMENTS, searchDepartments } from '@/lib/pnu-departments'
import styles from './department-courses.module.css'

type CoursePick = { id: string; title: string; manual: boolean; department?: string }
type CourseCopy = readonly [ko: string, en: string, ja: string, zh: string]
const PICK_STORAGE_KEY = 'quantum.meetups.course-picks.v1'

// Screen-local copy uses the shared locale; official department/course names stay unchanged.
function useCourseCopy() {
  const { locale } = useQuantumLocale()
  return (...copy: CourseCopy) => copy[{ ko: 0, en: 1, ja: 2, zh: 3 }[locale]]
}

export default function DepartmentCourseDiscovery({ demo = false }: { demo?: boolean }) {
  const { t, locale } = useQuantumLocale()
  const copy = useCourseCopy()
  const [department, setDepartment] = useState(demo ? '미래에너지전공' : '')
  const [year, setYear] = useState<number | undefined>(demo ? 1 : undefined)
  const [profileState, setProfileState] = useState<'loading' | 'ready' | 'auth' | 'unavailable'>(demo ? 'ready' : 'loading')
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(!demo)
  const [departmentQuery, setDepartmentQuery] = useState('')
  const [college, setCollege] = useState('')
  const [picked, setPicked] = useState<CoursePick[]>([])
  const [storageNote, setStorageNote] = useState<CourseCopy | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<CourseCopy | null>(null)
  const profileTouched = useRef(false)
  const searchInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Preview never reads a real profile, saved courses, or writes browser storage.
    if (demo) return
    try {
      const filters = parseStudyDiscoveryPreferences(sessionStorage.getItem(STUDY_DISCOVERY_STORAGE_KEY))
      if (filters) {
        profileTouched.current = true
        setDepartment(filters.department)
        setYear(filters.year)
        setDepartmentPickerOpen(!filters.department)
      }
    } catch { /* Filtering remains usable when tab storage is blocked. */ }
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(PICK_STORAGE_KEY) ?? '[]')
      if (Array.isArray(saved)) {
        const safePicks: CoursePick[] = []
        for (const value of saved.slice(0, 20)) {
          if (!value || typeof value !== 'object' || typeof value.id !== 'string') continue
          const savedDepartment = typeof value.department === 'string' ? value.department.slice(0, 120) : undefined
          if (value.manual === true && typeof value.title === 'string') {
            const manual = createManualStudyCourse(value.title)
            if (manual && value.id === `manual:${manual.title}`) safePicks.push({ id: value.id, title: manual.title, manual: true, department: savedDepartment })
          } else {
            const course = getStudyCourse(value.id)
            if (course) safePicks.push({ id: course.id, title: course.title, manual: false, department: savedDepartment })
          }
        }
        setPicked(safePicks.filter((item, index) => safePicks.findIndex(other => other.id === item.id) === index))
      }
    } catch { setStorageNote(['이 브라우저에서는 선택을 저장할 수 없어요. 현재 화면에서는 계속 고를 수 있어요.', 'This browser cannot save choices. You can keep choosing on this screen.', 'このブラウザでは保存できません。この画面では選択を続けられます。', '此浏览器无法保存选择，仍可在当前页面继续选择。']) }

    const controller = new AbortController()
    let active = true
    const timeout = window.setTimeout(() => controller.abort(), 12000)
    void fetch('/api/profile/basic', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => null) as { profile?: { department?: unknown; year?: unknown } } | null
        if (!active) return
        if (response.status === 401) { setProfileState('auth'); return }
        if (!response.ok || !payload?.profile) { setProfileState('unavailable'); return }
        if (!profileTouched.current) {
          if (typeof payload.profile.department === 'string') { setDepartment(payload.profile.department.slice(0, 120)); setDepartmentPickerOpen(!payload.profile.department.trim()) }
          const profileYear = payload.profile.year
          if (typeof profileYear === 'number' && Number.isInteger(profileYear) && profileYear >= 1 && profileYear <= 6) setYear(profileYear)
        }
        setProfileState('ready')
      })
      .catch(() => { if (active) setProfileState('unavailable') })
      .finally(() => window.clearTimeout(timeout))
    return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
  }, [demo])

  const suggestions = getDepartmentCourseSuggestions({ department, year })
  const programmeOptions = getDepartmentStudyOptions(department)
  const catalogCoverage = getStudyCatalogCoverage()
  const coverage = getDepartmentStudyCoverage(department)
  const supportedYears = [...new Set(getDepartmentCourseSuggestions({ department }).map(item => item.suggestedYear))]
  const coverageDescription = coverage ? copy(coverage.coverageNote, `${coverage.courseCount} verified courses in years ${supportedYears.join(', ')} only. This is a partial mapping, not a complete curriculum or current class schedule.`, `${supportedYears.join('・')}年の確認済み${coverage.courseCount}科目のみ。一部の対応であり、教育課程全体や現在の時間割ではありません。`, `仅核实${supportedYears.join('、')}年级的${coverage.courseCount}门课程。这是部分映射，并非完整培养方案或当前课表。`) : ''
  const registryDescription = copy(PNU_DEPARTMENT_REGISTRY.coverageNote, 'An all-campus directory based on official college pages and 2026 admissions units. Legacy names and integrated entry programs are included; not all graduate departments or curricula are covered.', '公式学部案内と2026年募集単位に基づく全キャンパスの一覧です。旧名称と統合入学課程を含みますが、大学院や教育課程全体を網羅するものではありません。', '根据官方学院指南和2026年招生单位整理所有校区目录，包含旧名称和一体化入学项目，但未覆盖所有研究生专业或培养方案。')
  const departmentMatches = searchDepartments(departmentQuery, PNU_DEPARTMENTS.length).filter(label => !college || getDepartmentCollege(label) === college)
  const visibleDepartments = departmentMatches.slice(0, 8)
  const suggestedCards: CoursePick[] = suggestions.map(item => ({ id: item.course.id, title: item.course.title, manual: false }))
  const departmentPicks = picked.filter(item => item.department === department || (!item.department && suggestions.some(suggestion => suggestion.course.id === item.id)))
  const otherPicks = picked.filter(item => !departmentPicks.includes(item))
  const cards = [...departmentPicks, ...suggestedCards.filter(item => !departmentPicks.some(saved => saved.id === item.id))]
  const visible = showAll ? cards : cards.slice(0, 3)
  const searchResults = searchStudyCourses(query, { department, year })
  const manual = createManualStudyCourse(query)
  const hasExactCourse = Boolean(manual && searchResults.some(course => {
    const normalized = manual.title.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
    return course.title.normalize('NFKC').replace(/\s+/g, '').toLowerCase() === normalized || course.code.toLowerCase() === normalized
  }))

  function savePicks(next: CoursePick[]) {
    setPicked(next)
    if (demo) return
    try { localStorage.setItem(PICK_STORAGE_KEY, JSON.stringify(next)); setStorageNote(null) }
    catch { setStorageNote(['선택은 현재 화면에서만 유지돼요. 브라우저 저장 공간을 확인해 주세요.', 'Choices stay on this screen only. Check browser storage.', '選択はこの画面だけに残ります。ブラウザの保存領域をご確認ください。', '选择仅保留在当前页面，请检查浏览器存储空间。']) }
  }

  function togglePick(course: CoursePick) {
    if (picked.some(item => item.id === course.id)) {
      savePicks(picked.filter(item => item.id !== course.id))
      setStatus([`${course.title}을 내 수업에서 뺐어요.`, `Removed ${course.title} from my courses.`, `${course.title}をマイ授業から外しました。`, `已从我的课程中移除${course.title}。`])
    } else if (picked.length >= 20) {
      setStatus(['수업은 20개까지 골라둘 수 있어요. 필요 없는 수업을 먼저 빼주세요.', 'You can save up to 20 courses. Remove a course first.', '選べる授業は20件までです。先に不要な授業を外してください。', '最多可选择20门课程，请先移除不需要的课程。'])
    } else {
      savePicks([...picked, { ...course, department }])
      setStatus([`${course.title}을 ${demo ? '미리보기 수업' : '이 기기의 내 수업'}에 추가했어요.`, `Added ${course.title} to ${demo ? 'preview courses' : 'my courses on this device'}.`, `${course.title}を${demo ? 'プレビューの授業' : 'この端末のマイ授業'}に追加しました。`, `已将${course.title}加入${demo ? '预览课程' : '此设备的我的课程'}。`])
    }
  }

  function openSearch() {
    setSearchOpen(true)
    window.requestAnimationFrame(() => searchInput.current?.focus())
  }

  function updateCriteria(next: StudyDiscoveryPreferences) {
    profileTouched.current = true
    setDepartment(next.department)
    setYear(next.year)
    setShowAll(false)
    if (demo) return
    try { sessionStorage.setItem(STUDY_DISCOVERY_STORAGE_KEY, JSON.stringify(next)) }
    catch { setStorageNote(['이 브라우저에서는 추천 조건을 저장할 수 없어요. 돌아오면 다시 골라주세요.', 'This browser cannot save filters. Choose them again when returning.', '条件を保存できません。戻ったときに再選択してください。', '此浏览器无法保存筛选条件，返回时请重新选择。']) }
  }

  function selectDepartment(value: string) {
    updateCriteria({ department: value, year })
    setDepartmentPickerOpen(false)
    setDepartmentQuery('')
    setSearchOpen(false)
    setStatus(['추천 기준만 바뀌었어요. 실제 방은 내 프로필의 학교·학과로 연결돼요.', 'Only suggestions changed. Real rooms use the school and department in your profile.', 'おすすめだけを変更しました。実際の部屋はプロフィールの学校・学科につながります。', '仅更改推荐条件，实际房间仍使用个人资料中的学校和专业。'])
  }

  const previewRoom = demo ? () => setStatus(['미리보기예요. 실제 모임 조회·참가·생성이나 프로필 변경은 하지 않아요.', 'Preview only: no real meetup access, joining, creation or profile changes.', 'プレビューです。実際の集まりの表示・参加・作成やプロフィール変更は行いません。', '仅供预览，不会查看、加入、创建实际活动或更改个人资料。']) : undefined

  return <main className={styles.page}>
    <div className={styles.shell}>
      <div className={styles.toolbar}><Link className={styles.back} href="/meetups/department"><ArrowLeft size={18} />{t('meetup.department')}</Link><LanguagePicker compact /></div>
      {locale !== 'ko' ? <p className={styles.contextNote}>{t('locale.partial')}</p> : null}
      <header className={styles.header}>
        <h1>{t('내 수업 같이 공부하기')}</h1>
        <p>{t('배우는 수업부터, 함께할 사람을 만나요.')}</p>
        <p className={styles.coverageNote}>{copy(`자동 추천은 ${catalogCoverage.registeredDepartments}개 학과·전공 중 ${catalogCoverage.supportedDepartments.length}곳의 일부 과목을 제공해요. 모든 학과에서 시간표의 과목명을 직접 입력할 수 있어요.`, `Partial automatic suggestions cover ${catalogCoverage.supportedDepartments.length} of ${catalogCoverage.registeredDepartments} departments. Every department can enter courses from a timetable.`, `${catalogCoverage.registeredDepartments}学科・専攻中${catalogCoverage.supportedDepartments.length}の一部科目をおすすめします。全学科で時間割の科目を直接入力できます。`, `自动推荐覆盖${catalogCoverage.registeredDepartments}个专业中${catalogCoverage.supportedDepartments.length}个的部分课程。所有专业均可直接输入课表中的课程名称。`)}</p>
      </header>

      <section className={styles.context} aria-label={copy('교육과정 추천 기준', 'Course suggestion settings', '授業のおすすめ条件', '课程推荐条件')}>
        <p className={styles.contextLabel}>{t('추천받을 학과')}<span>{copy('부산대학교 · 전체 캠퍼스', 'PNU · All campuses', '釜山大学 · 全キャンパス', '釜山大学 · 所有校区')}</span></p>
        <button type="button" className={styles.departmentSelected} aria-expanded={departmentPickerOpen} aria-controls="study-department-picker" onClick={() => setDepartmentPickerOpen(value => !value)}><BookOpen size={20} /><span><strong>{department || copy('내 학과를 골라주세요', 'Choose your department', '学科を選んでください', '请选择所属专业')}</strong><small>{getDepartmentCollege(department) || copy('학과 이름 또는 단과대학으로 검색', 'Search by department or college', '学科名や学部で検索', '按专业或学院搜索')}</small></span><span className={styles.changeLabel}>{department ? copy('변경', 'Change', '変更', '更改') : copy('찾기', 'Find', '探す', '查找')}<ChevronDown size={15} /></span></button>
        {departmentPickerOpen ? <div id="study-department-picker" className={styles.departmentPicker}>
          <label htmlFor="study-department">{copy('학과 이름 검색', 'Search department names', '学科名を検索', '搜索专业名称')}</label>
          <div className={styles.departmentInput}><Search size={17} /><input id="study-department" maxLength={120} value={departmentQuery} placeholder={copy('예: 기계, 경영, 간호, 생명자원', 'Korean name, e.g. 기계, 경영, 간호', '韓国語名（例：기계、경영、간호）', '韩语名称，例如 기계、경영、간호')} onChange={event => setDepartmentQuery(event.target.value)} /></div>
          <label className={styles.collegeFilter} htmlFor="study-college"><span>{copy('단과대학', 'College', '学部', '学院')}</span><select id="study-college" value={college} onChange={event => setCollege(event.target.value)}><option value="">{copy('전체', 'All', 'すべて', '全部')}</option>{PNU_DEPARTMENT_GROUPS.map(group => <option key={group.college} value={group.college}>{group.college}</option>)}</select></label>
          <ul className={styles.departmentResults}>{visibleDepartments.map(label => <li key={label}><button type="button" aria-pressed={department === label} onClick={() => selectDepartment(label)}><span><strong>{label}</strong><small>{getDepartmentCollege(label)}</small></span>{department === label ? <Check size={17} /> : <ArrowRight size={16} />}</button></li>)}</ul>
          <p className={styles.searchHint}>{departmentMatches.length ? copy(`${departmentMatches.length}개 중 ${visibleDepartments.length}개 표시 · 이름을 입력해 좁혀주세요.`, `Showing ${visibleDepartments.length} of ${departmentMatches.length}. Type a name to narrow the list.`, `${departmentMatches.length}件中${visibleDepartments.length}件を表示。名前で絞り込めます。`, `显示${departmentMatches.length}项中的${visibleDepartments.length}项，可输入名称缩小范围。`) : copy('등록 목록에 없어요. 프로필의 학과명은 유지되며, 과목은 직접 입력할 수 있어요.', 'Not in this directory. Your profile is unchanged; enter a course name directly.', '一覧にありません。プロフィールは変えずに授業名を直接入力できます。', '不在目录中。个人资料不会更改，可直接输入课程名称。')}</p>
        </div> : null}
        <div className={styles.years} role="group" aria-label={copy('교육과정 추천 학년', 'Year for course suggestions', 'おすすめの学年', '推荐课程年级')}>
          {[undefined, 1, 2, 3, 4, 5, 6].map(value => <button key={value ?? 'all'} type="button" aria-pressed={year === value} onClick={() => updateCriteria({ department, year: value })}>{value ? copy(`${value}학년`, `Year ${value}`, `${value}年`, `${value}年级`) : copy('전체', 'All', 'すべて', '全部')}</button>)}
        </div>
        {profileState === 'loading' ? <p className={styles.contextNote}><Loader2 size={13} className={styles.spin} />{copy('내 학과 확인 중 · 직접 선택도 가능해요.', 'Checking your department · You can also choose.', '学科を確認中 · 自分で選択もできます。', '正在确认专业 · 也可自行选择。')}</p> : <p className={styles.contextNote}>{demo ? copy('추천 화면 미리보기 · 실제 프로필 변경 없음', 'Suggestion preview · Profile unchanged', 'おすすめのプレビュー · プロフィール変更なし', '推荐预览 · 不更改个人资料') : profileState === 'ready' ? copy('추천만 변경 · 방은 내 프로필의 학교·학과 기준', 'Suggestions only · Rooms use your profile department', 'おすすめのみ変更 · 部屋はプロフィールの学科が基準', '仅更改推荐 · 房间以个人资料专业为准') : copy('프로필 확인 불가 · 실제 모임에는 로그인·프로필 확인 필요', 'Profile unavailable · Sign in and verify your profile for real meetups', 'プロフィール未確認 · 実際の集まりはログイン・プロフィール確認が必要', '无法确认资料 · 实际活动需要登录并确认个人资料')}</p>}
      </section>

      <section className={styles.courseSection} aria-labelledby="my-study-courses">
        <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>{department ? `${department} · ${year ? copy(`${year}학년`, `Year ${year}`, `${year}年`, `${year}年级`) : copy('전체 학년', 'All years', '全学年', '所有年级')}` : copy('내 학과에서 먼저 골라보기', 'Start with your department', '自分の学科から選ぶ', '先从自己的专业选择')}</p><h2 id="my-study-courses">{t('이번 학기, 같이 풀어요')}</h2></div><button type="button" className={styles.roundButton} aria-label={t('과목 더 찾기')} onClick={openSearch}><Search size={19} /></button></div>

        {coverage ? <p className={styles.coverageNote}>{copy(`공식 교육과정 일부 · 이 기준 ${suggestions.length}과목`, `Partial official curriculum · ${suggestions.length} matching courses`, `公式教育課程の一部 · 該当${suggestions.length}科目`, `部分官方课程 · 符合条件${suggestions.length}门`)}{departmentPicks.length ? copy(` · 골라둔 수업 ${departmentPicks.length}개`, ` · ${departmentPicks.length} saved`, ` · 選択済み${departmentPicks.length}件`, ` · 已选${departmentPicks.length}门`) : ''}</p> : null}
        {programmeOptions.length ? <div className={styles.programmes} aria-label={copy('세부 전공 고르기', 'Choose your programme', '専攻を選ぶ', '选择专业方向')}><BookOpen size={24} /><h3>{copy('어느 전공 수업을 찾으세요?', 'Which programme do you study?', 'どの専攻の授業を探しますか？', '您想找哪个专业的课程？')}</h3><p>{copy('학부에 속한 전공별 교육과정을 미리 준비했어요. 한 번 고르면 해당 전공의 과목을 바로 볼 수 있어요.', 'Courses are prepared for each programme. Choose one to see its curriculum.', '専攻別の授業を用意しました。選ぶと教育課程を表示します。', '已准备各专业方向的课程，选择后即可查看。')}</p>{programmeOptions.map(programme => <button type="button" key={programme} onClick={() => selectDepartment(programme)}><span><strong>{programme}</strong><small>{copy(`공식 교육과정 ${getDepartmentStudyCoverage(programme)?.courseCount ?? 0}과목`, 'Official curriculum', '公式教育課程', '官方培养方案')}</small></span><ArrowRight size={19} /></button>)}</div> : visible.length ? <div className={styles.courseList}>{visible.map(course => <CourseCard key={course.id} course={course} picked={picked.some(item => item.id === course.id)} onToggle={() => togglePick(course)} onDemoOpen={previewRoom} />)}</div> : <div className={styles.empty}><BookOpen size={25} /><strong>{department.trim() ? copy(`${department}${year ? ` ${year}학년` : ''} 과목은 직접 골라주세요`, `Choose courses for ${department}${year ? ` · Year ${year}` : ''}`, `${department}${year ? ` ${year}年` : ''}の授業を選んでください`, `请选择${department}${year ? ` ${year}年级` : ''}的课程`) : copy('내 학과나 수업을 먼저 골라주세요', 'Choose your department or a course first', 'まず学科や授業を選んでください', '请先选择专业或课程')}</strong><p>{coverage ? copy('이 학년의 공식 과목 매핑은 아직 없어요.', 'Official course mapping is not available for this year yet.', 'この学年の公式科目はまだ未対応です。', '尚未提供该年级的官方课程映射。') : copy('이 학과의 공식 교육과정은 아직 과목과 연결하지 않았어요.', 'This department’s official curriculum is not mapped yet.', 'この学科の公式教育課程はまだ科目に対応していません。', '尚未映射该专业的官方课程。')} {copy('내 시간표의 과목명을 입력하면 같은 과 전공 공부방으로 이어져요.', 'Enter a course from your timetable to find your department’s study rooms.', '時間割の科目名を入力すると同じ学科の勉強部屋につながります。', '输入课表中的课程名称，即可前往同专业学习房间。')}</p>{supportedYears.map(supportedYear => <button key={supportedYear} type="button" className={styles.primaryButton} onClick={() => updateCriteria({ department, year: supportedYear })}>{copy(`${supportedYear}학년 공식 과목 ${getDepartmentCourseSuggestions({ department, year: supportedYear }).length}개 보기`, `Year ${supportedYear}: view ${getDepartmentCourseSuggestions({ department, year: supportedYear }).length} official courses`, `${supportedYear}年の公式科目${getDepartmentCourseSuggestions({ department, year: supportedYear }).length}件を見る`, `查看${supportedYear}年级${getDepartmentCourseSuggestions({ department, year: supportedYear }).length}门官方课程`)}<ArrowRight size={16} /></button>)}<button className={supportedYears.length ? styles.clearButton : styles.primaryButton} type="button" onClick={openSearch}>{copy('과목명 직접 입력', 'Enter a course name', '授業名を直接入力', '直接输入课程名称')}<ArrowRight size={16} /></button><a className={styles.clearButton} href="https://onestop.pusan.ac.kr/page?menuCD=000000000000335" target="_blank" rel="noreferrer">{copy('부산대 공식 수강편람 열기', 'Open PNU’s official course catalog', '釜山大学の公式履修案内を開く', '打开釜山大学官方选课目录')}</a></div>}
        {cards.length > 3 ? <button className={styles.showMore} type="button" onClick={() => setShowAll(value => !value)} aria-expanded={showAll}>{showAll ? copy('먼저 3개만 보기', 'Show first 3', '最初の3件を表示', '仅显示前3门') : copy(`과목 ${cards.length}개 모두 보기`, `View all ${cards.length} courses`, `全${cards.length}科目を見る`, `查看全部${cards.length}门课程`)}<ChevronDown size={16} /></button> : null}
        {otherPicks.length ? <details className={styles.otherPicks}><summary>{copy(`다른 추천 기준에서 골라둔 수업 ${otherPicks.length}개`, `${otherPicks.length} courses saved under other settings`, `別の条件で選んだ授業${otherPicks.length}件`, `其他推荐条件下已选${otherPicks.length}门课程`)}</summary><p>{copy('지금 학과의 추천 과목은 아니에요. 이전 선택은 그대로 보관해요.', 'These are not suggestions for this department. Your earlier choices are kept.', '現在の学科のおすすめではありません。以前の選択は保持します。', '这些不是当前专业的推荐课程，之前的选择仍会保留。')}</p><div className={styles.courseList}>{otherPicks.map(course => <CourseCard key={course.id} course={course} picked onToggle={() => togglePick(course)} onDemoOpen={previewRoom} />)}</div></details> : null}
        <p className={styles.selectionNote}><Bookmark size={13} />{demo ? copy('선택은 미리보기 화면에서만 유지돼요.', 'Choices stay in this preview only.', '選択はプレビュー内だけに残ります。', '选择仅保留在预览页面。') : copy('표시한 수업만 이 기기에 저장해요.', 'Only selected courses are saved on this device.', '選んだ授業だけをこの端末に保存します。', '仅将所选课程保存在此设备。')} {copy('실제 수강·방 참여는 별도예요.', 'This does not enroll you or join a room.', '実際の履修・部屋への参加とは別です。', '实际选课和加入房间需要另外操作。')}</p>
        <p className={styles.selectionNote}>{t('전공은 실력 구분 없이 함께 공부해요.')}</p>
        <p className={styles.selectionNote}>{copy('과목 사진은 AI 생성 또는 스터디 활동 예시이며, 실제 수업·참여자 사진이 아니에요.', 'Images are AI-generated or illustrative study scenes, not actual classes or participants.', '写真はAI生成や学習活動の例であり、実際の授業・参加者ではありません。', '图片为AI生成或学习活动示例，并非实际课堂或参与者照片。')}</p>
        {picked.length ? <button type="button" className={styles.clearButton} onClick={() => { savePicks([]); setStatus(['이 기기에 골라둔 수업을 모두 지웠어요.', 'Cleared all saved course choices on this device.', 'この端末の授業の選択をすべて消去しました。', '已清除此设备上所有已选课程。']) }}>{copy('이 기기의 수업 선택 지우기', 'Clear course choices on this device', 'この端末の授業の選択を消去', '清除此设备的课程选择')}</button> : null}
        <p className={styles.status} role="status" aria-live="polite">{status ? copy(...status) : ''}{storageNote ? <span> {copy(...storageNote)}</span> : null}</p>
      </section>

      <section className={styles.searchSection} aria-label={copy('과목 직접 찾기', 'Find courses directly', '授業を直接探す', '直接查找课程')}>
        <button type="button" className={styles.searchToggle} onClick={() => { if (searchOpen) setSearchOpen(false); else openSearch() }} aria-expanded={searchOpen} aria-controls="study-course-search"><Search size={22} /><span><strong>{t('과목 더 찾기')}</strong><small>{copy('재수강 · 복수전공 · 다른 학년 수업도 괜찮아요', 'Retakes, double majors and other years are welcome', '再履修・複数専攻・他学年の授業も選べます', '也可选择重修、双专业和其他年级课程')}</small></span>{searchOpen ? <X size={18} /> : <ArrowRight size={18} />}</button>
        {searchOpen ? <div id="study-course-search" className={styles.searchBody}>
          <label htmlFor="study-course-query">{t('과목명 또는 과목 코드')}</label>
          <div className={styles.searchInput}><Search size={17} /><input ref={searchInput} id="study-course-query" value={query} maxLength={80} placeholder={copy('예: 공학수학, AN1500385', 'e.g. 공학수학, AN1500385', '例：공학수학、AN1500385', '例如 공학수학、AN1500385')} onChange={event => setQuery(event.target.value)} /></div>
          <p className={styles.searchHint}>{copy('공식 확인 목록에서 찾아요. 다른 학과·학년의 과목도 검색돼요.', 'Search verified courses, including other departments and years.', '公式確認済みの科目を検索します。他の学科・学年も対象です。', '搜索已核实的官方课程，包括其他专业和年级。')}</p>
          {searchResults.length ? <ul className={styles.searchResults}>{searchResults.slice(0, 10).map(course => <SearchResult key={course.id} course={course} selected={picked.some(item => item.id === course.id)} onToggle={() => togglePick({ id: course.id, title: course.title, manual: false })} />)}</ul> : query.trim() ? <p className={styles.searchHint}>{copy('공식 확인 목록에 일치하는 과목이 없어요.', 'No matching course in the verified list.', '確認済み一覧に一致する授業はありません。', '已核实的列表中没有匹配课程。')}</p> : null}
          {manual && !hasExactCourse ? <div className={styles.manualCourse}><span><strong>“{manual.title}” · {copy('직접 입력', 'Manual entry', '直接入力', '手动输入')}</strong><small>{copy('공식 과목 코드와 연결되지 않은 사용자 입력이에요.', 'User-entered title, not linked to an official course code.', '公式科目コードと連携していないユーザー入力です。', '用户输入的名称，未关联官方课程代码。')}</small></span><button type="button" aria-label={`${manual.title} · ${picked.some(item => item.id === `manual:${manual.title}`) ? copy('직접 입력 과목 빼기', 'Remove manual course', '入力した授業を外す', '移除手动输入课程') : copy('직접 입력 과목 추가', 'Add manual course', '入力した授業を追加', '添加手动输入课程')}`} onClick={() => togglePick({ id: `manual:${manual.title}`, title: manual.title, manual: true })}>{picked.some(item => item.id === `manual:${manual.title}`) ? <Check size={19} /> : <Plus size={19} />}</button></div> : null}
          {query.length > 0 && !manual ? <p className={styles.searchHint} role="alert">{copy('과목명은 특수 제어문자 없이 80자 이내로 입력해 주세요.', 'Use up to 80 characters, without control characters.', '制御文字を使わず80文字以内で入力してください。', '请输入不含控制字符的课程名称，最多80个字符。')}</p> : null}
        </div> : null}
      </section>

      <button type="button" className={styles.timetableButton} onClick={openSearch}><CalendarDays size={18} />{t('시간표 보며 과목 추가')}</button>
      <p className={styles.timetableNote}>{copy('시간표를 자동으로 가져오지 않아요.', 'We do not import your timetable automatically.', '時間割は自動取得しません。', '不会自动导入课表。')}<br />{copy('내 시간표를 보고 수업 이름만 직접 골라주세요.', 'Check your timetable and choose course names yourself.', '自分の時間割を見ながら授業名を選んでください。', '请对照自己的课表选择课程名称。')}</p>
      <details className={styles.sourceNote}><summary>{copy('학과·추천 과목의 출처와 적용 범위', 'Department and course sources and coverage', '学科・おすすめ科目の出典と対象範囲', '专业与推荐课程的来源和覆盖范围')}</summary>{demo ? <p>{copy('로컬 미리보기 · 학과와 과목 선택 체험 · 실제 프로필·참여자·서버 저장 없음', 'Local preview · Try department and course selection · No real profiles, participants or server storage', 'ローカルプレビュー · 学科と科目の選択体験 · 実際のプロフィール・参加者・サーバー保存なし', '本地预览 · 体验专业和课程选择 · 无真实资料、参与者或服务器保存')}</p> : null}<p>{registryDescription}</p><a href={PNU_DEPARTMENT_REGISTRY.url} target="_blank" rel="noreferrer">{PNU_DEPARTMENT_REGISTRY.title}<ArrowRight size={13} /></a>{coverage ? <><p>{coverageDescription}</p><a href={coverage.url} target="_blank" rel="noreferrer">{coverage.title}<ArrowRight size={13} /></a></> : <p>{copy('이 학과의 공식 과목 매핑은 미지원이에요. 직접 입력한 과목은 공식 코드·교육과정과 연결되지 않아요.', 'Official course mapping is unavailable for this department. Manual entries are not linked to official codes or curricula.', 'この学科の公式科目は未対応です。直接入力は公式コード・教育課程と連携しません。', '暂不支持该专业的官方课程映射。手动输入不会关联官方代码或培养方案。')}</p>}<p>{copy(`확인일 ${PNU_DEPARTMENT_REGISTRY.retrievedAt} · 실제 개설·분반·개인 적용 교육과정은 확인되지 않았어요. 학년은 추천 기준일 뿐 참가 제한이 아니에요.`, `Checked ${PNU_DEPARTMENT_REGISTRY.retrievedAt} · Actual offerings, sections and your curriculum are unverified. Year affects suggestions, not eligibility.`, `確認日 ${PNU_DEPARTMENT_REGISTRY.retrievedAt} · 実際の開講・クラス・個人の適用課程は未確認です。学年はおすすめ条件であり参加制限ではありません。`, `核实日期 ${PNU_DEPARTMENT_REGISTRY.retrievedAt} · 实际开课、分班和个人适用课程尚未核实。年级仅用于推荐，不限制参与。`)}</p></details>
    </div>
  </main>
}

function CourseCard({ course, picked, onToggle, onDemoOpen }: { course: CoursePick; picked: boolean; onToggle: () => void; onDemoOpen?: () => void }) {
  const { t } = useQuantumLocale()
  const copy = useCourseCopy()
  const href = course.manual ? `/meetups/study?course=custom&title=${encodeURIComponent(course.title)}` : `/meetups/study?course=${encodeURIComponent(course.id)}`
  const photo = getStudyCoursePhoto(course.title)
  return <article className={styles.courseCard}>
    <Link href={href} prefetch={!onDemoOpen} onClick={onDemoOpen ? event => { event.preventDefault(); onDemoOpen() } : undefined} className={styles.courseOpen} aria-label={`${course.title} · ${t('모임 보기')}`}>
      <div className={styles.coursePhoto}><Image src={photo.src} alt={copy(photo.description, `${course.title}: illustrative study scene, not an actual class`, `${course.title}：実際の授業ではない学習活動のイメージ`, `${course.title}：学习活动示例，非实际课堂`)} fill sizes="(max-width: 380px) 98px, (max-width: 580px) 116px, 180px" /></div>
      <div className={styles.courseBody}><h3>{course.title}</h3><div className={styles.tags}><span>{picked ? copy('내가 고른 수업', 'My choice', '選んだ授業', '我选择的课程') : copy('교육과정 추천', 'Curriculum pick', '教育課程のおすすめ', '课程推荐')}</span>{course.manual ? <span>{copy('직접 입력', 'Manual entry', '直接入力', '手动输入')}</span> : null}</div><span className={styles.courseAction}>{t('모임 보기')}<ArrowRight size={16} /></span></div>
    </Link>
    <button type="button" className={styles.saveCourse} aria-pressed={picked} aria-label={`${course.title} · ${picked ? copy('내 수업에서 빼기', 'Remove from my courses', 'マイ授業から外す', '从我的课程中移除') : copy('내 수업에 추가', 'Add to my courses', 'マイ授業に追加', '加入我的课程')}`} onClick={onToggle}>{picked ? <Check size={16} /> : <Bookmark size={16} />}<span>{picked ? copy('골라둔 수업', 'Saved course', '選択済み', '已选课程') : copy('수업 골라두기', 'Save course', '授業を選ぶ', '选择课程')}</span></button>
  </article>
}

function SearchResult({ course, selected, onToggle }: { course: StudyCourse; selected: boolean; onToggle: () => void }) {
  const copy = useCourseCopy()
  return <li><span><strong>{course.title}</strong><small>{course.code}</small></span><button type="button" aria-pressed={selected} aria-label={`${course.title} · ${selected ? copy('빼기', 'Remove', '外す', '移除') : copy('추가', 'Add', '追加', '添加')}`} onClick={onToggle}>{selected ? <Check size={19} /> : <Plus size={19} />}</button></li>
}
