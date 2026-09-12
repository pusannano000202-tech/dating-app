/** Group admission never consumes the preserved historical 1:1/topic contract. */
export type GroupMentoringRole = 'mentor' | 'mentee'
export type GroupMentoringPhase = 'idle' | 'friends' | 'waiting' | 'offered' | 'active' | 'ended' | 'expired'
export type GroupMentoringCommand = { action: 'join' | 'cancel' | 'leave_legacy' | 'party_accept' | 'party_decline' | 'accept' | 'decline' | 'message' | 'plan' | 'end' | 'report'; args: Record<string, unknown> }
export type GroupMentoringSnapshot = {
  phase: GroupMentoringPhase; role: GroupMentoringRole | null; side_size: 2 | 3 | null;
  party_id: string | null; session_id: string | null; server_now: string; expires_at: string | null;
  my_accepted: boolean; party_accepted: number; party_total: number; accepted_count: number; member_count: number;
  members: Array<{ id: string; role: GroupMentoringRole; label: string; mine: boolean }>;
  messages: Array<{ id: string; mine: boolean; alias: string; text: string; created_at: string }>;
  friends: Array<{ user_id: string; label: string }>;
  invitations: Array<{ party_id: string; inviter_label: string; role: GroupMentoringRole; side_size: 2 | 3; expires_at: string }>;
  meeting: { starts_at: string; place: string; revision: number } | null;
  report_targets: Array<{id:string;label:string}>;
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const stamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const role = (v: unknown): v is GroupMentoringRole => v === 'mentor' || v === 'mentee'
const size = (v: unknown): v is 2 | 3 => v === 2 || v === 3
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k))

export function parseGroupMentoringCommand(value: unknown): GroupMentoringCommand | null {
  if (!record(value) || !exact(value, ['action','args']) || !record(value.args)) return null
  const { action, args } = value
  const fields: Record<string, string[]> = {
    join:['role','side_size','friend_ids','client_id'],cancel:[],leave_legacy:[],party_accept:['party_id'],party_decline:['party_id'],
    accept:['session_id'],decline:['session_id'],message:['session_id','text','client_id'],
    plan:['session_id','starts_at','place','revision'],end:['session_id'],report:['session_id','member_id','reason'],
  }
  if (typeof action !== 'string' || !Object.hasOwn(fields, action) || !exact(args, fields[action])) return null
  if (action === 'join') {
    if (!role(args.role) || !size(args.side_size) || !uuid(args.client_id) || !Array.isArray(args.friend_ids)
      || args.friend_ids.length >= args.side_size || args.friend_ids.some(id => !uuid(id))
      || new Set(args.friend_ids.map(id => String(id).toLowerCase())).size !== args.friend_ids.length) return null
  } else if (action.startsWith('party_')) { if (!uuid(args.party_id)) return null }
  else if (!['cancel','leave_legacy'].includes(action) && !uuid(args.session_id)) return null
  if (action === 'message' && (!text(args.text,1000) || !uuid(args.client_id))) return null
  if (action === 'report' && (!text(args.reason,2000) || !uuid(args.member_id))) return null
  if (action === 'plan' && (!stamp(args.starts_at) || !text(args.place,160) || !Number.isSafeInteger(args.revision) || Number(args.revision) < 0)) return null
  return {action: action as GroupMentoringCommand['action'],args}
}

