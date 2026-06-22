export type DevPreviewGroupMember = {
  group_id: string
  user_id: string
  display_name: string | null
  gender: 'male' | 'female' | null
  role: 'leader' | 'member'
  joined_at: string
  left_at: string | null
  match_setup_ready?: boolean
}

export const DEV_PREVIEW_GROUP_ID = 'dev-preview-group'
export const DEV_PREVIEW_CURRENT_USER_ID = 'dev-preview-user'
export const DEV_PREVIEW_FRIEND_MINJI_ID = 'dev-preview-friend-minji'

export const DEV_PREVIEW_GROUP = {
  id: DEV_PREVIEW_GROUP_ID,
  leader_user_id: DEV_PREVIEW_CURRENT_USER_ID,
  status: 'forming',
  size: 3,
} as const

export const DEV_PREVIEW_GROUP_MEMBERS: DevPreviewGroupMember[] = [
  {
    group_id: DEV_PREVIEW_GROUP_ID,
    user_id: DEV_PREVIEW_CURRENT_USER_ID,
    display_name: '나',
    gender: 'male',
    role: 'leader',
    joined_at: 'dev-preview',
    left_at: null,
    match_setup_ready: false,
  },
  {
    group_id: DEV_PREVIEW_GROUP_ID,
    user_id: DEV_PREVIEW_FRIEND_MINJI_ID,
    display_name: '민지',
    gender: 'female',
    role: 'member',
    joined_at: 'dev-preview',
    left_at: null,
    match_setup_ready: true,
  },
]
