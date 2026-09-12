import type {CandidateScope,CandidateRow,HostRoom} from './candidate-board-contract'

const labels:Record<string,string>={top:'탑',jungle:'정글',mid:'미드',adc:'원딜',support:'서폿',goalkeeper:'골키퍼',defender:'수비수',midfielder:'미드필더',forward:'공격수',mentor:'경험을 나눌래요',mentee:'도움을 구할래요',iron:'아이언',bronze:'브론즈',silver:'실버',gold:'골드',platinum:'플래티넘',emerald:'에메랄드',diamond:'다이아몬드',master:'마스터',grandmaster:'그랜드마스터',challenger:'챌린저',beginner:'초보',intermediate:'중수',advanced:'고수',lol:'LoL',futsal:'풋살',football:'축구',courses:'수업·전공',career:'진로·취업',campus:'학교생활'}
export const positionLabel=(key:string)=>labels[key]??key.toUpperCase()
export const displayCandidates=(rows:CandidateRow[])=>rows.filter(row=>!row.is_me&&row.status==='waiting')
const footballRoles:Record<string,string>={gk:'goalkeeper',lb:'defender',lcb:'defender',rcb:'defender',rb:'defender',ld:'defender',rd:'defender',lcm:'midfielder',cm:'midfielder',rcm:'midfielder',lm:'midfielder',rm:'midfielder',lw:'forward',st:'forward',rw:'forward'}
export function compatibleSlots(scope:CandidateScope,candidate:Pick<CandidateRow,'positions'>,room:Pick<HostRoom,'slots'>){
 return room.slots.filter(slot=>candidate.positions.includes(scope.kind==='league'&&scope.key!=='lol'?footballRoles[slot]:slot))
}
export function candidateRoomHref(scope:CandidateScope){
 if(scope.kind==='league')return `/meetups/league?sport=${encodeURIComponent(scope.key)}`
 if(scope.kind==='study')return `/meetups/study?course=${encodeURIComponent(scope.key)}`
 if(scope.kind==='mentoring')return `/meetups/department/mentoring?topic=${encodeURIComponent(scope.key)}`
 // General candidates join user-hosted meetups; never send them to the legacy
 // automatic-room pool, whose free direct-entry contract is different.
 return '/meetups/browse'
}
export const candidateScopeTitle=(scope:CandidateScope)=>scope.kind==='league'?'우리 학교 리그':scope.kind==='study'?'전공 스터디':scope.kind==='mentoring'?'우리 과 멘토링':'같이 놀 사람!'
