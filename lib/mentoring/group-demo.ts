import type { GroupMentoringCommand, GroupMentoringSnapshot } from './group-contract'
const uid=(n:number)=>`42000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const expiry=(minutes:number)=>new Date(Date.now()+minutes*60000).toISOString()
export function createMentoringDemo():GroupMentoringSnapshot {
 return {phase:'idle',role:null,side_size:null,party_id:null,session_id:null,server_now:new Date().toISOString(),expires_at:null,my_accepted:false,party_accepted:0,party_total:0,accepted_count:0,member_count:0,members:[],messages:[],meeting:null,report_targets:[],friends:[{user_id:uid(20),label:'예시 친구 · 지우'},{user_id:uid(21),label:'예시 친구 · 민서'}],invitations:[]}
}
export type MentoringDemoAction=GroupMentoringCommand|{action:'demo_invite'|'demo_friend_accept'|'demo_offer'|'demo_all_accept';args:Record<string,unknown>}
/** Local presentation examples, without sessions, auth bypasses or live RPC calls. */
export function advanceMentoringDemo(previous:GroupMentoringSnapshot,command:MentoringDemoAction):GroupMentoringSnapshot {
 const s={...previous,server_now:new Date().toISOString()}, {action,args}=command
 if(action==='join')return {...createMentoringDemo(),role:args.role as 'mentor'|'mentee',side_size:args.side_size as 2|3,party_id:uid(1),party_total:1+(args.friend_ids as string[]).length,party_accepted:1,phase:(args.friend_ids as string[]).length?'friends':'waiting',expires_at:expiry(30)}
 if(action==='demo_invite')return {...s,invitations:[{party_id:uid(1),inviter_label:'예시 친구 · 지우',role:'mentee',side_size:2,expires_at:expiry(30)}]}
 if(action==='party_accept')return {...s,invitations:[],role:'mentee',side_size:2,party_id:uid(1),party_total:2,party_accepted:2,phase:'waiting',expires_at:expiry(30)}
 if(action==='party_decline')return {...s,invitations:[]}
 if(action==='demo_friend_accept'&&s.phase==='friends')return {...s,party_accepted:s.party_total,phase:'waiting'}
 if(action==='demo_offer'&&s.phase==='waiting')return {...s,phase:'offered',session_id:uid(2),member_count:(s.side_size??2)*2,accepted_count:0,my_accepted:false,expires_at:expiry(2)}
 if(action==='accept')return {...s,my_accepted:true,accepted_count:1}
 if(action==='demo_all_accept'&&s.phase==='offered'&&s.my_accepted){const n=s.side_size??2;const members=Array.from({length:n*2},(_,i)=>({id:uid(30+i),role:(i<n?'mentor':'mentee') as 'mentor'|'mentee',label:`${i<n?'멘토':'멘티'} ${i%n+1}`,mine:i===(s.role==='mentor'?0:n)}));return {...s,phase:'active',accepted_count:n*2,members,report_targets:members.filter(m=>!m.mine).map(({id,label})=>({id,label})),expires_at:expiry(14*24*60),messages:[{id:uid(70),mine:false,alias:members.find(m=>!m.mine)!.label,text:'반가워요! 서로 궁금한 이야기부터 나눠볼까요?',created_at:s.server_now}]}}
 if(action==='message'&&s.phase==='active')return s.messages.some(m=>m.id===args.client_id)?s:{...s,messages:[...s.messages,{id:args.client_id as string,mine:true,alias:s.members.find(m=>m.mine)?.label??'나',text:args.text as string,created_at:s.server_now}].slice(-100)}
 if(action==='plan'&&s.phase==='active')return {...s,meeting:{starts_at:args.starts_at as string,place:args.place as string,revision:(s.meeting?.revision??0)+1}}
 if(action==='end'||action==='report'||action==='decline')return {...s,phase:'ended',expires_at:null,members:[],messages:[],meeting:null}
 if(action==='cancel'||action==='leave_legacy')return createMentoringDemo()
 return s
}
