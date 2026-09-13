import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
function load(){const exports={};new Function('exports',ts.transpileModule(readFileSync('lib/auth/shared-meetup-return.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports);return exports}
test('new signup resumes the exact shared room after basic profile, not generic community',async()=>{
 const {resolveSharedMeetupOnboarding,sharedMeetupProfileHref,parseSharedMeetupReturn}=load();const room='/meetups/11111111-1111-4111-8111-111111111111'
 const client={rpc:async name=>{assert.equal(name,'get_my_profile_readiness');return {data:[{minimum_signup_complete:false}],error:null}}}
 assert.equal(await resolveSharedMeetupOnboarding(client,room),sharedMeetupProfileHref(room))
 const next=new URLSearchParams(sharedMeetupProfileHref(room).split('?')[1]).get('next');assert.equal(parseSharedMeetupReturn(next),room)
 assert.equal(await resolveSharedMeetupOnboarding({rpc:async()=>({data:[{minimum_signup_complete:true}],error:null})},room),room)
})
test('unavailable or malformed readiness is not a successful signup or a forced reset',async()=>{
 const {resolveSharedMeetupOnboarding}=load();for(const result of [{data:null,error:Error('offline')},{data:[],error:null},{data:[{minimum_signup_complete:'true'}],error:null}])await assert.rejects(resolveSharedMeetupOnboarding({rpc:async()=>result},'/meetups/11111111-1111-4111-8111-111111111111'))
})
test('unrelated and hostile destinations cannot become signup return links',async()=>{
 const {parseSharedMeetupReturn,resolveSharedMeetupOnboarding}=load();for(const path of ['//evil.example','/admin','https://evil.example','/meetups/../admin','/meetups/%2f%2fevil','/meetups/create',null])assert.equal(parseSharedMeetupReturn(path),null)
 assert.equal(await resolveSharedMeetupOnboarding({rpc:()=>{throw Error('should not read')}},'/community'),'/community')
})
