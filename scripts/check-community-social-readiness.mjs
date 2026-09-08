import {pathToFileURL} from 'node:url'

// Presence/shape checks only: this never calls a provider or prints a secret value.
export function communitySocialReadiness(env) {
  const rows=[]
  const required=(key,minimum=1)=>rows.push({key,status:typeof env[key]==='string'&&env[key].trim().length>=minimum?'CONFIGURED_NOT_VERIFIED':'MISSING_OR_INVALID'})
  for(const key of ['NEXT_PUBLIC_SUPABASE_URL','LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET','SERVICE_OPERATOR_NAME','SERVICE_OPERATOR_ADDRESS','SERVICE_OPERATOR_CONTACT','PRIVACY_CONTACT'])required(key)
  for(const key of ['FRIEND_INVITE_TOKEN_SECRET','CRON_SECRET','PHONE_VERIFICATION_DIGEST_SECRET'])required(key,32)
  rows.push({key:'Supabase public credential',status:env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY?'CONFIGURED_NOT_VERIFIED':'MISSING_OR_INVALID'})
  rows.push({key:'Supabase server credential',status:env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY?'CONFIGURED_NOT_VERIFIED':'MISSING_OR_INVALID'})
  rows.push({key:'NEXT_PUBLIC_COMMUNITY_ENABLED',status:env.NEXT_PUBLIC_COMMUNITY_ENABLED==='true'?'CONFIGURED_NOT_VERIFIED':'LAUNCH_DISABLED'})
  rows.push({key:'ACCOUNT_DELETION_WORKER_ENABLED',status:env.ACCOUNT_DELETION_WORKER_ENABLED==='true'?'CONFIGURED_NOT_VERIFIED':'DESTRUCTIVE_WORKER_DISABLED'})
  rows.push({key:'SUPABASE_PHONE_OTP_TTL_SECONDS',status:/^[1-9][0-9]*$/.test(env.SUPABASE_PHONE_OTP_TTL_SECONDS||'')?'CONFIGURED_NOT_VERIFIED':'MISSING_OR_INVALID'})
  return rows
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const rows=communitySocialReadiness(process.env)
 console.table(rows)
 console.log('Configuration is not connection proof. Still require approved DB migration, SMS delivery, Realtime, 3-device LiveKit/webhook/revocation, retention dry-run and approved cleanup, legal review, and deployment checks. Never enable destructive workers merely to make this check pass.')
 process.exitCode=rows.some(row=>row.status!=='CONFIGURED_NOT_VERIFIED')?1:0
}
