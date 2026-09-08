import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !adminKey) throw new Error('Supabase anchor sync environment is incomplete')

const manifestPath = join(
  process.cwd(),
  'data',
  'appearance-calibration-v2',
  'approved-anchors.json',
)
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (!Array.isArray(manifest.anchors) || manifest.anchors.length === 0) {
  throw new Error('approved anchor manifest is empty')
}

const ids = new Set()
const client = createClient(supabaseUrl, adminKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
let uploaded = 0

for (const anchor of manifest.anchors) {
  if (anchor.reviewStatus !== 'approved') throw new Error('unapproved anchor in manifest')
  if (ids.has(anchor.anchorId)) throw new Error(`duplicate anchor: ${anchor.anchorId}`)
  ids.add(anchor.anchorId)

  const expectedPrefix = '/appearance-calibration-v2/anchors/'
  if (typeof anchor.imagePath !== 'string' || !anchor.imagePath.startsWith(expectedPrefix)) {
    throw new Error(`invalid anchor path: ${anchor.anchorId}`)
  }
  const fileName = basename(anchor.imagePath)
  const localPath = join(process.cwd(), 'public', 'appearance-calibration-v2', 'anchors', fileName)
  const storagePath = `appearance-calibration-v2/anchors/${fileName}`
  const bytes = await readFile(localPath)
  const { error } = await client.storage.from('appearance-anchors').upload(
    storagePath,
    bytes,
    { contentType: 'image/png', cacheControl: '3600', upsert: true },
  )
  if (error) throw new Error(`anchor upload failed: ${anchor.anchorId}: ${error.message}`)
  uploaded += 1
}

console.log(JSON.stringify({
  status: 'ok',
  schema_version: manifest.schemaVersion,
  manifest_version: 'approved-v1',
  uploaded,
}))
