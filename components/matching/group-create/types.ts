import type { MatchSetupStatus } from '../../../lib/matching/match-setup-status'

export type GroupStatus = 'forming' | 'ready' | 'in_pool' | 'matched' | 'completed' | 'disbanded'
export type GroupRole = 'leader' | 'member'
export type FriendGroupStatus = 'available' | 'invited' | 'in_group'
export type MatchStepState = 'ready' | 'needs_setup'

export interface GroupRecord {
  id: string
  leader_user_id: string
  name: string | null
  size: number
  gender: 'male' | 'female'
  status: GroupStatus
}

export interface GroupMemberRecord {
  group_id: string
  user_id: string
  display_name: string | null
  gender?: 'male' | 'female' | null
  role: GroupRole
  joined_at: string
  left_at: string | null
  match_setup_ready: boolean
  pre_match_card_ready?: boolean
}

export interface GroupInviteRecord {
  id: string
  group_id: string
  invited_phone: string | null
  invited_user_id: string | null
  invite_kind: 'user' | 'phone' | 'link'
  token: string
  status: string
  expires_at: string
  created_at: string
}

export interface FriendSummary {
  user_id: string
  display_name: string
  phone: string | null
  status: 'active'
  group_status: FriendGroupStatus
  match_setup_ready?: boolean
}

export interface GroupState {
  group: GroupRecord | null
  members: GroupMemberRecord[]
  invites: GroupInviteRecord[]
  friends: FriendSummary[]
  current_user_id?: string
  current_user_match_setup?: MatchSetupStatus
}

export type QueueVisualState = {
  male: number
  female: number
  mixed: number
  myGroupSize: number
  myGroupInQueue: boolean
}

export interface MyDeposit {
  id: string
  status: string
  amount: number
}

export interface DepositSummaryRow {
  user_id: string
  display_name: string | null
  role: string
  deposit_status: string
}

export interface DepositSummary {
  rows: DepositSummaryRow[]
  total_active: number
  paid_count: number
  all_paid: boolean
}
