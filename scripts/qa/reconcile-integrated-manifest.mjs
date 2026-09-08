import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFile, readFile, writeFile, constants } from 'node:fs/promises'
import { resolve, join } from 'node:path'

// Mechanical reconciliation only: this script never copies implementation files
// and cannot establish that an earlier import actually ran.
const root = resolve(process.cwd())
const sourceRoot = resolve(root, '../engagement-g1-20260905')
const expectedHead = 'be9078565d8e59f73cbc017f3c7b1484996da1c3'
const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], {encoding:'utf8',windowsHide:true}).trimEnd()
if (!root.endsWith('integrated-campus-20260905') || git(root,['rev-parse','HEAD']) !== expectedHead || git(sourceRoot,['rev-parse','HEAD']) !== expectedHead) throw new Error('Unexpected source or target Git context')
const manifestPath = join(root,'docs/superpowers/plans/integrated-baseline-manifest.json')
const backupPath = join(root,'docs/superpowers/plans/integrated-baseline-manifest.corrupt.txt')
const old = await readFile(manifestPath,'utf8')
if (!old.startsWith('Warning: truncated output') || !old.includes('tokens truncated')) throw new Error('Only the known truncated manifest can be reconciled')
const oldEntries = JSON.parse(old.slice(old.indexOf('[\n')))
const excluded = new Set(['.env.local.example','next-env.d.ts','design-qa.md','docs/superpowers/plans/2026-09-05-g1-activity-explorer.md','docs/superpowers/plans/2026-09-05-integrated-campus-experience.md'])
const historical = new Map(oldEntries.filter(row => row.path && row.source && row.sha256
  && resolve(row.source).toLowerCase() === resolve(sourceRoot,row.path).toLowerCase()
  && /^[0-9a-f]{64}$/i.test(row.sha256)).map(row=>[row.path,row.sha256.toLowerCase()]))
const paths = git(sourceRoot,['status','--porcelain=v1','--untracked-files=all','-z']).split('\0').filter(Boolean).map(row=>{
  if (/[RD]/.test(row.slice(0,2))) throw new Error('Renamed or deleted source requires separate reconciliation')
  return row.slice(3)
}).sort()
if (paths.length !== 366 || historical.size !== 298) throw new Error('Source inventory drifted from the independently audited snapshot')
const hash = bytes=>createHash('sha256').update(bytes).digest('hex')
const rows=[]
for (const path of paths) {
  if (excluded.has(path)) { rows.push({path,excluded:true,reason:'Prior evidence/generated config or separately approved plan; not baseline code'}); continue }
  if (/^(artifacts|reference-inputs|references)\/|^vite-map|^\.env(?!.*example$)/.test(path) || path.includes('..')) throw new Error('Protected path is outside this manifest')
  const source=resolve(sourceRoot,path), target=resolve(root,path)
  const sourceSha256=hash(await readFile(source)), targetSha256=hash(await readFile(target))
  if (historical.has(path) && historical.get(path)!==sourceSha256) throw new Error(`Historical source hash changed: ${path}`)
  rows.push({path,source,target,sourceSha256,targetSha256,
    historicalHashRecovered:historical.has(path),
    currentComparison:sourceSha256===targetSha256?'identical':'integrated_changes',
    evidence:'current_source_and_target_inventory_not_import_execution'})
}
await copyFile(manifestPath,backupPath,constants.COPYFILE_EXCL)
const included=rows.filter(row=>!row.excluded)
const result={schemaVersion:2,reconciledAt:new Date().toISOString(),sourceRoot,targetRoot:root,sourceHead:expectedHead,targetHead:expectedHead,
  originalTruncatedManifest:backupPath, historicalImportExecution:'NOT_PROVEN_BY_TRUNCATED_MANIFEST',
  summary:{included:included.length,excluded:rows.length-included.length,historicalHashRecovered:historical.size,allTargetPathsExist:true,identical:included.filter(row=>row.currentComparison==='identical').length,integratedChanges:included.filter(row=>row.currentComparison!=='identical').length},files:rows}
await writeFile(manifestPath,JSON.stringify(result,null,2)+'\n')
JSON.parse(await readFile(manifestPath,'utf8'))
console.log(JSON.stringify(result.summary))
