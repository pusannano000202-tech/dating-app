import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Artificial test pixels, no person's photo or location. The EXIF marker tests stripping.
const target = resolve('artifacts/qa/release-preservation-20260906/synthetic-album-input.jpg')
const bytes = await sharp({ create: { width: 128, height: 128, channels: 3, background: '#edbca8' } })
  .withExif({ IFD0: { Artist: 'Quantum synthetic local QA' } }).jpeg().toBuffer()
if (!(await sharp(bytes).metadata()).exif) throw new Error('test_input_exif_missing')
await writeFile(target, bytes, { flag: 'wx' })
console.log(JSON.stringify({ target, synthetic: true, inputHasExif: true, bytes: bytes.length }))
