import type { DepositSummary, GroupState, QueueVisualState } from './types'
import {
  DEV_PREVIEW_CURRENT_USER_ID,
  DEV_PREVIEW_FRIEND_MINJI_ID,
  DEV_PREVIEW_GROUP_ID,
  DEV_PREVIEW_GROUP_MEMBERS,
} from '../../../lib/matching/dev-preview-group'
import { EMPTY_MATCH_SETUP_STATUS } from '../../../lib/matching/match-setup-status'

const nowIso = new Date().toISOString()

export const EMPTY_STATE: GroupState = {
  group: null,
  members: [],
  invites: [],
  friends: [],
}

export const DEV_GROUP_STATE: GroupState = {
  group: {
    id: DEV_PREVIEW_GROUP_ID,
    leader_user_id: DEV_PREVIEW_CURRENT_USER_ID,
    name: 'Booting preview group',
    size: 3,
    gender: 'male',
    status: 'forming',
  },
  members: DEV_PREVIEW_GROUP_MEMBERS.map((member) => ({
    group_id: DEV_PREVIEW_GROUP_ID,
    user_id: member.user_id,
    display_name: member.display_name,
    role: member.role === 'leader' ? 'leader' : 'member',
    joined_at: nowIso,
    left_at: null,
    match_setup_ready: true,
  })),
  invites: [],
  friends: [
    {
      user_id: 'dev-user-3',
      display_name: '서윤',
      phone: null,
      status: 'active',
      group_status: 'available',
      match_setup_ready: true,
    },
    {
      user_id: 'dev-user-4',
      display_name: '지민',
      phone: null,
      status: 'active',
      group_status: 'available',
      match_setup_ready: true,
    },
  ],
  current_user_id: DEV_PREVIEW_CURRENT_USER_ID,
  current_user_match_setup: EMPTY_MATCH_SETUP_STATUS,
}

export const DEV_QUEUE_VISUAL: QueueVisualState = {
  male: 8,
  female: 6,
  mixed: 3,
  myGroupSize: DEV_PREVIEW_GROUP_MEMBERS.length,
  myGroupInQueue: true,
}

export const QUEUE_VISUAL_DEFAULT: QueueVisualState = {
  male: 0,
  female: 0,
  mixed: 0,
  myGroupSize: 0,
  myGroupInQueue: false,
}

export const DEV_DEPOSIT_SUMMARY: DepositSummary = {
  rows: [
    { user_id: DEV_PREVIEW_CURRENT_USER_ID, display_name: '나', role: 'leader', deposit_status: 'paid' },
    { user_id: DEV_PREVIEW_FRIEND_MINJI_ID, display_name: '민지', role: 'member', deposit_status: 'pending' },
  ],
  total_active: 2,
  paid_count: 1,
  all_paid: false,
}
