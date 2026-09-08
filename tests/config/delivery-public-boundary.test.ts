import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const read = (path: string) => readFileSync(path, 'utf8')
test('delivery public projection has one file-verified server boundary, not an anonymous RPC bypass', () => {
  const sql = read('supabase/migrations/20260905130000_campus_eats_delivery_candidates.sql')
  assert.match(sql, /REVOKE ALL ON FUNCTION public.list_public_delivery_candidates\(\) FROM PUBLIC,anon,authenticated/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public.list_public_delivery_candidates\(\) TO service_role/)
  const api = read('app/api/campus-eats/delivery/route.ts')
  assert.match(api, /createSupabaseAdminClient/)
  assert.match(api, /hasDeliveryPhoto/)
  assert.doesNotMatch(api, /createSupabaseRequestClient/)
  assert.match(read('app/api/admin/campus-eats/delivery/route.ts'), /photoAvailability/)
})
test('manual delivery evidence acknowledgement expires whenever payload changes or is saved', () => {
  const editor = read('components/campus-eats/DeliveryCandidateEditor.tsx')
  assert.match(editor, /function update[^\n]+setAcknowledged\(false\)/)
  assert.match(editor, /setDraft\(\{ \.\.\.draft, revision: saved.revision \}\)\s+setAcknowledged\(false\)/)
  assert.match(editor, /setDraft\(\{ \.\.\.row, region: DELIVERY_PUBLIC_REGION \}\)/)
})
