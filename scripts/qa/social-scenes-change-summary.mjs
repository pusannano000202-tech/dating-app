import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

// Read-only report against the preserved live baseline, not a Git staging list.
const target = resolve(process.cwd())
const source = resolve(target, '../community-voice-20260907')
const branch = execFileSync('git',['-C',target,'rev-parse','--abbrev-ref','HEAD'],{encoding:'utf8',windowsHide:true}).trim()
if(branch !== 'codex/social-scene-implementation-20260907') throw new Error('unexpected_worktree')
const list = root => execFileSync('git',['-C',root,'-c','core.quotepath=false','ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/)
const included = file => /^(app|components|lib|public|tests|scripts|supabase|docs)\//.test(file) || /^(tsconfig.*\.json|next-env\.d\.ts|\.env\.(example|local\.example))$/.test(file)
const names = [...new Set([...list(source),...list(target)])].filter(included).sort()
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const changed = []
for(const file of names){
  const a=join(source,file),b=join(target,file)
  if(!existsSync(b)){ if(existsSync(a)) changed.push({path:file,status:'absent_in_isolated_tree'}); continue }
  if(!existsSync(a)) changed.push({path:file,status:'new_in_isolated_tree'})
  else if(hash(a)!==hash(b)) changed.push({path:file,status:'different_from_preserved_source'})
}
console.log(JSON.stringify({source,target,branch,comparison:'current preserved source; not historical Git HEAD',count:changed.length,changes:changed},null,2))
