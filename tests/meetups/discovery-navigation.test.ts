import assert from 'node:assert/strict'
import test from 'node:test'
import { featuredMeetupIdeas, getMeetupCapacityRecommendation, meetupDiscoveryGroups } from '../../lib/community/catalog'
import { buildMeetupActivityHref, buildMeetupDiscoveryReturnHref, buildMeetupExploreHref, getMeetupDiscoveryActivities, getMeetupDiscoveryGroups, hasLegacyMeetupQuery, readMeetupDiscoveryState } from '../../lib/meetups/discovery-navigation'
import { getActivityRoomDefinition } from '../../lib/meetups/activity-room-contract'

test('the play and achieve entrances expose the approved groups', () => {
  assert.deepEqual(getMeetupDiscoveryGroups('play').map(group => group.id), ['lifestyle', 'games', 'exercise'])
  assert.deepEqual(getMeetupDiscoveryGroups('achieve').map(group => group.id), ['language', 'career', 'project'])
})

test('every existing activity stays discoverable once and study stays separate', () => {
  const play = getMeetupDiscoveryGroups('play').flatMap(group => getMeetupDiscoveryActivities('play', group.id))
  const achieve = getMeetupDiscoveryGroups('achieve').flatMap(group => getMeetupDiscoveryActivities('achieve', group.id))
  const activityIds = [...play, ...achieve].filter(item => item.kind === 'activity').map(item => item.id)
  assert.deepEqual(activityIds.slice().sort(), featuredMeetupIdeas.filter(item => item.topicGroup !== 'major-foundation').map(item => item.id).sort())
  assert.equal(new Set(activityIds).size, activityIds.length)
  assert.ok(play.every(item => item.category !== 'study'))
  assert.ok(achieve.every(item => item.category === 'study'))
  for (const key of ['campus-cafe-chat', 'campus-small-shop', 'evening-neighborhood-walk']) assert.ok(play.some(item => item.id === key))
  assert.deepEqual(getMeetupDiscoveryActivities('play', null), [])
  assert.deepEqual(getMeetupDiscoveryActivities('play', 'project'), [])
  assert.deepEqual(getMeetupDiscoveryActivities('achieve', 'exercise'), [])
})

test('every exercise category is reachable without inventing automatic-room activity keys', () => {
  const exercise = getMeetupDiscoveryActivities('play', 'exercise')
  const categories = meetupDiscoveryGroups.find(group => group.id === 'exercise')!.categories
  assert.deepEqual(exercise.map(item => item.category).sort(), [...categories].sort())
  for (const category of ['soccer', 'baseball']) {
    const item = exercise.find(activity => activity.category === category)!
    assert.equal(item.kind, 'category')
    assert.equal(item.href, `/meetups/browse?scope=exercise&category=${category}&gender_mode=all`)
  }
  for (const idea of featuredMeetupIdeas) {
    if (idea.topicGroup === 'major-foundation') {
      assert.equal(buildMeetupActivityHref(idea.id, 'all'), `/meetups/activities/${idea.id}/rooms?gender_mode=all`)
      continue
    }
    const intent = idea.category === 'study' ? 'achieve' : 'play'
    const item = getMeetupDiscoveryGroups(intent).flatMap(group => getMeetupDiscoveryActivities(intent, group.id)).find(activity => activity.id === idea.id)!
    assert.equal(item.capacity, getMeetupCapacityRecommendation(idea.category))
    assert.equal(item.capacity, getActivityRoomDefinition(idea.id)!.capacity)
    assert.equal(item.href, `/meetups/activities/${idea.id}/rooms?gender_mode=all`)
  }
  assert.equal(buildMeetupActivityHref('made-up-key', 'all'), null)
  assert.equal(buildMeetupActivityHref('../../admin', 'all'), null)
})

