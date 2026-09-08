import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createCampusEatsMarkerClusters,
  createCampusEatsMarkerLayout,
  summarizeCampusEatsMapCoverage,
} from '../../lib/campus-eats/place-adapter'

test('map coverage accounts for every candidate as either a marker or unresolved', () => {
  const coverage = summarizeCampusEatsMapCoverage(
    ['candidate-a', 'candidate-b', 'candidate-c'],
    ['candidate-a', 'candidate-c'],
  )

  assert.equal(coverage.markerCount, 2)
  assert.equal(coverage.unresolvedCount, 1)
  assert.equal(coverage.totalCandidateCount, 3)
  assert.equal(coverage.markerCount + coverage.unresolvedCount, coverage.totalCandidateCount)
  assert.deepEqual(coverage.resolvedCandidateIds, ['candidate-a', 'candidate-c'])
  assert.deepEqual(coverage.unresolvedCandidateIds, ['candidate-b'])
  assert.equal(coverage.state, 'partial')
})

test('map coverage is complete only when every current candidate has a marker', () => {
  const complete = summarizeCampusEatsMapCoverage(
    ['candidate-a', 'candidate-b'],
    ['candidate-b', 'candidate-a', 'candidate-a', 'not-in-category'],
  )
  const empty = summarizeCampusEatsMapCoverage(['candidate-a', 'candidate-b'], [])

  assert.equal(complete.state, 'complete')
  assert.equal(complete.markerCount, 2)
  assert.equal(complete.unresolvedCount, 0)
  assert.deepEqual(complete.resolvedCandidateIds, ['candidate-a', 'candidate-b'])
  assert.equal(empty.state, 'empty')
  assert.equal(empty.markerCount, 0)
  assert.equal(empty.unresolvedCount, 2)
})

test('overlapping resolved coordinates get distinct display-only marker positions', () => {
  const layout = createCampusEatsMarkerLayout([
    { candidateId: 'chicken-a', latitude: 35.23123, longitude: 129.08456 },
    { candidateId: 'chicken-b', latitude: 35.23123, longitude: 129.08456 },
    { candidateId: 'chicken-c', latitude: 35.23234, longitude: 129.08567 },
  ])

  const chickenA = layout.find((item) => item.candidateId === 'chicken-a')
  const chickenB = layout.find((item) => item.candidateId === 'chicken-b')
  const chickenC = layout.find((item) => item.candidateId === 'chicken-c')

  assert.ok(chickenA)
  assert.ok(chickenB)
  assert.ok(chickenC)
  assert.equal(chickenA.overlapGroupSize, 2)
  assert.equal(chickenB.overlapGroupSize, 2)
  assert.equal(chickenA.displayOffsetApplied, true)
  assert.equal(chickenB.displayOffsetApplied, true)
  assert.notDeepEqual(
    [chickenA.displayLatitude, chickenA.displayLongitude],
    [chickenB.displayLatitude, chickenB.displayLongitude],
  )
  assert.equal(chickenC.overlapGroupSize, 1)
  assert.equal(chickenC.displayOffsetApplied, false)
  assert.equal(chickenC.displayLatitude, chickenC.latitude)
  assert.equal(chickenC.displayLongitude, chickenC.longitude)
})

test('nearby candidate pins become one honest picker cluster instead of stealing each other clicks', () => {
  const clusters = createCampusEatsMarkerClusters([
    { candidateId: 'chicken-1', latitude: 35.230700, longitude: 129.084100 },
    { candidateId: 'chicken-12', latitude: 35.230740, longitude: 129.084160 },
    { candidateId: 'chicken-5', latitude: 35.234000, longitude: 129.089000 },
  ])

  assert.equal(clusters.length, 2)
  assert.deepEqual(clusters[0]?.candidateIds, ['chicken-1', 'chicken-12'])
  assert.equal(clusters[0]?.candidateCount, 2)
  assert.equal(clusters[0]?.requiresPicker, true)
  assert.deepEqual(clusters[1]?.candidateIds, ['chicken-5'])
  assert.equal(clusters[1]?.requiresPicker, false)
})

test('nearby clustering never chain-merges a whole neighborhood or creates an oversized picker', () => {
  const latitudeStep = 40 / 111_320
  const chain = createCampusEatsMarkerClusters([
    { candidateId: 'coffee-a', latitude: 35.230000, longitude: 129.084000 },
    { candidateId: 'coffee-b', latitude: 35.230000 + latitudeStep, longitude: 129.084000 },
    { candidateId: 'coffee-c', latitude: 35.230000 + (latitudeStep * 2), longitude: 129.084000 },
  ])
  const dense = createCampusEatsMarkerClusters(Array.from({ length: 9 }, (_, index) => ({
    candidateId: `dense-${index + 1}`,
    latitude: 35.230000 + ((index % 3) * 0.00001),
    longitude: 129.084000 + (Math.floor(index / 3) * 0.00001),
  })))

  assert.equal(chain.length, 2)
  assert.deepEqual(chain.map((cluster) => cluster.candidateIds), [
    ['coffee-a', 'coffee-b'],
    ['coffee-c'],
  ])
  assert.ok(dense.every((cluster) => cluster.candidateCount <= 4))
  assert.equal(dense.reduce((sum, cluster) => sum + cluster.candidateCount, 0), 9)
})
