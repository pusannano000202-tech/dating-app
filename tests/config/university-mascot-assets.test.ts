import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import {
  getPublicMascotAssetPath,
  getUniversityThemeOptions,
  type UniversityThemeAssetKind,
} from '../../lib/university-theme'

const ROOT = process.cwd()
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const DISPLAY_SCALE = 1.12
const MASCOT_KINDS: UniversityThemeAssetKind[] = [
  'welcome',
  'guide',
  'waiting',
  'support',
  'confirm',
  'refund',
  'avatar',
]

type PngAlphaBounds = {
  width: number
  height: number
  colorType: number
  minMargin: number
  boxWidthRatio: number
  boxHeightRatio: number
  scaledMinMarginRatio: number
}

test('Top60 runtime mascot PNG assets stay visible inside the app mascot slot', () => {
  const source = readFileSync(join(ROOT, 'components/theme/UniversityMascot.tsx'), 'utf8')

  assert.match(source, /scale-\[1\.12\]/)

  for (const theme of getUniversityThemeOptions()) {
    for (const kind of MASCOT_KINDS) {
      const publicPath = getPublicMascotAssetPath(theme, kind)
      const assetPath = join(ROOT, 'public', ...publicPath.replace(/^\//, '').split('/'))

      assert.equal(existsSync(assetPath), true, `${theme.id}/${kind} mascot is missing`)

      const bounds = readPngAlphaBounds(assetPath)
      assert.ok(bounds.width >= 256, `${theme.id}/${kind} mascot width is too small`)
      assert.ok(bounds.height >= 256, `${theme.id}/${kind} mascot height is too small`)
      assert.ok(
        bounds.colorType === 6 || bounds.colorType === 4,
        `${theme.id}/${kind} mascot must keep transparent alpha`,
      )
      assert.ok(bounds.minMargin > 0, `${theme.id}/${kind} mascot touches a PNG edge`)
      assert.ok(
        bounds.scaledMinMarginRatio > 0.025,
        `${theme.id}/${kind} mascot can clip after ${DISPLAY_SCALE}x display scaling`,
      )
      assert.ok(
        bounds.boxWidthRatio >= 0.22,
        `${theme.id}/${kind} mascot is too narrow inside its transparent canvas`,
      )
      assert.ok(
        bounds.boxHeightRatio >= 0.22,
        `${theme.id}/${kind} mascot is too short inside its transparent canvas`,
      )
    }
  }
})

function readPngAlphaBounds(filePath: string): PngAlphaBounds {
  const file = readFileSync(filePath)
  assert.equal(file.subarray(0, 8).equals(PNG_SIGNATURE), true, `${filePath} is not a PNG`)

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks: Buffer[] = []

  while (offset < file.length) {
    const length = file.readUInt32BE(offset)
    offset += 4
    const chunkType = file.toString('ascii', offset, offset + 4)
    offset += 4
    const chunkData = file.subarray(offset, offset + length)
    offset += length + 4

    if (chunkType === 'IHDR') {
      width = chunkData.readUInt32BE(0)
      height = chunkData.readUInt32BE(4)
      bitDepth = chunkData[8]
      colorType = chunkData[9]
    } else if (chunkType === 'IDAT') {
      idatChunks.push(chunkData)
    } else if (chunkType === 'IEND') {
      break
    }
  }

  assert.equal(bitDepth, 8, `${filePath} must use 8-bit PNG channels`)
  const channels = getPngChannels(colorType)
  assert.ok(channels > 0, `${filePath} has unsupported PNG colorType ${colorType}`)

  const raw = inflateSync(Buffer.concat(idatChunks))
  const stride = width * channels
  let previousLine = Buffer.alloc(stride)
  let position = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    const filter = raw[position]
    position += 1
    const line = Buffer.alloc(stride)

    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? line[index - channels] : 0
      const up = previousLine[index] ?? 0
      const upLeft = index >= channels ? previousLine[index - channels] : 0
      const rawValue = raw[position]
      position += 1
      line[index] = unfilterPngByte(filter, rawValue, left, up, upLeft)
    }

    for (let x = 0; x < width; x += 1) {
      const index = x * channels
      const alpha = colorType === 6
        ? line[index + 3]
        : colorType === 4
          ? line[index + 1]
          : 255

      if (alpha > 8) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }

    previousLine = line
  }

  assert.ok(maxX >= 0 && maxY >= 0, `${filePath} has no visible mascot pixels`)

  const left = minX
  const right = width - 1 - maxX
  const top = minY
  const bottom = height - 1 - maxY
  const boxWidth = maxX - minX + 1
  const boxHeight = maxY - minY + 1
  const scaledMargins = [
    scaledMarginRatio(left / width),
    scaledMarginRatio(right / width),
    scaledMarginRatio(top / height),
    scaledMarginRatio(bottom / height),
  ]

  return {
    width,
    height,
    colorType,
    minMargin: Math.min(left, right, top, bottom),
    boxWidthRatio: boxWidth / width,
    boxHeightRatio: boxHeight / height,
    scaledMinMarginRatio: Math.min(...scaledMargins),
  }
}

function getPngChannels(colorType: number): number {
  if (colorType === 6) return 4
  if (colorType === 4) return 2
  if (colorType === 2) return 3
  if (colorType === 0) return 1
  return 0
}

function unfilterPngByte(filter: number, value: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) return value
  if (filter === 1) return (value + left) & 255
  if (filter === 2) return (value + up) & 255
  if (filter === 3) return (value + Math.floor((left + up) / 2)) & 255
  if (filter === 4) return (value + paeth(left, up, upLeft)) & 255
  throw new Error(`Unsupported PNG filter ${filter}`)
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left
  if (upDistance <= upLeftDistance) return up
  return upLeft
}

function scaledMarginRatio(originalMarginRatio: number): number {
  return 0.5 - DISPLAY_SCALE * (0.5 - originalMarginRatio)
}
