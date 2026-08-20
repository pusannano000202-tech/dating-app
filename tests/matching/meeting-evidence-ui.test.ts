import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('web match detail exposes one evidence upload that becomes the participant album photo', () => {
  const component = fs.readFileSync(
    path.join(process.cwd(), 'components/matching/MeetingEvidencePanel.tsx'),
    'utf8',
  )
  const matchPage = fs.readFileSync(path.join(process.cwd(), 'app/match/[id]/page.tsx'), 'utf8')

  assert.match(component, /\/api\/matches\/\$\{encodeURIComponent\(matchId\)\}\/album/)
  assert.match(component, /\/api\/matches\/\$\{encodeURIComponent\(matchId\)\}\/evidence-photo/)
  assert.match(component, /formData\.append\('photo'/)
  assert.match(component, /참가 확인과 참가자 앨범에 함께 저장/)
  assert.match(component, /사진 한 장만으로 보증금 제재를 결정하지 않아요/)
  assert.match(component, /accept="image\/jpeg,image\/png,image\/webp"/)
  assert.match(matchPage, /<MeetingEvidencePanel/)
})

test('development preview renders the evidence panel without claiming remote persistence', () => {
  const preview = fs.readFileSync(
    path.join(process.cwd(), 'app/dev/meeting-evidence-preview/page.tsx'),
    'utf8',
  )
  assert.match(preview, /MeetingEvidencePanel/)
  assert.match(preview, /devPreview/)
  assert.match(preview, /미리보기 데이터는 저장되지 않아요/)
})