export function parseGroupMentoringSnapshot(value: unknown): GroupMentoringSnapshot | null {
  if (!record(value) || !exact(value,['phase','role','side_size','party_id','session_id','server_now','expires_at','my_accepted','party_accepted','party_total','accepted_count','member_count','members','messages','friends','invitations','meeting','report_targets'])) return null
  if (!['idle','friends','waiting','offered','active','ended','expired'].includes(String(value.phase)) || !stamp(value.server_now)
    || (value.role !== null && !role(value.role)) || (value.side_size !== null && !size(value.side_size))
    || (value.party_id !== null && !uuid(value.party_id)) || (value.session_id !== null && !uuid(value.session_id))
    || (value.expires_at !== null && !stamp(value.expires_at)) || typeof value.my_accepted !== 'boolean') return null
  for (const key of ['party_accepted','party_total','accepted_count','member_count']) if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0 || Number(value[key]) > 6) return null
  if (Number(value.party_accepted) > Number(value.party_total) || Number(value.accepted_count) > Number(value.member_count)) return null
  if (!Array.isArray(value.members) || value.members.length > 6 || value.members.some(m => !record(m) || !exact(m,['id','role','label','mine']) || !uuid(m.id) || !role(m.role) || !text(m.label,160) || typeof m.mine !== 'boolean')) return null
  if (!Array.isArray(value.messages) || value.messages.length > 100 || value.messages.some(m => !record(m) || !exact(m,['id','mine','alias','text','created_at']) || !uuid(m.id) || typeof m.mine !== 'boolean' || !text(m.alias,160) || !text(m.text,1000) || !stamp(m.created_at))) return null
  if (!Array.isArray(value.friends) || value.friends.length > 100 || value.friends.some(f => !record(f) || !exact(f,['user_id','label']) || !uuid(f.user_id) || !text(f.label,160))) return null
  if (!Array.isArray(value.invitations) || value.invitations.length > 20 || value.invitations.some(i => !record(i) || !exact(i,['party_id','inviter_label','role','side_size','expires_at']) || !uuid(i.party_id) || !text(i.inviter_label,160) || !role(i.role) || !size(i.side_size) || !stamp(i.expires_at))) return null
  if (!Array.isArray(value.report_targets) || value.report_targets.length>5 || value.report_targets.some(m=>!record(m)||!exact(m,['id','label'])||!uuid(m.id)||!text(m.label,160))) return null
  if (!['active','ended','expired'].includes(String(value.phase)) && value.report_targets.length) return null
  if (value.report_targets.length && (!uuid(value.session_id)||!value.my_accepted||value.accepted_count!==value.member_count||![4,6].includes(Number(value.member_count))||value.report_targets.length!==Number(value.member_count)-1)) return null
  if (value.meeting !== null && (!record(value.meeting) || !exact(value.meeting,['starts_at','place','revision']) || !stamp(value.meeting.starts_at) || !text(value.meeting.place,160) || !Number.isSafeInteger(value.meeting.revision) || Number(value.meeting.revision) < 1)) return null
  if (['friends','waiting','offered','active'].includes(String(value.phase)) && (!role(value.role) || !size(value.side_size) || !uuid(value.party_id) || !stamp(value.expires_at))) return null
  if (['offered','active'].includes(String(value.phase)) && (!uuid(value.session_id) || value.member_count !== Number(value.side_size)*2)) return null
  if (value.phase === 'active') {
    if (value.accepted_count !== value.member_count || !value.my_accepted || value.members.length !== value.member_count
      || value.members.filter(m => m.mine).length !== 1 || value.members.filter(m => m.role === 'mentor').length !== value.side_size
      || new Set(value.members.map(m => m.id)).size !== value.members.length) return null
  } else if (value.members.length || value.messages.length || value.meeting !== null) return null
  return value as GroupMentoringSnapshot
}

export function groupMentoringError(error: {message?:string;code?:string}) {
  const message = error.message ?? ''
  if (/not_authenticated/.test(message)) return {error:'auth_required',status:401}
  if (/profile_required|department_identity_required/.test(message)) return {error:'profile_required',status:409}
  if (/forbidden/.test(message) || error.code === '42501') return {error:'forbidden',status:403}
  for (const code of ['already_waiting','friend_unavailable','not_active','legacy_active','conflict']) if (message.includes(`mentoring_${code}`)) return {error:code,status:409}
  if (/mentoring_rate_limited/.test(message)) return {error:'rate_limited',status:429}
  if (/mentoring_invalid/.test(message) || ['22P02','22007','22008','22003'].includes(error.code??'')) return {error:'invalid',status:400}
  return {error:'unavailable',status:503}
}
