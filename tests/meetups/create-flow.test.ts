import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createdMeetupHref,customMeetupBrowseHref,parseMeetupKoreanDate,meetupKoreanDateInput } from '../../lib/meetups/create-flow'
import { validateMeetupCreateV3Input } from '../../lib/meetups/contracts'
import { saveMeetupDraft,restoreMeetupDraft,type MeetupCreateDraft } from '../../lib/meetups/create-draft'
import { resolveMeetupGuideView } from '../../lib/meetups/guide-contract'
import * as createFlow from '../../lib/meetups/create-flow'

test('creation back navigation retains a safe origin and never sends a department creator to another site',()=>{
  assert.ok('getMeetupCreateBackHref' in createFlow, 'creation needs an explicit origin-preserving back destination')
  const back=createFlow.getMeetupCreateBackHref as (scope:'department'|'school',origin?:string|null)=>string
  assert.equal(back('department'),'/meetups/department')
  assert.equal(back('school'),'/meetups')
  assert.equal(back('department','/meetups/department/social'),'/meetups/department/social')
  assert.equal(back('school','/meetups/explore?intent=achieve'),'/meetups/explore?intent=achieve')
  for(const unsafe of ['https://evil.example','//evil.example','/login','/meetups/create','/meetups/../admin','/meetups%2f..%2fadmin','/meetups\\evil'])assert.equal(back('department',unsafe),'/meetups/department')
})

test('created notice is reserved for the confirmed host and preserves actual recruitment state',()=>{
  assert.ok('getCreatedMeetupNotice' in createFlow, 'creation success needs a host-scoped presentation')
  const notice=createFlow.getCreatedMeetupNotice as (created:boolean,room:{id:string;title:string;is_host:boolean;member_count:number;capacity:number;status:string})=>null|{heading:string;recruitment:string;remaining:number;chatHref:string;applicationsHref:string}
  const room={id:'11111111-1111-4111-8111-111111111111',title:'수요일에 함께 풀어요',is_host:true,member_count:1,capacity:5,status:'open'}
  assert.equal(notice(false,room),null)
  assert.equal(notice(true,{...room,is_host:false}),null)
  assert.equal(notice(true,{...room,id:'//outside.example'}),null)
  assert.equal(notice(true,{...room,member_count:6}),null)
  const opened=notice(true,room)
  assert.equal(opened?.remaining,4)
  assert.equal(opened?.recruitment,'모집 중')
  assert.equal(opened?.chatHref,`/chat/rooms/meetup/${room.id}`)
  assert.equal(opened?.applicationsHref,`/meetups/${room.id}/applications`)
  assert.equal(notice(true,{...room,status:'full',member_count:5})?.recruitment,'모집 마감')
  assert.equal(notice(true,{...room,status:'full',member_count:3})?.remaining,0)
  assert.equal(notice(true,{...room,status:'cancelled'})?.recruitment,'취소된 모임')
})
test('creation opens exactly the server-created room, not an unrelated portal',()=>{
  assert.equal(createdMeetupHref({meetup:{id:'11111111-1111-4111-8111-111111111111'}}),'/meetups/11111111-1111-4111-8111-111111111111?created=1')
  for(const value of [null,{}, {meetup:{id:'https://evil.example'}},{meetup:{id:'undefined'}}]) assert.equal(createdMeetupHref(value),null)
})
test('custom recruitment retains category and scope when viewed again',()=>{
  assert.equal(customMeetupBrowseHref('study','department'),'/meetups/browse?category=study&scope_type=department')
})
test('Korean appointments do not change with the viewers locale or timezone',()=>{
  assert.equal(parseMeetupKoreanDate('2026-09-14T19:30'),'2026-09-14T10:30:00.000Z')
  assert.equal(meetupKoreanDateInput(new Date('2026-09-14T10:30:00.000Z')),'2026-09-14T19:30')
  for(const value of ['2026-02-30T10:00','invalid','2026-09-14T25:00']) assert.equal(parseMeetupKoreanDate(value),'')
})
test('custom browse keeps the selected female-only admission filter',()=>{
  const href=(customMeetupBrowseHref as (...args:string[])=>string)('dining','school','female_only')
  assert.equal(new URL(href,'https://quantum.test').searchParams.get('gender_mode'),'female_only')
})
const pending={category:'dining',title:'여자끼리 맛집 탐방',description:'날짜는 함께 정해요',place_name:null,scheduled_at:null,ends_at:null,schedule_status:'schedule_pending',capacity:4,gender_mode:'female_only',scope_type:'school',activity_key:null,idempotency_key:'11111111-1111-4111-8111-111111111111'}
test('login return restores every form choice and retry identity; expired or blocked storage fails closed',()=>{
  const data=new Map<string,string>(),storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)},removeItem:(key:string)=>{data.delete(key)}}
  const draft:MeetupCreateDraft={step:3,discoveryGroup:'lifestyle',category:'dining',presetId:null,studyTopicGroup:'major-foundation',selectedStudyTopics:[],title:'여자끼리 맛집 탐방',description:'같이 정해요',placeName:'학생회관',scheduledAt:'2026-09-20T19:00',endsAt:'2026-09-20T21:00',capacity:6,genderMode:'female_only',scopeType:'department',scheduleStatus:'confirmed',attempt:{fingerprint:'unchanged',idempotencyKey:pending.idempotency_key}}
  assert.equal(saveMeetupDraft(storage,pending.idempotency_key,draft,100),true)
  assert.deepEqual(restoreMeetupDraft(storage,pending.idempotency_key,101),draft)
  assert.equal(restoreMeetupDraft(storage,pending.idempotency_key,3600101),null)
  assert.equal(restoreMeetupDraft(storage,'untrusted-path',101),null)
  assert.equal(saveMeetupDraft({...storage,setItem:()=>{throw Error('disabled')}},pending.idempotency_key,draft,100),false)
})
test('a pending schedule creates a room with no invented place or dates',()=>{
  const result=validateMeetupCreateV3Input(pending)
  assert.equal(result.ok,true)
  if(result.ok){assert.equal(result.value.scheduledAt,null);assert.equal(result.value.placeName,null);assert.equal(result.value.endsAt,null)}
})
test('pending schedules remain in preparation instead of pretending the activity started',()=>{
  assert.equal(resolveMeetupGuideView({mode:'actual',lifecycleStatus:'open',serverNow:new Date().toISOString(),scheduledAt:null,endsAt:null,sharedStep:null,personalAcknowledgedStep:null,previewStep:null}).currentSceneId,'prepare')
})
test('pending schedules reject partial dates while confirmed schedules retain validation',()=>{
  for(const input of [{...pending,scheduled_at:'2026-09-20T10:00:00Z'},{...pending,schedule_status:'maybe'},{...pending,schedule_status:'confirmed'}])assert.equal(validateMeetupCreateV3Input(input).ok,false)
  assert.equal(validateMeetupCreateV3Input({...pending,schedule_status:'confirmed',place_name:'학생회관',scheduled_at:'2026-09-20T10:00:00Z',ends_at:'2026-09-20T12:00:00Z'},new Date('2026-09-10')).ok,true)
})
