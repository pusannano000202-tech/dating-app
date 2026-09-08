import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile, lstat } from 'node:fs/promises'
import { resolve, dirname, sep } from 'node:path'

// One-time, non-destructive import of the approved integrated source. No Git
// stage/commit or environment secrets; original files are never written.
const source = resolve('C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/integrated-campus-20260905')
const target = resolve(process.cwd())
const expectedTarget = resolve(source, '../community-voice-20260907')
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trimEnd()
if (target !== expectedTarget || git(target, 'branch', '--show-current') !== 'codex/community-voice-20260907') throw new Error('Unexpected target workspace')
if (git(source, 'rev-parse', 'HEAD') !== git(target, 'rev-parse', 'HEAD')) throw new Error('Source and target HEAD differ')
const baselineRoot = resolve(target, '.tmp/community-voice-baseline')
const manifestPath = resolve(baselineRoot, 'manifest.json')
try { await lstat(manifestPath); throw new Error('Baseline already exists; refusing reimport') } catch (error) { if (error.code !== 'ENOENT') throw error }
const sourceStatus = git(source, 'status', '--porcelain=v1', '--untracked-files=all', '-z')
const allowedRootFiles = new Set(['AGENTS.md', 'package.json', 'package-lock.json', 'next.config.mjs', 'next-env.d.ts', 'middleware.ts', 'vercel.json', '.env.example', '.env.local.example'])
const rows = sourceStatus.split('\0').filter(Boolean).map(row => ({ status: row.slice(0, 2), path: row.slice(3) }))
if (rows.some(row => /[RD]/.test(row.status))) throw new Error('Source rename/deletion requires explicit reconciliation')
const included = rows.filter(row => /^(app|components|lib|public|supabase|scripts|tests|docs)\//.test(row.path) || allowedRootFiles.has(row.path) || /^tsconfig[^/]*\.json$/.test(row.path))
const excluded = rows.filter(row => !included.includes(row)).map(row => row.path)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const entries = []
for (const row of included) {
  if (/^\.env(?!.*example$)|^(artifacts|references|reference-inputs)\//.test(row.path)) throw new Error('Protected source selected')
  const src = resolve(source, row.path), dst = resolve(target, row.path), saved = resolve(baselineRoot, 'files', row.path)
  if (![src.startsWith(source + sep), dst.startsWith(target + sep), saved.startsWith(baselineRoot + sep)].every(Boolean)) throw new Error('Path escapes workspace')
  if (!(await lstat(src)).isFile()) throw new Error('Only regular source files can be imported')
  const before = hash(await readFile(src))
  await mkdir(dirname(saved), { recursive: true })
  await copyFile(src, saved, constants.COPYFILE_EXCL)
  await mkdir(dirname(dst), { recursive: true })
  await copyFile(src, dst)
  if (hash(await readFile(src)) !== before || hash(await readFile(dst)) !== before) throw new Error('Concurrent source change or failed copy')
  entries.push({ path: row.path, sourceStatus: row.status, sha256: before })
}
if (git(source, 'status', '--porcelain=v1', '--untracked-files=all', '-z') !== sourceStatus) throw new Error('Source inventory changed during import')
await writeFile(manifestPath, JSON.stringify({ source, target, sourceHead: git(source, 'rev-parse', 'HEAD'), importedAt: new Date().toISOString(), entries, excluded }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ imported: entries.length, excluded: excluded.length, manifestPath, sourceUnchanged: true }))
