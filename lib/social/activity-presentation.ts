import {featuredMeetupIdeas,meetupCategoryCatalog} from '../community/catalog'
import {getMeetupDiscoveryGroups} from '../meetups/discovery-navigation'
import {getStudyCourse,getStudyCoursePhoto} from '../meetups/study-catalog'

/** Public catalog art, never a member photo. Titles cannot set a room's category. */
export type SocialActivityMetadata = {kind:string;activity_key?:string|null;category?:string|null;sport?:string;course_key?:string|null}
export type SocialActivityPresentation = {categoryLabel:string;activityLabel:string;imageSrc:string;imageAlt:string}
const fallback:SocialActivityPresentation={categoryLabel:'모임',activityLabel:'함께하는 모임',imageSrc:'/images/meetups/meetup-cafe-friends-v1.webp',imageAlt:'학교 친구들과 대화하는 활동 분위기 예시'}

export function getSocialActivityPresentation(room:SocialActivityMetadata):SocialActivityPresentation {
  if(room.kind==='league_team'||room.kind==='league_match') return {
    categoryLabel:'학과 대항전',activityLabel:room.sport==='lol'?'LoL 5 대 5':room.sport==='football'?'축구 11 대 11':room.sport==='futsal'?'풋살 6 대 6':'우리 학교 리그',
    imageSrc:room.sport==='lol'?'/images/meetups/meetup-gaming.webp':'/social-scenes/home-playmaker-football.webp',imageAlt:'학과 대항전 활동 분위기 예시',
  }
  if(room.kind==='mentoring')return {categoryLabel:'멘토링',activityLabel:'우리 과 선후배',imageSrc:'/images/quantum-campus-group.webp',imageAlt:'학교 선후배가 함께 이야기하는 활동 분위기 예시'}
  if(room.kind==='study_room') {
    const course=room.course_key?getStudyCourse(room.course_key):null
    const photo=getStudyCoursePhoto(course?.title??'')
    return {categoryLabel:'전공 스터디',activityLabel:course?.title??'우리 과 함께 공부',imageSrc:photo.src,imageAlt:photo.description}
  }
  const idea=featuredMeetupIdeas.find(item=>item.id===room.activity_key)
  if(idea){
    const group=idea.topicGroup?getMeetupDiscoveryGroups('achieve').find(item=>item.id===idea.topicGroup):null
    return {categoryLabel:group?.title??meetupCategoryCatalog.find(item=>item.id===idea.category)?.label??'모임',activityLabel:idea.title,imageSrc:group?.imageSrc??idea.imageSrc,imageAlt:group?.imageAlt??idea.imageAlt}
  }
  const category=meetupCategoryCatalog.find(item=>item.id!=='all'&&item.id===room.category)
  if(!category)return {...fallback}
  const art=featuredMeetupIdeas.find(item=>item.category===category.id)
  return {categoryLabel:category.label,activityLabel:category.label+' 모임',imageSrc:art?.imageSrc??(category.id==='soccer'?'/social-scenes/home-playmaker-football.webp':category.id==='baseball'?'/social-scenes/baseball.png':fallback.imageSrc),imageAlt:art?.imageAlt??fallback.imageAlt}
}
