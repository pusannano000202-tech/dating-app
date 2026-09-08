import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  BoundedMultipartError,
  readBoundedMultipartFormData,
} from '../../lib/http/bounded-multipart'

function expectPayloadTooLarge(error: unknown): boolean {
  return error instanceof BoundedMultipartError && error.code === 'payload_too_large'
}

test('bounded multipart reader accepts a valid body without content-length', async () => {
  const form = new FormData()
  form.set('photo', new File([
    new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
  ], 'photo.jpg', { type: 'image/jpeg' }))
  const request = new Request('http://localhost/upload', {
    method: 'POST',
    body: form,
  })

  const parsed = await readBoundedMultipartFormData(request, 4 * 1024)
  const photo = parsed.get('photo')
  assert.ok(photo instanceof File)
  assert.equal(photo.size, 4)
})

test('bounded multipart reader rejects a declared overflow before parsing', async () => {
  const request = new Request('http://localhost/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=upload-test',
      'Content-Length': '65',
    },
    body: new Uint8Array(1),
  })

  await assert.rejects(
    () => readBoundedMultipartFormData(request, 64),
    expectPayloadTooLarge,
  )
})

test('bounded multipart reader rejects an observed overflow when content-length lies', async () => {
  const request = new Request('http://localhost/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=upload-test',
      'Content-Length': '1',
    },
    body: new Uint8Array(65),
  })

  await assert.rejects(
    () => readBoundedMultipartFormData(request, 64),
    expectPayloadTooLarge,
  )
})

test('photo upload routes bound the request stream before multipart parsing', () => {
  const profileRoute = readFileSync(
    path.join(process.cwd(), 'app/api/profile/photos/route.ts'),
    'utf8',
  )
  const evidenceRoute = readFileSync(
    path.join(process.cwd(), 'app/api/matches/[id]/evidence-photo/route.ts'),
    'utf8',
  )

  assert.match(profileRoute, /readBoundedMultipartFormData\(request, MAX_PHOTO_MULTIPART_BYTES\)/)
  assert.match(profileRoute, /MAX_PHOTO_COUNT \* MAX_PHOTO_BYTES \+ MULTIPART_OVERHEAD_BYTES/)
  assert.match(profileRoute, /payload_too_large[\s\S]*photo_size_invalid[\s\S]*413/)
  assert.doesNotMatch(profileRoute, /formData\s*=\s*await request\.formData\(\)/)

  assert.match(evidenceRoute, /readBoundedMultipartFormData\(request, MAX_EVIDENCE_MULTIPART_BYTES\)/)
  assert.match(evidenceRoute, /MEETING_EVIDENCE_MAX_BYTES \+ MULTIPART_OVERHEAD_BYTES/)
  assert.match(evidenceRoute, /payload_too_large[\s\S]*file_too_large[\s\S]*422/)
  assert.doesNotMatch(evidenceRoute, /form\s*=\s*await request\.formData\(\)/)
})

test('bounded multipart aggregation does not copy every streamed chunk before concat', () => {
  const helper = readFileSync(
    path.join(process.cwd(), 'lib/http/bounded-multipart.ts'),
    'utf8',
  )

  assert.match(
    helper,
    /Buffer\.from\(chunk\.buffer, chunk\.byteOffset, chunk\.byteLength\)/,
  )
  assert.doesNotMatch(helper, /Buffer\.from\(chunk\)/)
})
