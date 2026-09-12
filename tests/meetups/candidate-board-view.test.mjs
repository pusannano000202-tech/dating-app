import assert from 'node:assert/strict'
import test from 'node:test'
const {candidateRoomHref,displayCandidates,compatibleSlots,positionLabel}=await import('../../lib/meetups/candidate-board-view.ts')
test('own card is pinned separately without duplicate count or hidden joined users',()=>{
 const mine={id:'a',is_me:true,status:'waiting'},other={id:'b',is_me:false,status:'waiting'}
 assert.deepEqual(displayCandidates([mine,other,{...other,id:'c',status:'joined'}]),[other])
})
test('multi-role availability maps to exactly one compatible invitation seat',()=>{
 const candidate={positions:['defender','forward']},room={slots:['gk','lb','st','cm']}
 assert.deepEqual(compatibleSlots({kind:'league',key:'football'},candidate,room),['lb','st'])
 assert.deepEqual(compatibleSlots({kind:'league',key:'lol'},{positions:['top','mid']},{slots:['jungle','mid']}),['mid'])
 assert.equal(positionLabel('goalkeeper'),'골키퍼')
})
test('discovery return links preserve activity scope and encode course keys',()=>{
 assert.equal(candidateRoomHref({kind:'league',key:'lol'}),'/meetups/league?sport=lol')
 assert.equal(candidateRoomHref({kind:'study',key:'pnu:AN1600527'}),'/meetups/study?course=pnu%3AAN1600527')
 assert.equal(candidateRoomHref({kind:'meetup',key:'evening-dining'}),'/meetups/browse')
})
