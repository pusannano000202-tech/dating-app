import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {lifecycleFixture} from './admission-lifecycle-fixture.mjs'

export const studyHostedMigration = new URL('../../supabase/migrations/20260912034350_study_hosted_shared_admission.sql',import.meta.url)
export async function hostedStudyFixture() {
 const f=await lifecycleFixture()
 await f.db.exec(`create function quantum_private.get_or_create_daily_identity(u uuid,t timestamptz) returns jsonb language sql as $$select jsonb_build_object('display_name','테스트 별명 '||left(u::text,8))$$;`)
 await f.db.exec(await readFile(new URL('../../supabase/migrations/20260909150749_meetup_recurring_study_rooms.sql',import.meta.url),'utf8'))
 await f.db.exec(await readFile(studyHostedMigration,'utf8'))
 f.study=(action,args={})=>f.value('select public.study_room_action($1,$2::jsonb)as value',[action,JSON.stringify(args)])
 f.createStudy=async(user=f.users.mechanicalCaptain,more={})=>{await f.as(user);return f.study('create_hosted',{course_id:'pnu:AN1600527',level:'beginner',title:'함께 푸는 미적분',client_id:randomUUID(),...more})}
 return f
}
