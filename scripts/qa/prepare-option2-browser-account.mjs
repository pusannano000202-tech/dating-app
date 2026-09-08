import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { QA, readQaStatus } from './option2-local-environment.mjs'

const status = readQaStatus()
const admin = createClient(QA.apiUrl, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const path = join(QA.runtimeRoot, 'browser-account.json')
let account
try { account = JSON.parse(await readFile(path, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
if (!account) {
  account = { email: 'qa.browser.option2@example.invalid', password: randomBytes(32).toString('base64url'), phone: '821000000051' }
  const created = await admin.auth.admin.createUser({ ...account, email_confirm: true, phone_confirm: true })
  if (created.error) throw new Error(`qa_account_create:${created.error.code}`)
  account.id = created.data.user.id
  await writeFile(path, JSON.stringify(account), { flag: 'wx', mode: 0o600 })
}
const { error } = await admin.rpc('complete_minimum_signup_with_friend_name', {
  p_user_id: account.id, p_display_name: '검수브라우저', p_friend_recognition_name: '김검수',
  p_birth_date: '2003-01-01', p_school_scope: 'pnu_self_selected', p_department: '기계공학부', p_community_gender: 'male',
})
if (error) throw new Error(`qa_signup:${error.code}:${error.message}`)
const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: account.email })
if (link.error) throw new Error(`qa_login:${link.error.code}`)
await writeFile(join(QA.runtimeRoot, 'browser-login.json'), JSON.stringify({ email: account.email, otp: link.data.properties.email_otp, createdAt: new Date().toISOString() }), { mode: 0o600 })
console.log(JSON.stringify({ email: account.email, minimumSignupPrepared: true, syntheticData: true, loginBy: 'existing email OTP UI', credentialsLogged: false }))
