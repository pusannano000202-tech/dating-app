import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getCampusEatsFixtureIncludeStatus,
  getCampusEatsCategoryResponse,
  resolveCampusEatsCategoryId,
  selectIncludedCandidates,
} from '../../lib/campus-eats/repository'
import {
  readCampusEatsUrlState,
  writeCampusEatsUrlState,
} from '../../lib/campus-eats/url-state'

test('Campus Eats repository returns only included restaurants with a stable restaurant_id', () => {
  const response = getCampusEatsCategoryResponse('donkatsu')

  assert.ok(response)
  assert.equal(response.category.id, 'donkatsu')
  assert.equal(response.candidates.length, 14)
  assert.ok(response.candidates.every((candidate) => candidate.include_status === 'include'))
  assert.ok(response.candidates.every((candidate) => candidate.restaurant_id === candidate.id))
  assert.equal(new Set(response.candidates.map((candidate) => candidate.restaurant_id)).size, response.candidates.length)
})

test('Campus Eats repository fail-closes candidates without an explicit include status', () => {
  const included = selectIncludedCandidates([
    { id: 'restaurant-live', include_status: 'include' as const },
    { id: 'restaurant-hold', include_status: 'hold' as const },
    { id: 'restaurant-missing-status' },
    { id: 'restaurant-unknown-status', include_status: 'approved' as unknown as 'include' },
  ])

  assert.deepEqual(included, [{ id: 'restaurant-live', include_status: 'include' }])
})

test('Campus Eats fixture defaults unknown candidates to hold and only exposes the approved bank', () => {
  assert.equal(
    getCampusEatsFixtureIncludeStatus('pnu:store:001:donkatsu'),
    'include',
  )
  assert.equal(getCampusEatsFixtureIncludeStatus('pnu:coffee:unreviewed-new-store'), 'hold')
})

test('Campus Eats repository exposes every approved food category with its verified count', () => {
  const expectedCounts = {
    donkatsu: 14,
    pizza: 12,
    chicken: 14,
    'coffee-main': 17,
    'coffee-north': 13,
    gukbap: 16,
    milmyeon: 8,
  } as const

  for (const [categoryId, expectedCount] of Object.entries(expectedCounts)) {
    const response = getCampusEatsCategoryResponse(categoryId as keyof typeof expectedCounts)
    assert.ok(response)
    assert.equal(response.candidates.length, expectedCount)
  }
})

test('Campus Eats API compatibility maps the retired combined coffee category to the main-gate bracket', () => {
  assert.equal(resolveCampusEatsCategoryId('coffee'), 'coffee-main')
  assert.equal(resolveCampusEatsCategoryId('coffee-north'), 'coffee-north')
  assert.equal(resolveCampusEatsCategoryId('unsupported'), null)
})

test('Campus Eats URL state keeps category, selection, and ranking rail together', () => {
  const state = readCampusEatsUrlState('?category=coffee-north&selected=pnu%3Astore%3A039%3Acoffee-north&list=closed&mode=map')

  assert.deepEqual(state, {
    categoryId: 'coffee-north',
    selectedRestaurantId: 'pnu:store:039:coffee-north',
    rankingOpen: false,
    mode: 'map',
  })

  assert.equal(
    writeCampusEatsUrlState(state),
    '?category=coffee-north&selected=pnu%3Astore%3A039%3Acoffee-north&list=closed&mode=map',
  )
})

test('Campus Eats legacy coffee links preserve the selected store while routing to its zone', () => {
  assert.deepEqual(
    readCampusEatsUrlState('?category=coffee&selected=pnu%3Astore%3A039%3Acoffee&list=open&mode=map'),
    {
      categoryId: 'coffee-north',
      selectedRestaurantId: 'pnu:store:039:coffee-north',
      rankingOpen: true,
      mode: 'map',
    },
  )

  assert.equal(readCampusEatsUrlState('?category=coffee').categoryId, 'coffee-main')
})
