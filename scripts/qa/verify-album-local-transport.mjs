import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

// Read-only local transport proof. Never print keys, JWTs, signed URLs or message/photo bytes.
const cli = 'C:/Users/82108/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-windows-x64/bin/supabase.exe'
const status = JSON.parse(execFileSync(cli, ['status', '--workdir', '.tmp/integrated-live-local', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
if (status.API_URL !== 'http://127.0.0.1:56421') throw new Error('wrong_local_transport_target')
const seriesId = 'c6600000-0000-4000-8000-000000000120'
const actorId = 'd964b372-ef61-4dce-aadd-214fa6f98a43'
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY || status.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const publicClient = createClient(status.API_URL, status.ANON_KEY || status.PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const args = { p_actor_user_id: actorId, p_series_id: seriesId }
const result = await admin.rpc('get_continuation_series_album_for_service', args)
const denied = await publicClient.rpc('get_continuation_series_album_for_service', args)
console.log(JSON.stringify({ service: { status: result.status, errorCode: result.error?.code, errorMessage: result.error?.message, dayCount: result.data?.days?.length }, anonymous: { status: denied.status, denied: Boolean(denied.error) } }))
if (result.error || !denied.error) process.exitCode = 1
if (process.argv.includes('--verify-photo') && !result.error) {
  let checked = 0
  for (const day of result.data.days) for (const photo of day.photos) {
    if (!photo.storage_path.startsWith(`continuation-series/${seriesId}/`)) throw new Error('unexpected_fixture_storage_path')
    const download = await admin.storage.from('meeting-evidence').download(photo.storage_path)
    if (download.error || !download.data) throw new Error('fixture_photo_download_failed')
    const metadata = await sharp(Buffer.from(await download.data.arrayBuffer())).metadata()
    console.log(JSON.stringify({ syntheticPhoto: true, format: metadata.format, width: metadata.width, height: metadata.height, hasExif: Boolean(metadata.exif), hasXmp: Boolean(metadata.xmp), hasIptc: Boolean(metadata.iptc) }))
    if (metadata.format !== 'jpeg' || metadata.exif || metadata.xmp || metadata.iptc) process.exitCode = 1
    checked++
  }
  if (!checked) throw new Error('no_uploaded_fixture_photo_to_verify')
}
