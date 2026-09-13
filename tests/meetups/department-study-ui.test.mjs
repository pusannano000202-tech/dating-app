import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { baseMessages, formatMessage } from '../../lib/i18n/messages.ts'
import { meetupMessages } from '../../lib/i18n/meetup-messages.ts'

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('course demo renders navigation, year controls and card actions in all four selected locales', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const nodeRequire = createRequire(import.meta.url)
  let locale = 'ko'
  const cache = new Map()
  function load(path) {
    if (cache.has(path)) return cache.get(path)
    const compiled = { exports: {} }
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const require = name => {
      if (name.includes('QuantumLocaleProvider')) return { useQuantumLocale: () => ({ locale, t: (key, params) => formatMessage({ ...baseMessages, ...meetupMessages }, locale, key, params) }) }
      if (name.includes('LanguagePicker')) return { default: () => null }
      if (name === 'next/link') return { default: ({ href, children, prefetch: _prefetch, ...props }) => React.createElement('a', { href, ...props }, children) }
      if (name === 'next/image') return { default: ({ fill: _fill, ...props }) => React.createElement('img', props) }
      if (name.endsWith('.css')) return { default: new Proxy({}, { get: (_, key) => String(key) }) }
      if (name.startsWith('@/') || name.startsWith('.')) {
        const local = name.startsWith('@/') ? resolve(root, name.slice(2)) : resolve(dirname(path), name)
        return load(existsSync(local) ? local : `${local}.ts`)
      }
      return nodeRequire(name)
    }
    new Function('require', 'module', 'exports', code)(require, compiled, compiled.exports)
    cache.set(path, compiled.exports)
    return compiled.exports
  }
  const Component = load(resolve(root, 'components/meetups/DepartmentCourseDiscovery.tsx')).default
  for (const [next, heading, back, year, action] of [
    ['ko', '내 수업 같이 공부하기', '우리 과끼리', '1학년', '모임 보기'],
    ['en', 'Study my courses together', 'My department', 'Year 1', 'Browse meetups'],
    ['ja', '同じ授業を一緒に学ぼう', '同じ学科で', '1年', '集まりを見る'],
    ['zh', '一起学习我的课程', '同专业的我们', '1年级', '浏览活动'],
  ]) {
    locale = next
    const html = renderToStaticMarkup(React.createElement(Component, { demo: true }))
    for (const expected of [heading, back, year, action, '공학미적분학']) assert.ok(html.includes(expected), `${next}: ${expected}`)
    if (next !== 'ko') {
      assert.ok(!html.includes('>모임 보기<'), `${next}: action must not stay Korean`)
      assert.ok(!html.includes('>우리 과끼리<'), `${next}: navigation must not stay Korean`)
    }
  }
})

test('department entry preserves three distinct working routes and existing social list', () => {
  const source = read('components/meetups/DepartmentMeetupDiscovery.tsx')
  for (const route of ['courses', 'mentoring', 'social']) {
    assert.ok(source.includes(`/meetups/department/${route}`))
    assert.ok(existsSync(new URL(`../../app/meetups/department/${route}/page.tsx`, import.meta.url)))
  }
  assert.ok(source.includes('/api/meetups?scope_type=department&limit=30'))
  assert.ok(source.includes('parseDepartmentMeetups'))
  assert.ok(source.includes('멘토링 관련 모집'))
  assert.ok(source.includes('키워드 기준'))
})

test('course discovery keeps personal choices separate from enrollment and authentic counts', () => {
  const source = read('components/meetups/DepartmentCourseDiscovery.tsx')
  assert.ok(source.includes('cards.slice(0, 3)'))
  assert.ok(source.includes('getDepartmentCourseSuggestions({ department, year })'))
  assert.ok(source.includes('searchStudyCourses(query, { department, year })'))
  assert.ok(source.includes('hasExactCourse'))
  assert.ok(source.includes('실제 수강·방 참여는 별도'))
  assert.ok(source.includes('시간표를 자동으로 가져오지 않아요'))
  assert.ok(source.includes('이 기기의 수업 선택 지우기'))
  assert.ok(source.includes('encodeURIComponent(course.id)'))
  assert.ok(source.includes('encodeURIComponent(course.title)'))
  assert.ok(!source.includes('모집 중'))
  assert.ok(!source.includes('method:'))
})

test('all-department picker stays compact, scopes saved choices, and preview never fetches or persists profile data', () => {
  const source = read('components/meetups/DepartmentCourseDiscovery.tsx')
  assert.ok(source.includes('departmentMatches.slice(0, 8)'))
  assert.ok(source.includes('PNU_DEPARTMENT_GROUPS.map'))
  assert.ok(source.includes('getDepartmentStudyCoverage(department)'))
  assert.ok(source.includes('item.department === department'))
  assert.ok(source.includes('다른 추천 기준에서 골라둔 수업'))
  assert.ok(source.indexOf('if (demo) return') < source.indexOf('localStorage.getItem'))
  const save = source.slice(source.indexOf('function savePicks('), source.indexOf('function togglePick('))
  assert.ok(save.indexOf('if (demo) return') < save.indexOf('localStorage.setItem'))
  assert.ok(source.includes('event.preventDefault(); onDemoOpen()'))
  assert.ok(source.includes('prefetch={!onDemoOpen}'))
  assert.ok(source.includes('실제 방은 내 프로필의 학교·학과'))
  assert.ok(!source.includes('setLevel'))
  for (const file of ['DepartmentCourseDiscovery.tsx', 'StudyRoomExperience.tsx', 'StudySessionPanel.tsx']) {
    const component = read(`components/meetups/${file}`)
    assert.ok(component.includes('getStudyCoursePhoto('), file)
    assert.ok(component.includes('src={photo.src}'), file)
  }
})

test('create deep links prefill editable scope/title without trusting a supplied department', () => {
  const source = read('components/meetups/CreateMeetupForm.tsx')
  assert.ok(source.includes("searchParams.get('scope') === 'department' ? 'department' : 'school'"))
  assert.ok(source.includes("searchParams.get('title')"))
  assert.ok(source.includes('useState<MeetupScope>(initialScope)'))
  assert.ok(source.includes('scope_type: scopeType'))
  assert.ok(!source.includes("searchParams.get('department')"))
})

test('study panel fixture is dev-offline-only and cannot transmit or persist mock activity', () => {
  const route = read('app/meetups/study-preview/page.tsx')
  const preview = read('components/qa/StudyRoomPreview.tsx')
  assert.ok(route.includes("process.env.NODE_ENV !== 'development'"))
  assert.ok(route.includes("process.env.QUANTUM_LOCAL_RUNTIME_MODE !== 'offline-ui'"))
  assert.ok(route.includes('notFound()'))
  assert.ok(preview.includes('<StudySessionPanel'))
  assert.ok(preview.includes('parseStudyRoomDetail(room)'))
  assert.ok(preview.includes('로컬 화면 검수 · 예시 인원 · 서버 저장 없음'))
  assert.ok(preview.includes('다른 참여자의 확인을 자동으로 만들거나 약속을 확정하지 않아요'))
  for (const unsafe of ['fetch(', 'localStorage', 'sessionStorage', 'createSupabase', 'XMLHttpRequest']) assert.ok(!preview.includes(unsafe), unsafe)
})
