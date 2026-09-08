import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  getSocialMeetupCategories,
  socialMeetupDiscoveryOptions,
} from '../../lib/community/social-meetup-discovery'
import { featuredMeetupIdeas } from '../../lib/community/catalog'

test('social discovery offers male, female, and mixed recommendation lanes without access control', () => {
  assert.deepEqual(socialMeetupDiscoveryOptions.map((option) => option.id), [
    'male-social',
    'female-social',
    'mixed-social',
  ])
  const maleCategories = getSocialMeetupCategories('male-social')
  const femaleCategories = getSocialMeetupCategories('female-social')
  assert.ok(maleCategories)
  assert.ok(femaleCategories)
  assert.ok(maleCategories.includes('basketball'))
  assert.ok(maleCategories.includes('gaming'))
  assert.ok(femaleCategories.includes('dining'))
  assert.ok(femaleCategories.includes('walking'))
  assert.equal(getSocialMeetupCategories('mixed-social'), null)

  assert.deepEqual(
    socialMeetupDiscoveryOptions.map((option) => option.imageSrc),
    [
      '/images/meetups/social-male-v1.png',
      '/images/meetups/social-female-v1.png',
      '/images/meetups/social-mixed-v1.png',
    ],
  )
  assert.ok(
    socialMeetupDiscoveryOptions.every((option) => option.imageAlt.trim().length > 0),
    'every recommendation card needs a meaningful people-photo alt',
  )
})

test('female social recommendations have distinct cafe, shopping, and walking cards', () => {
  const femaleCategories = getSocialMeetupCategories('female-social') ?? []
  const femaleIdeas = featuredMeetupIdeas.filter((idea) => femaleCategories.includes(idea.category))

  assert.ok(femaleIdeas.some((idea) => idea.id === 'campus-cafe-chat'))
  assert.ok(femaleIdeas.some((idea) => idea.id === 'campus-small-shop'))
  assert.ok(femaleIdeas.some((idea) => idea.id === 'evening-neighborhood-walk'))
  assert.ok(femaleIdeas.every((idea) => idea.imageSrc.length > 0))
})

test('general meetups keep the standalone night basketball idea', () => {
  const basketball = featuredMeetupIdeas.find((idea) => idea.id === 'night-basketball')

  assert.ok(basketball)
  assert.equal(basketball.category, 'basketball')
  assert.equal(basketball.imageSrc, '/images/meetups/meetup-basketball.webp')
})

test('meetup hub labels the split as recommendations after actual recruiting and keeps it out of eligibility', () => {
  const source = readFileSync('components/meetups/MeetupHub.tsx', 'utf8')
  const catalog = readFileSync('lib/community/social-meetup-discovery.ts', 'utf8')

  assert.match(catalog, /남성 친목/)
  assert.match(catalog, /여성 친목/)
  assert.match(catalog, /혼성 친목/)
  assert.match(source, /socialMeetupDiscoveryOptions\.map/)
  assert.match(source, /추천/)
  assert.match(source, /성별 제한이 아니라/)
  assert.match(catalog, /does not control a meetup's gender_mode/)
  assert.match(source, /function chooseSocialLane\(nextLane: SocialMeetupDiscoveryId\)/)
  assert.match(source, /setSocialLane\(nextLane\)/)
  assert.match(source, /setDiscoveryScope\('all'\)/)
  assert.match(source, /setCategory\('all'\)/)
  assert.match(source, /setStudyTopic\('all'\)/)

  const actualMeetupsIndex = source.indexOf('참여할 모임')
  const recommendationsIndex = source.indexOf('친목 추천')
  assert.ok(actualMeetupsIndex >= 0)
  assert.ok(recommendationsIndex > actualMeetupsIndex, 'recommendations must follow actual recruiting')
})

test('category reset handlers return recommendation browsing to the mixed all-activities lane', () => {
  const source = readFileSync('components/meetups/MeetupHub.tsx', 'utf8')
  const mixedResetCount = source.match(/setSocialLane\('mixed-social'\)/g)?.length ?? 0

  assert.equal(mixedResetCount, 2, 'the all and discovery-group handlers must each reset the recommendation lane')
})

test('photo card clicks reach the card and offscreen focus cannot scroll the clipped carousel', () => {
  const source = readFileSync('components/meetups/MeetupIdeaCylinder.tsx', 'utf8')
  assert.doesNotMatch(source, /setPointerCapture/, 'parent capture retargets the click away from the photo button')
  assert.match(source, /onClickCapture/)
  assert.match(source, /suppressSwipeClick/)
  assert.match(source, /relative mt-4 overflow-clip/)
})
