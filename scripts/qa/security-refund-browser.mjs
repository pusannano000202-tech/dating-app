// Actual React component bundled with test-only identity + synthetic HTTP data.
// No application login bypass, running app DB, payment keys or provider network.
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url), root = process.cwd()
const runtimePackages = process.env.CODEX_BROWSER_NODE_MODULES
if (!runtimePackages) throw new Error('Set CODEX_BROWSER_NODE_MODULES to the verified bundled runtime packages')
const { chromium } = require(resolve(runtimePackages, 'playwright'))
const webpackBundle = require('next/dist/compiled/webpack/webpack'); webpackBundle.init()
const output = resolve(root, '.tmp/security-remediation/browser'), artifacts = resolve(root, 'artifacts/qa/financial-security-20260914')
await mkdir(output, { recursive: true }); await mkdir(artifacts, { recursive: true })
await new Promise((done, fail) => webpackBundle.webpack({
  mode: 'development', devtool: false, entry: resolve(root, 'scripts/qa/refund-browser/entry.tsx'),
  output: { path: output, filename: 'app.js' },
  resolve: { extensions: ['.tsx', '.ts', '.js'], alias: {
    '@/components/content-history/useHistoryAccount': resolve(root, 'scripts/qa/refund-browser/fixture-account.tsx'),
    'next/link$': resolve(root, 'scripts/qa/refund-browser/fixture-link.tsx'), '@': root,
  } },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: resolve(root, 'scripts/qa/refund-browser/ts-loader.cjs') }] },
}, (error, stats) => error || stats?.hasErrors() ? fail(error ?? new Error(stats.toString({ all: false, errors: true }))) : done()))
const postcss = require('postcss'), tailwind = require('tailwindcss')
const css = await postcss([tailwind({ config: resolve(root, 'tailwind.config.ts') })]).process(await readFile('app/globals.css', 'utf8'), { from: resolve(root, 'app/globals.css') })
await writeFile(resolve(output, 'app.css'), css.css.replace(/@import[^;]+;/g, ''))
const owner = '11111111-1111-4111-8111-111111111111', stamp = '2026-09-14T01:00:00Z'
const id = n => `${n}`.repeat(8) + '-' + `${n}`.repeat(4) + '-4' + `${n}`.repeat(3) + '-8' + `${n}`.repeat(3) + '-' + `${n}`.repeat(12)
const item = (n, title, kind, payment, refundState) => ({ depositId: id(n), room: { kind, id: id(9) }, roomTitle: title, amountKrw: 10000, payment, refundState, requestId: refundState === 'completed' ? id(8) : null, requestedAt: refundState === 'completed' ? stamp : null, approvedAt: null, completedAt: refundState === 'completed' ? stamp : null, lastError: null })
let rows = [item(2, '공학수학, 이번 주도 함께 풀어요', 'study', 'refund_due', 'available'), item(3, '선배와 함께하는 진로 이야기', 'mentoring', 'held', 'unavailable'), item(4, '토요일 캠퍼스 산책', 'custom_meetup', 'refunded', 'completed')]
let unavailable = false, delay = false
const requests = [], errors = []
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname.startsWith('/api/')) {
    const currentOwner = req.headers['x-quantum-owner'], captured = structuredClone(rows)
    if (delay && currentOwner === owner && req.method === 'GET') await new Promise(r => setTimeout(r, 700))
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store')
    if (unavailable) { res.statusCode = 503; res.end(JSON.stringify({ error: 'refund_service_unavailable' })); return }
    if (req.method === 'POST') {
      let raw = ''; for await (const bytes of req) raw += bytes
      const body = JSON.parse(raw); requests.push({ body, owner: currentOwner, path: url.pathname })
      assert.equal(currentOwner, owner)
      rows = rows.map(row => row.depositId !== body.depositId ? row : { ...row, requestId: id(6), requestedAt: stamp,
        refundState: body.action === 'approve' ? 'approved' : 'requested', approvedAt: body.action === 'approve' ? stamp : null })
      res.end(JSON.stringify({ accountKey: currentOwner, refund: rows.find(r => r.depositId === body.depositId) })); return
    }
    res.end(JSON.stringify({ accountKey: currentOwner, refunds: currentOwner === owner ? captured : [] })); return
  }
  if (url.pathname === '/app.js' || url.pathname === '/app.css') {
    res.setHeader('Content-Type', url.pathname.endsWith('js') ? 'application/javascript' : 'text/css')
    res.end(await readFile(resolve(output, url.pathname.slice(1)))); return
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>')
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort())
  const capture = async name => page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true })
  const fit = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Horizontal overflow')
  await page.goto(base); await page.getByRole('button', { name: '반환 신청하기' }).click()
  await capture('01-member-confirm-mobile'); await fit()
  await page.getByRole('button', { name: '반환 신청 확인' }).click()
  await page.getByText('운영자 검토 대기', { exact: true }).waitFor()
  await capture('02-member-requested-mobile')
  assert.deepEqual(requests[0].body, { depositId: id(2) })
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(base + '?admin=1')
  await page.getByRole('button', { name: '반환 승인하기' }).click(); await capture('03-admin-confirm-desktop'); await fit()
  await page.getByRole('button', { name: '승인 확인' }).click()
  await page.getByText('승인 · 반환 대기', { exact: true }).waitFor(); await capture('04-admin-approved-desktop')
  assert.deepEqual(requests[1].body, { depositId: id(2), requestId: id(6), action: 'approve' })
  rows[0] = { ...rows[0], payment: 'refunded', refundState: 'completed', completedAt: stamp }
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base)
  await page.getByRole('heading', { name: rows[0].roomTitle }).waitFor(); await capture('05-member-completed-mobile'); await fit()
  unavailable = true; await page.getByRole('button', { name: '새로고침' }).click()
  await page.getByRole('alert').waitFor(); await capture('06-unavailable-mobile')
  assert.equal(await page.getByText('아직 모임 보증금 내역이 없어요').count(), 0)
  unavailable = false; delay = true; await page.getByRole('button', { name: '새로고침' }).click()
  await page.getByRole('button', { name: '테스트: 계정 변경' }).click()
  await page.getByText('아직 모임 보증금 내역이 없어요').waitFor()
  await page.waitForTimeout(900)
  assert.equal(await page.getByRole('heading', { name: rows[0].roomTitle }).count(), 0)
  await capture('07-account-change-mobile')
  assert.deepEqual(errors, [])
  await writeFile(resolve(artifacts, 'RESULT.json'), JSON.stringify({ result: 'PASS', component: 'components/meetups/AdmissionRefundLedger.tsx', productionAuth: false, realProvider: false, source: 'actual-component-with-test-only-identity-and-HTTP-fixture', viewport: ['390x844', '1440x1000'], checked: ['request-confirm', 'admin-approve-not-complete', 'verified-state-display', 'outage-not-empty', 'account-switch-inflight-clear', 'horizontal-overflow', 'no-js-errors'] }, null, 2))
  console.log(JSON.stringify({ result: 'PASS', artifacts }))
} finally { await browser.close(); await new Promise(r => server.close(r)) }
