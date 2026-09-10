import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {isAppTabActive} from '../../lib/navigation/app-tabs.ts'

const tabs=['/','/match','/meetups','/community','/chat','/profile/edit']
test('legacy and canonical department league routes select only meetups',()=>{
  for(const pathname of ['/community/department','/community/department/records','/meetups/league','/meetups/challenges']) {
    assert.deepEqual(tabs.filter(href=>isAppTabActive(pathname,href)),['/meetups'],pathname)
  }
})
test('other product sections retain exactly one active tab without prefix collisions',()=>{
  for(const [pathname,expected] of [['/','/'],['/community/voice','/community'],['/community/campus-eats','/community'],['/community/departmental','/community'],['/match','/match'],['/tonight','/match'],['/calendar','/match'],['/chat/example','/chat'],['/profile/relationship','/profile/edit']]) {
    assert.deepEqual(tabs.filter(href=>isAppTabActive(pathname,href)),[expected],pathname)
  }
})
test('meetup entry and shared nav consume the canonical league route and section resolver',()=>{
  const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8')
  assert.match(read('components/navigation/AppBottomNav.tsx'),/isAppTabActive\(pathname, href\)/)
  for(const file of ['components/meetups/DepartmentChallengeDiscovery.tsx','components/meetups/DepartmentChallengeEntry.tsx']) {
    assert.match(read(file),/\/meetups\/league\?category=/)
    assert.doesNotMatch(read(file),/href[^\n]*\/community\/department/)
  }
  assert.match(read('app/meetups/league/page.tsx'),/community\/department\/page/)
})
