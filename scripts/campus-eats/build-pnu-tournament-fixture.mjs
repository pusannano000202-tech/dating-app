import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..', '..')
const handoffRoot = join(root, 'output', 'campus-food-tournament-handoff')
const manifestPath = join(handoffRoot, 'handoff_manifest.csv')
const originalImageRoot = join(handoffRoot, 'original-images')
const publicImageRoot = join(root, 'public', 'campus-eats', 'restaurants')
const fixturePath = join(root, 'lib', 'campus-eats', 'fixtures', 'pnu-restaurants.generated.json')

const categoryIds = {
  '돈가스': 'donkatsu',
  '피자': 'pizza',
  '치킨': 'chicken',
  '국밥': 'gukbap',
  '밀면': 'milmyeon',
}

const coffeeCategoryIds = {
  '정문': 'coffee-main',
  '북문': 'coffee-north',
}

function categoryIdFor(label, row) {
  if (label === '커피') {
    const categoryId = coffeeCategoryIds[row['구역']]
    if (!categoryId) throw new Error(`Unknown coffee zone ${row['구역']} for ${row['매장명']}`)
    return categoryId
  }

  const categoryId = categoryIds[label]
  if (!categoryId) throw new Error(`Unknown category ${label} for ${row['매장명']}`)
  return categoryId
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function parseManifest(csv) {
  if (csv.includes('"')) {
    throw new Error('Quoted CSV fields require a real CSV parser before this fixture can be rebuilt')
  }

  const [headerLine, ...rowLines] = csv.trim().split(/\r?\n/)
  const headers = headerLine.split(',')
  return rowLines.map((line, rowIndex) => {
    const fields = line.split(',')
    if (fields.length !== headers.length) {
      throw new Error(`Manifest row ${rowIndex + 2} has ${fields.length} fields; expected ${headers.length}`)
    }
    return Object.fromEntries(headers.map((header, index) => [header, fields[index]]))
  })
}

function livingAreaId(neighborhood) {
  if (neighborhood.includes('북문')) return 'L2'
  if (/(부산대역|장전|온천천)/.test(neighborhood)) return 'L3'
  return 'L1'
}

async function main() {
  const rows = parseManifest(await readFile(manifestPath, 'utf8'))
  if (rows.length !== 93) throw new Error(`Expected 93 handoff rows, received ${rows.length}`)

  await mkdir(publicImageRoot, { recursive: true })
  const generated = []

  for (const row of rows) {
    const sequence = String(Number(row['번호'])).padStart(3, '0')
    const sourcePath = join(originalImageRoot, row['원본파일'])
    const sourceBuffer = await readFile(sourcePath)
    const sourceHash = sha256(sourceBuffer)
    if (sourceHash !== row['원본SHA256']) {
      throw new Error(`Source hash mismatch for ${row['매장명']}: ${basename(sourcePath)}`)
    }

    const outputName = `${sequence}.webp`
    const outputPath = join(publicImageRoot, outputName)
    await sharp(sourceBuffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84, effort: 4 })
      .toFile(outputPath)

    const outputBuffer = await readFile(outputPath)
    const outputMetadata = await sharp(outputBuffer).metadata()
    const categories = row['종목'].split('|').map((label) => categoryIdFor(label, row))

    generated.push({
      canonicalStoreId: `pnu:store:${sequence}`,
      categories,
      name: row['매장명'],
      neighborhood: row['구역'],
      livingAreaId: livingAreaId(row['구역']),
      roadAddress: row['주소'],
      photoType: row['사진종류'],
      imageSrc: `/campus-eats/restaurants/${outputName}`,
      imageAlt: `${row['매장명']} ${row['사진종류']} 사진`,
      imageSourceUrl: row['사진출처'],
      sourceFileName: row['원본파일'],
      sourceExtension: extname(row['원본파일']).toLowerCase(),
      sourceSize: row['원본크기'],
      sourceSha256: sourceHash,
      webSha256: sha256(outputBuffer),
      webWidth: outputMetadata.width,
      webHeight: outputMetadata.height,
    })
  }

  const categoryCounts = generated
    .flatMap((restaurant) => restaurant.categories)
    .reduce((counts, categoryId) => ({ ...counts, [categoryId]: (counts[categoryId] ?? 0) + 1 }), {})

  const expectedCounts = {
    donkatsu: 14,
    pizza: 12,
    chicken: 14,
    'coffee-main': 17,
    'coffee-north': 13,
    gukbap: 16,
    milmyeon: 8,
  }
  const countsMatch = Object.keys(categoryCounts).length === Object.keys(expectedCounts).length
    && Object.entries(expectedCounts).every(([categoryId, expectedCount]) => categoryCounts[categoryId] === expectedCount)
  if (!countsMatch) {
    throw new Error(`Category counts changed: ${JSON.stringify(categoryCounts)}`)
  }

  await writeFile(fixturePath, `${JSON.stringify({
    schemaVersion: 1,
    generatedFrom: 'output/campus-food-tournament-handoff/handoff_manifest.csv',
    imagePolicy: 'source hash verified; web derivative resized without crop or enlargement',
    restaurantCount: generated.length,
    cardCount: Object.values(categoryCounts).reduce((sum, count) => sum + count, 0),
    categoryCounts,
    restaurants: generated,
  }, null, 2)}\n`, 'utf8')

  process.stdout.write(`Generated ${generated.length} restaurants and ${Object.values(categoryCounts).reduce((sum, count) => sum + count, 0)} cards\n`)
}

await main()
