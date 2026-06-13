import type { DepositSummary, GroupState, QueueVisualState } from './types'

export const EMPTY_STATE: GroupState = {
  group: null,
  members: [],
  invites: [],
  friends: [],
}

export const DEV_GROUP_STATE: GroupState = {
  group: {
    id: 'dev-group-1',
    leader_user_id: 'dev-user-1',
    name: 'Booting preview group',
    size: 3,
    gender: 'male',
    status: 'forming',
  },
  members: [
    {
      group_id: 'dev-group-1',
      user_id: 'dev-user-1',
      display_name: 'Me',
      role: 'leader',
      joined_at: new Date().toISOString(),
      left_at: null,
      match_setup_ready: true,
    },
    {
      group_id: 'dev-group-1',
      user_id: 'dev-user-2',
      display_name: 'Friend A',
      role: 'member',
      joined_at: new Date().toISOString(),
      left_at: null,
      match_setup_ready: true,
    },
  ],
  invites: [],
  friends: [
    {
      user_id: 'dev-user-3',
      display_name: 'Friend B',
      phone: '010-0000-0000',
      status: 'active',
      group_status: 'available',
      match_setup_ready: true,
    },
    {
      user_id: 'dev-user-4',
      display_name: 'Friend C',
      phone: '010-1111-1111',
      status: 'active',
      group_status: 'available',
      match_setup_ready: true,
    },
  ],
  current_user_id: 'dev-user-1',
}

export const DEV_QUEUE_VISUAL: QueueVisualState = {
  male: 8,
  female: 6,
  myGroupSize: 1,
  myGroupInQueue: true,
}

export const QUEUE_VISUAL_DEFAULT: QueueVisualState = {
  male: 0,
  female: 0,
  myGroupSize: 0,
  myGroupInQueue: false,
}

export const DEV_DEPOSIT_SUMMARY: DepositSummary = {
  rows: [
    { user_id: 'dev-user-1', display_name: 'Me', role: 'leader', deposit_status: 'paid' },
    { user_id: 'dev-user-2', display_name: 'Friend A', role: 'member', deposit_status: 'pending' },
  ],
  total_active: 2,
  paid_count: 1,
  all_paid: false,
}
