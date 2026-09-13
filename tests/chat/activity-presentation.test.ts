import test from 'node:test'
import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
import {getSocialActivityPresentation} from '../../lib/social/activity-presentation'

test('language activity reuses the photo and category from discovery, not its broad study category',()=>{
  const view=getSocialActivityPresentation({kind:'activity_room',activity_key:'language-speaking-study'})
  assert.equal(view.categoryLabel,'어학')
  assert.equal(view.imageSrc,'/images/meetups/meetup-cafe-friends-v1.webp')
  assert.match(view.activityLabel,/OPIc/)
})
test('custom room name cannot impersonate an activity; canonical metadata is authoritative',()=>{
  assert.equal(getSocialActivityPresentation({kind:'meetup',category:'walking'}).categoryLabel,'산책')
  assert.equal(getSocialActivityPresentation({kind:'meetup',activity_key:'unknown'}).categoryLabel,'모임')
})
test('all supported room families have real local activity assets',()=>{
  for(const room of [{kind:'league_team',sport:'lol'},{kind:'league_match',sport:'football'},{kind:'study_room',course_key:'pnu:AN1600527'},{kind:'mentoring'},{kind:'meetup',category:'baseball'}]){
    const view=getSocialActivityPresentation(room)
    assert.ok(existsSync('public'+view.imageSrc),view.imageSrc)
    assert.ok(view.imageAlt)
  }
  assert.equal(getSocialActivityPresentation({kind:'study_room',course_key:'pnu:AN1600527'}).imageSrc,'/social-scenes/course-calculus.png')
})
