import {makeLeagueRecruitmentDemo} from './league-recruitment-demo'
import {LEAGUE_SPORTS,type LeagueSport} from './challenge-journey'

/** Opt-in development fixture. Never imported by API routes or written to a DB. */
export function makeLeagueDesignDemo(sport:LeagueSport){
 const fixture=makeLeagueRecruitmentDemo(sport),{journey,recruitment}=fixture
 journey.my_department='건축학과'
 const names=sport==='lol'?['건축 캐리단','야간 설계단','도면 밖 한타']:['건축 FC','설계실 유나이티드','캠퍼스 FC']
 const template=structuredClone(journey.challenges[1])
 journey.challenges=journey.challenges.slice(0,2)
 template.id='94000000-0000-4000-8000-000000000201';template.teams[0].id='94000000-0000-4000-8000-000000000202';journey.challenges.push(template)
 journey.challenges.forEach((challenge,index)=>{
  const team=challenge.teams[0];challenge.title=names[index];team.team_name=names[index];team.department='건축학과';team.is_mine=index<2;team.is_captain=index===0;team.may_join=index===2
  team.players.forEach((player,p)=>{player.id=`95000000-0000-4000-8000-${String(index*100+p+1).padStart(12,'0')}`;player.is_me=index<2&&p===0})
 })
 const standings=['건축학과','경영학과','고고학과','컴퓨터공학부','기계공학부','간호학과'].map((department,index)=>({department,played:8,wins:7-index,draws:0,losses:1+index,rating:1320-index*40}))
 journey.standings=standings;journey.monthly_standings=standings
 const source=recruitment.notices[0]
 recruitment.notices=journey.challenges.map((challenge,index)=>({...source,id:`94000000-0000-4000-8000-${String(901+index).padStart(12,'0')}`,challenge_id:challenge.id,team_id:challenge.teams[0].id,team_name:names[index],department:'건축학과',is_captain:index===0,summary:index===0?'편하게 함께할 분, 소통하면서 한 판 해요!':'포지션 바꿔가며 함께해요!',href:`/meetups/league?sport=${sport}&challenge=${challenge.id}`,capacity:LEAGUE_SPORTS[sport].capacity}))
 return fixture
}
