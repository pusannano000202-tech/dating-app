import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  SCORE_BANDS,
  applyAnchorReview,
  selectNeighborAnchors,
  summarizeAnchorReviews,
  type AppearanceAnchor,
} from '../../lib/profile/appearance-calibration'

function anchor(
  anchorId: string,
  genderBank: 'female' | 'male',
  targetScore: number,
  reviewStatus: AppearanceAnchor['reviewStatus'] = 'approved',
  reviewerScore = targetScore
): AppearanceAnchor {
  return {
    anchorId,
    genderBank,
    targetScore,
    reviewerScore,
    reviewStatus,
    imagePath: `/appearance-calibration-v2/anchors/${anchorId}.png`,
  }
}

test('calibration score bands keep the approved low-end checkpoints', () => {
  assert.deepEqual(SCORE_BANDS, [5, 15, 25, 30, 40, 50, 70, 85, 95])
})

test('neighbor selection uses only approved anchors from the requested gender bank', () => {
  const anchors = [
    anchor('female-25-a', 'female', 25),
    anchor('female-30-a', 'female', 30),
    anchor('female-35-pending', 'female', 35, 'pending'),
    anchor('female-40-excluded', 'female', 40, 'excluded'),
    anchor('male-30-a', 'male', 30),
  ]

  assert.deepEqual(
    selectNeighborAnchors(anchors, {
      genderBank: 'female',
      estimatedScore: 33,
      limit: 3,
    }).map((item) => item.anchorId),
    ['female-30-a', 'female-25-a']
  )
})

test('neighbor selection uses reviewer score and has stable tie ordering', () => {
  const anchors = [
    anchor('female-40-b', 'female', 40, 'approved', 35),
    anchor('female-30-b', 'female', 30, 'approved', 30),
    anchor('female-40-a', 'female', 40, 'approved', 35),
    anchor('female-25-a', 'female', 25, 'approved', 25),
  ]

  assert.deepEqual(
    selectNeighborAnchors(anchors, {
      genderBank: 'female',
      estimatedScore: 32.5,
      limit: 3,
    }).map((item) => item.anchorId),
    ['female-30-b', 'female-40-a', 'female-40-b']
  )
})

test('neighbor selection never returns more than three anchors', () => {
  const anchors = SCORE_BANDS.map((score) =>
    anchor(`male-${score}-a`, 'male', score)
  )

  assert.equal(
    selectNeighborAnchors(anchors, {
      genderBank: 'male',
      estimatedScore: 50,
      limit: 99,
    }).length,
    3
  )
})

test('review actions clamp score and update review status', () => {
  const pending = anchor('female-5-a', 'female', 5, 'pending', 5)

  assert.deepEqual(applyAnchorReview(pending, { type: 'lower' }), {
    ...pending,
    reviewerScore: 0,
    reviewStatus: 'pending',
  })
  assert.deepEqual(applyAnchorReview(pending, { type: 'raise' }), {
    ...pending,
    reviewerScore: 10,
    reviewStatus: 'pending',
  })
  assert.deepEqual(applyAnchorReview(pending, { type: 'approve' }), {
    ...pending,
    reviewStatus: 'approved',
  })
  assert.deepEqual(applyAnchorReview(pending, { type: 'exclude' }), {
    ...pending,
    reviewStatus: 'excluded',
  })
  assert.deepEqual(applyAnchorReview(pending, { type: 'set-score', score: 101 }), {
    ...pending,
    reviewerScore: 100,
    reviewStatus: 'pending',
  })
})

test('review summary reports each state and completion progress', () => {
  assert.deepEqual(
    summarizeAnchorReviews([
      anchor('female-25-a', 'female', 25, 'approved'),
      anchor('female-25-b', 'female', 25, 'excluded'),
      anchor('female-30-a', 'female', 30, 'pending'),
    ]),
    {
      total: 3,
      approved: 1,
      excluded: 1,
      pending: 1,
      reviewed: 2,
    }
  )
})

