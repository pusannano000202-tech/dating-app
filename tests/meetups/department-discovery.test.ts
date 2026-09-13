import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseDepartmentMeetups, presentDepartmentMeetups, type DepartmentMeetup } from '../../components/meetups/department-discovery'
import * as discovery from '../../components/meetups/department-discovery'

const now = Date.parse('2026-09-09T00:00:00.000Z')

function meetup(index: number, changes: Partial<DepartmentMeetup> = {}): DepartmentMeetup {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    category: 'gaming', title: `우리 과 게임 모임 ${index}`, description: '', place_name: '학교 앞 PC방',
    scheduled_at: `2026-09-${String(10 + index).padStart(2, '0')}T09:00:00.000Z`,
    ends_at: `2026-09-${String(10 + index).padStart(2, '0')}T12:00:00.000Z`,
    capacity: 5, status: 'open', member_count: 1, joined: false, is_host: false,
    created_at: '2026-09-08T00:00:00.000Z', gender_mode: 'all', gender_eligibility: 'eligible',
    scope_type: 'department', department_label: '기계공학부', activity_key: null, ...changes,
  }
}

test('empty is valid only for an array; malformed and school-scope responses are not empty recruitment', () => {
  assert.deepEqual(parseDepartmentMeetups([]), [])
  assert.equal(parseDepartmentMeetups(undefined), null)
  assert.equal(parseDepartmentMeetups({ meetups: [] }), null)
  assert.equal(parseDepartmentMeetups([{ ...meetup(1), scope_type: 'school' }]), null)
  assert.equal(parseDepartmentMeetups([{ ...meetup(1), department_label: '' }]), null)
  assert.equal(parseDepartmentMeetups([{ ...meetup(1), member_count: '2' }]), null)
  assert.equal(parseDepartmentMeetups([meetup(1), meetup(1)]), null)
})
test('an explicit pending room is offered without accepting malformed confirmed data',()=>{
  const pending=meetup(1,{scheduled_at:null,ends_at:null,place_name:null,schedule_status:'schedule_pending'})
  assert.deepEqual(parseDepartmentMeetups([pending]),[pending])
  assert.deepEqual(presentDepartmentMeetups([pending],now).recommended,[pending])
  assert.equal(parseDepartmentMeetups([{...pending,schedule_status:'confirmed'}]),null)
  assert.equal(parseDepartmentMeetups([{...pending,scheduled_at:'2026-09-20T10:00:00Z'}]),null)
})

test('recommendation keeps three actual open rooms and retains every other room for show all', () => {
  const records = [meetup(4), meetup(1), meetup(3), meetup(2)]
  const result = presentDepartmentMeetups(records, now)
  assert.deepEqual(result.recommended.map(row => row.id), [meetup(1).id, meetup(2).id, meetup(3).id])
  assert.equal(result.available.length, 4)
  assert.equal(result.available[3].id, meetup(4).id)
  assert.equal(records[0].id, meetup(4).id, 'presentation must not mutate the loaded records')
})

test('full, ineligible, and already-started rooms remain accessible but are not recommended as open seats', () => {
  const full = meetup(1, { status: 'full', member_count: 5 })
  const genderRestricted = meetup(2, { gender_eligibility: 'gender_restricted', gender_mode: 'female_only' })
  const genderMissing = meetup(3, { gender_eligibility: 'gender_required' })
  const started = meetup(4, { scheduled_at: '2026-09-08T09:00:00.000Z' })
  const open = meetup(5)
  const result = presentDepartmentMeetups([full, genderRestricted, genderMissing, started, open], now)
  assert.deepEqual(result.recommended, [open])
  assert.equal(result.available.length, 5)
  assert.equal(result.available[0].id, open.id)
})

test('membership and host rooms are preserved for continuation and never offered as fresh enrollment', () => {
  const joined = meetup(1, { joined: true })
  const host = meetup(2, { is_host: true })
  const open = meetup(3)
  const result = presentDepartmentMeetups([joined, open, host], now)
  assert.deepEqual(result.joined, [joined, host])
  assert.deepEqual(result.recommended, [open])
  assert.deepEqual(result.available, [open])
})

test('within the same schedule an existing older room is recommended first and order stays stable', () => {
  const recent = meetup(1)
  const older = meetup(2, { scheduled_at: recent.scheduled_at, created_at: '2026-09-07T00:00:00.000Z' })
  assert.deepEqual(presentDepartmentMeetups([recent, older], now).recommended, [older, recent])
  assert.deepEqual(presentDepartmentMeetups([older, recent], now).recommended, [older, recent])
})

test('joined and host cards keep recruitment counts and actions instead of reducing to a joined label',()=>{
  assert.ok('getDepartmentMeetupCardState' in discovery,'every card needs independent membership and recruitment states')
  const card=discovery.getDepartmentMeetupCardState as (room:DepartmentMeetup,now:number)=>{roleLabel:string|null;statusLabel:string;remaining:number;primaryHref:string;primaryLabel:string;applicationsHref:string|null}
  const host=meetup(1,{is_host:true,joined:true,member_count:3})
  assert.deepEqual(card(host,now),{roleLabel:'내가 연 모임',statusLabel:'모집 중',remaining:2,primaryHref:`/chat/rooms/meetup/${host.id}`,primaryLabel:'채팅 열기',applicationsHref:`/meetups/${host.id}/applications`})
  const joined=card(meetup(2,{joined:true,status:'full',member_count:5}),now)
  assert.equal(joined.roleLabel,'참여 중')
  assert.equal(joined.statusLabel,'모집 마감')
  assert.equal(joined.remaining,0)
  assert.equal(joined.applicationsHref,null)
  const visitor=card(meetup(3),now)
  assert.equal(visitor.roleLabel,null)
  assert.equal(visitor.primaryHref,`/meetups/${meetup(3).id}`)
  assert.equal(visitor.primaryLabel,'모임 살펴보기')
  assert.equal(card(meetup(4,{scheduled_at:'2026-09-08T09:00:00.000Z'}),now).statusLabel,'활동 시작')
})
