import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('web shared tokens use the approved Peach Air semantic palette', () => {
  const globals = readSource('app/globals.css')
  const tailwind = readSource('tailwind.config.ts')
  const layout = readSource('app/layout.tsx')
  const manifest = readSource('public/manifest.json')

  assert.match(globals, /--boot-canvas-rgb:\s*255 249 246;/)
  assert.match(globals, /--boot-soft-rgb:\s*252 236 230;/)
  assert.match(globals, /--boot-primary-rgb:\s*185 75 63;/)
  assert.match(globals, /--boot-primary-dark-rgb:\s*150 61 52;/)
  assert.match(globals, /--boot-coral-rgb:\s*217 107 93;/)
  assert.match(globals, /--boot-info-rgb:\s*82 113 129;/)
  assert.match(globals, /--boot-info-soft-rgb:\s*232 240 243;/)
  assert.match(globals, /--boot-ink-rgb:\s*41 35 33;/)
  assert.match(globals, /--boot-body-rgb:\s*102 92 88;/)
  assert.match(globals, /--boot-muted-rgb:\s*139 126 120;/)
  assert.match(globals, /--boot-hairline-rgb:\s*234 217 210;/)
  assert.match(tailwind, /'primary-dark':\s*'rgb\(var\(--boot-primary-dark-rgb\)/)
  assert.match(tailwind, /info:\s*'rgb\(var\(--boot-info-rgb\)/)
  assert.match(tailwind, /'info-soft':\s*'rgb\(var\(--boot-info-soft-rgb\)/)
  assert.match(layout, /themeColor:\s*'#FFF9F6'/)
  assert.match(manifest, /"background_color":\s*"#FFF9F6"/)
  assert.match(manifest, /"theme_color":\s*"#B94B3F"/)
})

test('school selection keeps identity data without replacing the product palette', () => {
  const schoolTheme = readSource('lib/school-theme.ts')
  const applyFunction = schoolTheme.slice(
    schoolTheme.indexOf('export function applySchoolThemeToDocument'),
    schoolTheme.indexOf('export const SORTED_SCHOOL_THEMES'),
  )

  assert.doesNotMatch(applyFunction, /school\.canvas/)
  assert.doesNotMatch(applyFunction, /school\.soft/)
  assert.doesNotMatch(applyFunction, /school\.primary/)
  assert.doesNotMatch(applyFunction, /school\.coral/)
  assert.doesNotMatch(applyFunction, /school\.amber/)
  assert.match(applyFunction, /--boot-preview-school/)
})

test('Expo shell mirrors Peach Air and uses coral for active navigation', () => {
  const tokens = readSource('apps/mobile/src/theme/tokens.ts')
  const appJson = readSource('apps/mobile/app.json')
  const tabs = readSource('apps/mobile/app/(tabs)/_layout.tsx')

  assert.match(tokens, /canvas:\s*'#FFF9F6'/)
  assert.match(tokens, /surfaceMuted:\s*'#FCECE6'/)
  assert.match(tokens, /ink:\s*'#292321'/)
  assert.match(tokens, /body:\s*'#665C58'/)
  assert.match(tokens, /muted:\s*'#8B7E78'/)
  assert.match(tokens, /line:\s*'#EAD9D2'/)
  assert.match(tokens, /action:\s*'#B94B3F'/)
  assert.match(tokens, /information:\s*'#527181'/)
  assert.doesNotMatch(appJson, /#123249|#082438/)
  assert.match(tabs, /tabBarActiveTintColor:\s*colors\.action/)
})

test('primary destinations no longer hardcode the obsolete mint canvas or blue brand link', () => {
  const primaryDestinations = [
    'app/community/page.tsx',
    'components/community/HotCommunityBoard.tsx',
    'components/community/CommunityBoard.tsx',
    'components/meetups/MeetupHub.tsx',
    'components/meetups/CreateMeetupForm.tsx',
    'app/meetups/create/page.tsx',
    'components/matching/QuantumEventWheel.tsx',
    'components/matching/QuantumMatchDiscovery.tsx',
    'app/profile/edit/page.tsx',
  ].map(readSource)

  for (const source of primaryDestinations) {
    assert.doesNotMatch(source, /#F4F6F5/)
    assert.doesNotMatch(source, /#1D5C8B/)
  }

  const communitySpotlight = readSource('components/community/CommunitySpotlight.tsx')
  const meetupCylinder = readSource('components/meetups/MeetupIdeaCylinder.tsx')

  assert.doesNotMatch(communitySpotlight, /#173B3A|#BED35B/)
  assert.doesNotMatch(meetupCylinder, /#40C7BA|#16A69A/)
})