test('development review board keeps calibration local and production-inaccessible', () => {
  const appRoot = process.cwd()
  const routePath = join(
    appRoot,
    'app',
    'dev',
    'appearance-calibration',
    'page.tsx'
  )
  const clientPath = join(
    appRoot,
    'app',
    'dev',
    'appearance-calibration',
    'AppearanceCalibrationReview.tsx'
  )
  const manifestPath = join(
    appRoot,
    'public',
    'appearance-calibration-v2',
    'anchors.json'
  )

  assert.equal(existsSync(routePath), true)
  assert.equal(existsSync(clientPath), true)
  assert.equal(existsSync(manifestPath), true)

  const routeSource = readFileSync(routePath, 'utf8')
  const clientSource = readFileSync(clientPath, 'utf8')
  const anchors = JSON.parse(readFileSync(manifestPath, 'utf8')) as AppearanceAnchor[]

  assert.match(routeSource, /dynamic\s*=\s*['"]force-dynamic['"]/)
  assert.match(routeSource, /process\.env\.NODE_ENV/)
  assert.match(routeSource, /notFound/)
  assert.match(clientSource, /localStorage/)
  assert.match(clientSource, /new Blob/)
  assert.match(clientSource, /applyAnchorReview/)
  const batchOneIds = [
    'female-low-b1-01',
    'female-low-b1-02',
    'female-low-b1-03',
    'female-low-b1-04',
    'female-low-b1-05',
  ]
  const anchorIds = new Set(anchors.map((item) => item.anchorId))

  assert.equal(anchors.length, 41)
  assert.equal(
    anchors.filter((item) => item.genderBank === 'female').length,
    23
  )
  assert.equal(
    batchOneIds.every((anchorId) => anchorIds.has(anchorId)),
    true
  )
  assert.equal(anchors.every((item) => item.reviewStatus === 'pending'), true)
})

test('exported human review keeps a complete private approved anchor bank', () => {
  const approvedPath = join(
    process.cwd(),
    'data',
    'appearance-calibration-v2',
    'approved-anchors.json'
  )

  assert.equal(existsSync(approvedPath), true)

  const exported = JSON.parse(readFileSync(approvedPath, 'utf8')) as {
    schemaVersion: number
    exportedAt: string
    anchors: AppearanceAnchor[]
  }
  const uniqueIds = new Set(exported.anchors.map((item) => item.anchorId))

  assert.equal(exported.schemaVersion, 1)
  assert.equal(Number.isNaN(Date.parse(exported.exportedAt)), false)
  assert.equal(exported.anchors.length, 41)
  assert.equal(uniqueIds.size, 41)
  assert.equal(
    exported.anchors.filter((item) => item.genderBank === 'female').length,
    23
  )
  assert.equal(
    exported.anchors.filter((item) => item.genderBank === 'male').length,
    18
  )
  assert.equal(
    exported.anchors.every(
      (item) =>
        item.reviewStatus === 'approved' &&
        Number.isInteger(item.reviewerScore) &&
        item.reviewerScore >= 0 &&
        item.reviewerScore <= 100
    ),
    true
  )

  const batchOneExpectedScores = new Map([
    ['female-low-b1-01', 5],
    ['female-low-b1-02', 5],
    ['female-low-b1-03', 5],
    ['female-low-b1-04', 10],
    ['female-low-b1-05', 25],
  ])
  const batchOneApproved = exported.anchors.filter((item) =>
    batchOneExpectedScores.has(item.anchorId)
  )

  assert.equal(batchOneApproved.length, batchOneExpectedScores.size)
  assert.equal(
    batchOneApproved.every(
      (item) =>
        item.reviewStatus === 'approved' &&
        item.reviewerScore === batchOneExpectedScores.get(item.anchorId)
    ),
    true
  )
})
