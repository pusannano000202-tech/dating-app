import { isMeetupCategory, type MeetupCategory } from '../community/contracts'
import { isMeetupGenderMode, type MeetupGenderMode } from '../community/meetup-gender'
import { meetupDiscoveryGroups, studyTopicGroups, featuredMeetupIdeas, type MeetupDiscoveryGroupId, type StudyTopicGroupId } from '../community/catalog'
import type { MeetupScope } from '../community/department-rooms'
import type { IdempotencyAttempt } from './idempotency'

export type MeetupCreateDraft = {
  step:number; discoveryGroup:MeetupDiscoveryGroupId; category:MeetupCategory; presetId:string|null;
  studyTopicGroup:StudyTopicGroupId; selectedStudyTopics:string[]; title:string; description:string;
  placeName:string; scheduledAt:string; endsAt:string; capacity:number; genderMode:MeetupGenderMode;
  scopeType:MeetupScope; scheduleStatus:'confirmed'|'schedule_pending'; attempt:IdempotencyAttempt|null;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const prefix='quantum.meetup-create-draft.v1:'
type DraftStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>
export function saveMeetupDraft(storage:DraftStorage,token:string,draft:MeetupCreateDraft,now=Date.now()):boolean {
  if(!uuid.test(token))return false
  try{storage.setItem(prefix+token,JSON.stringify({version:1,expiresAt:now+60*60_000,draft}));return true}catch{return false}
}
export function restoreMeetupDraft(storage:DraftStorage,token:string,now=Date.now()):MeetupCreateDraft|null {
  if(!uuid.test(token))return null
  try{
    const raw=storage.getItem(prefix+token)
    if(!raw||raw.length>16000)return null
    const item=JSON.parse(raw),d=item?.draft
    if(item.version!==1||!Number.isFinite(item.expiresAt)||item.expiresAt<=now||item.expiresAt>now+60*60_000||!d){storage.removeItem(prefix+token);return null}
    const strings=['title','description','placeName','scheduledAt','endsAt'] as const
    if(strings.some(key=>typeof d[key]!=='string')||d.title.length>60||d.description.length>500||d.placeName.length>80||d.scheduledAt.length>16||d.endsAt.length>16)return null
    if(!isMeetupCategory(d.category)||!isMeetupGenderMode(d.genderMode)||!['school','department'].includes(d.scopeType)||!['confirmed','schedule_pending'].includes(d.scheduleStatus))return null
    if(!Number.isInteger(d.step)||d.step<0||d.step>3||!Number.isInteger(d.capacity)||d.capacity<2||d.capacity>20)return null
    if(!meetupDiscoveryGroups.some(g=>g.id===d.discoveryGroup&&g.categories.includes(d.category)))return null
    const topics=studyTopicGroups.find(g=>g.id===d.studyTopicGroup)?.topics
    if(!topics||!Array.isArray(d.selectedStudyTopics)||d.selectedStudyTopics.length>topics.length||d.selectedStudyTopics.some((t:unknown)=>typeof t!=='string'||!topics.includes(t)))return null
    if(d.presetId!==null&&!featuredMeetupIdeas.some(p=>p.id===d.presetId&&p.category===d.category))return null
    if(d.attempt!==null&&(!d.attempt||typeof d.attempt.fingerprint!=='string'||d.attempt.fingerprint.length>8000||!uuid.test(d.attempt.idempotencyKey)))return null
    return d as MeetupCreateDraft
  }catch{return null}
}
export function removeMeetupDraft(storage:DraftStorage,token:string){try{if(uuid.test(token))storage.removeItem(prefix+token)}catch{/* Storage may be disabled after restore. */}}