test('subgroup and explicit gender survive share, refresh and back-navigation URLs', () => {
  const state = { intent: 'play' as const, group: 'lifestyle', genderMode: 'female_only' as const }
  const href = buildMeetupExploreHref(state)
  assert.equal(href, '/meetups/explore?intent=play&group=lifestyle&gender_mode=female_only')
  assert.deepEqual(readMeetupDiscoveryState(new URL(href, 'https://quantum.test').searchParams), state)
  assert.equal(buildMeetupActivityHref('campus-small-shop', 'female_only'), '/meetups/activities/campus-small-shop/rooms?gender_mode=female_only')
  assert.equal(buildMeetupActivityHref('campus-cafe-chat', 'male_only'), '/meetups/activities/campus-cafe-chat/rooms?gender_mode=male_only')
  assert.equal(buildMeetupExploreHref({ intent: 'achieve', group: null, genderMode: 'all' }), '/meetups/explore?intent=achieve')
})

test('invalid deep-link values fall back to the selected intent and never a wrong group', () => {
  assert.deepEqual(readMeetupDiscoveryState(new URLSearchParams('intent=unknown&group=project&gender_mode=unknown')), { intent: 'play', group: null, genderMode: 'all' })
  assert.deepEqual(readMeetupDiscoveryState(new URLSearchParams('intent=play&group=exercise&gender_mode=male_only'), 'achieve'), { intent: 'achieve', group: null, genderMode: 'male_only' })
  assert.deepEqual(readMeetupDiscoveryState(new URLSearchParams('intent=achieve&group=project')), { intent: 'achieve', group: 'project', genderMode: 'all' })
})

test('legacy entry queries retain the existing hub including array first-value semantics', () => {
  for (const key of ['scope', 'category', 'topic', 'gender_mode', 'created']) {
    assert.equal(hasLegacyMeetupQuery({ [key]: 'existing-value' }), true)
    assert.equal(hasLegacyMeetupQuery({ [key]: ['existing-value', ''] }), true)
    assert.equal(hasLegacyMeetupQuery({ [key]: '' }), false)
    assert.equal(hasLegacyMeetupQuery({ [key]: ['', 'existing-value'] }), false)
    assert.equal(hasLegacyMeetupQuery({ [key]: [] }), false)
  }
  assert.equal(hasLegacyMeetupQuery({}), false)
  assert.equal(hasLegacyMeetupQuery({ intent: 'play', group: 'games', unrelated: 'value' }), false)
  assert.equal(hasLegacyMeetupQuery({ category: undefined }), false)
})

test('gender choices keep the full activity catalogue and carry the chosen room condition', () => {
  for (const genderMode of ['male_only', 'female_only'] as const) {
    for (const intent of ['play', 'achieve'] as const) {
      for (const group of getMeetupDiscoveryGroups(intent)) {
        const activities = getMeetupDiscoveryActivities(intent, group.id, genderMode)
        assert.deepEqual(activities.map(item => item.id), getMeetupDiscoveryActivities(intent, group.id).map(item => item.id))
        for (const item of activities) assert.equal(new URL(item.href, 'https://quantum.test').searchParams.get('gender_mode'), genderMode)
      }
    }
  }
})

test('all activity-room back links restore the discovery subgroup and chosen gender', () => {
  for (const idea of featuredMeetupIdeas) {
    for (const genderMode of ['all', 'male_only', 'female_only'] as const) {
      const href = buildMeetupDiscoveryReturnHref(idea.id, genderMode)
      const url = new URL(href, 'https://quantum.test')
      if (idea.topicGroup === 'major-foundation') {
        assert.equal(url.pathname, '/meetups/department/courses')
        continue
      }
      assert.equal(url.pathname, '/meetups/explore')
      const state = readMeetupDiscoveryState(url.searchParams)
      assert.equal(state.intent, idea.category === 'study' ? 'achieve' : 'play')
      assert.equal(state.genderMode, genderMode)
      if (idea.topicGroup) assert.equal(state.group, idea.topicGroup)
      assert.ok(getMeetupDiscoveryActivities(state.intent, state.group, state.genderMode).some(item => item.id === idea.id))
    }
  }
  assert.equal(buildMeetupDiscoveryReturnHref('not-a-real-activity', 'all'), '/meetups')
})
