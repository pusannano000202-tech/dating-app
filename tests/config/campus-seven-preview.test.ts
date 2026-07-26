import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

test('campus seven visual report uses a development-only route', () => {
  const routePath = join(ROOT, 'app/dev/campus-seven-preview/[scene]/page.tsx')
  assert.equal(existsSync(routePath), true)

  const route = read('app/dev/campus-seven-preview/[scene]/page.tsx')
  assert.match(route, /process\.env\.NODE_ENV !== 'development'/)
  assert.match(route, /notFound\(\)/)
  assert.match(route, /getCampusSevenPreviewScene/)
  assert.match(route, /preview=/)
})

test('preview scenes cover every person-facing decision with fictional local portraits', () => {
  const previewPath = join(ROOT, 'lib/campus-seven/preview.ts')
  assert.equal(existsSync(previewPath), true)

  const preview = read('lib/campus-seven/preview.ts')
  for (const scene of ['waiting', 'day-two-team', 'interest', 'date-request', 'final-choice', 'final-response', 'people', 'safety']) {
    assert.match(preview, new RegExp(`'${scene}'`))
  }
  assert.match(preview, /\/appearance-ideal\/female-64\/FI01\.jpg/)
  assert.match(preview, /\/appearance-ideal\/male-64\/MI01\.jpg/)
  assert.match(preview, /participants: PREVIEW_PARTICIPANTS/)
  assert.match(preview, /getCampusSevenActionAvailability/)
  assert.match(preview, /actionAvailability,/)
})

test('the participant experience can render a read-only preview without production requests', () => {
  const component = read('components/matching/campus-seven/CampusSevenExperience.tsx')

  assert.match(component, /preview\?: CampusSevenExperiencePreview/)
  assert.match(component, /preview\?\.dashboard/)
  assert.match(component, /readOnlyPreview/)
  assert.match(component, /개발 전용 화면 미리보기/)
})
