import 'server-only'
import {lookup} from 'node:dns'
import {Agent} from 'node:https'
import {BlockList, isIP} from 'node:net'
import webPush from 'web-push'
import {allowedCommonPushEndpoint,commonPushPayload, type commonPushConfig, type CommonPushClaim} from './web-push-contract'

const denied = new BlockList()
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)denied.addSubnet(address,prefix,'ipv4')
const globalV6=new BlockList();globalV6.addSubnet('2000::',3,'ipv6')
denied.addSubnet('2001:db8::',32,'ipv6')
// Validate the actual connection lookup, not an earlier DNS result susceptible
// to rebinding. Exact provider host allowlist is independently applied below.
const agent=new Agent({lookup(hostname,options,callback){
 lookup(hostname,{all:true},(error,addresses)=>{
  if(error){callback(error,'',4);return}
  if(!addresses.length||addresses.some(({address})=>isIP(address)===4?denied.check(address,'ipv4'):!globalV6.check(address,'ipv6')||denied.check(address,'ipv6'))){callback(new Error('invalid_endpoint'),'',4);return}
  if(options.all)callback(null,addresses)
  else {const chosen=addresses.find(a=>!options.family||a.family===options.family)??addresses[0];callback(null,chosen.address,chosen.family)}
 })
}})
export async function sendCommonWebPush(delivery:CommonPushClaim,config:ReturnType<typeof commonPushConfig>) {
 if(!config.ready||!allowedCommonPushEndpoint(delivery.endpoint))throw new Error('invalid_endpoint')
 // Per-request VAPID avoids changing the global config of the existing Tonight
 // or Campus Seven senders, which may run in the same server process.
 await webPush.sendNotification({endpoint:delivery.endpoint,keys:{p256dh:delivery.p256dh,auth:delivery.auth_secret}},JSON.stringify(commonPushPayload(delivery.notification_id)),{
  vapidDetails:{subject:config.subject,publicKey:config.publicKey,privateKey:config.privateKey},
  agent,TTL:600,urgency:'normal',topic:delivery.notification_id.replace(/-/g,'').slice(0,32),timeout:8000,
 })
}
