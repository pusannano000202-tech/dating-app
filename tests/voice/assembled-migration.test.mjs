import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

test('delivered migration includes every reviewed social draft once in dependency order',async()=>{
 const sources=['g1-g2-schema.sql','g3-g4-schema.sql','g7-g8-schema.sql','g5-notification-prelude.sql','g5-g6-schema.sql','g5-sports-events.sql','g9-schema.sql','g9-preservation-bridge.sql']
 const migration=(await readFile(new URL('../../supabase/migrations/20260906181225_community_social_integrated.sql',import.meta.url),'utf8')).replace(/\r\n/g,'\n')
 let cursor=-1
 for(const source of sources){
  const sql=(await readFile(new URL('../../docs/implementation/community-voice/'+source,import.meta.url),'utf8')).replace(/\r\n/g,'\n').replace(/^begin;\s*$/m,'').replace(/commit;\s*$/,'').trim()
  const start='-- BEGIN SOURCE '+source+'\n',end='\n-- END SOURCE '+source
  const index=migration.indexOf(start);assert.ok(index>cursor,source+' dependency order')
  assert.equal(migration.indexOf(start,index+1),-1,source+' duplicate')
  assert.equal(migration.slice(index+start.length,migration.indexOf(end,index)),sql,source+' matches tested SQL')
  cursor=index
 }
 assert.equal(migration.match(/^begin;$/gm)?.length,1)
 assert.equal(migration.match(/^commit;$/gm)?.length,1)
})

test('notification links and dedupe share the emitted camel-case room key',async()=>{
 const sql=await readFile(new URL('../../docs/implementation/community-voice/g5-notification-prelude.sql',import.meta.url),'utf8')
 const ui=await readFile(new URL('../../app/notifications/page.tsx',import.meta.url),'utf8')
 assert.match(sql,/payload->>'roomId'/)
 assert.match(ui,/payload\.roomId/)
})
