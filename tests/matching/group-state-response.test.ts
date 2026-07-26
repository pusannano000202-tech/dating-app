import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('group state contract: fail-closed reads, atomic mutation RPCs, and response identity', () => {
  const routePath = join(process.cwd(), 'app/api/groups/route.ts')
  const route = readFileSync(routePath, 'utf8').replace(/\r\n/g, '\n')

  assert.match(route, /return NextResponse\.json\(\{\s*\.{3}state\.result,\s*current_user_id:\s*user\.id\s*\}\)/)
  assert.match(route, /const stateLoad = await loadGroupState\(supabase, user\.id\)/)
  assert.match(route, /const existingState = await loadGroupState\(supabase, user\.id\)/)
  assert.match(route, /return NextResponse\.json\(\{ \.\.\.existing,\s*current_user_id:\s*user\.id \}\)/)
  assert.match(route, /if \('error' in existingState\) \{\s*return jsonError\(existingState\.error, 500\)\s*\}/)
  assert.match(route, /if \('error' in stateLoad\) \{\s*return jsonError\(stateLoad\.error, 500\)\s*\}/)
  assert.match(route, /if \('error' in state\) \{\s*return jsonError\(state\.error, 500\)\s*\}/)
  assert.match(route, /if \('error' in nextState\) \{\s*return jsonError\(nextState\.error, 500\)\s*\}/)
  assert.match(route, /return NextResponse\.json\(\{\s*\.\.\.nextState\.result,\s*current_user_id:\s*user\.id\s*\}/)
  assert.match(
    route,
    /type LoadGroupStateResult = \{\s*error: 'group_state_read_failed'\s*\} \|\s*\{\s*result: GroupState\s*\}/,
  )
  assert.match(route, /match_pool_status: MatchPoolStatus \| null/)
  assert.match(
    route,
    /\.from\('match_pool'\)\s*\n\s*\.select\('status'\)\s*\n\s*\.eq\('group_id', group\.id\)\s*\n\s*\.in\('status', \['waiting', 'rolled_over'\]\)\s*\n\s*\.maybeSingle\(\)/,
  )
  assert.match(
    route,
    /if \(matchPoolError\) \{\s*return \{ error: 'group_state_read_failed' \}\s*\}/,
  )

  assert.match(
    route,
    /const \{ data: membership, error: membershipError \} = await supabase\s*\n\s*\.from\('group_members'\)\s*\n\s*\.select\('group_id'\)\s*\n\s*\.eq\('user_id', userId\)\s*\n\s*\.is\('left_at', null\)\s*\n\s*\.maybeSingle\(\)\s*\n\s*if \(membershipError\) \{\s*\n\s*return \{ error: 'group_state_read_failed' \}\s*\n\s*\}/,
  )
  assert.match(
    route,
    /if \(!membership\)\s*\{\s*const currentUserSetup = await loadCurrentUserMatchSetup\(supabase, userId\)\s*if \('error' in currentUserSetup\) \{\s*return \{ error: currentUserSetup\.error \}\s*\}\s*return \{\s*result:\s*\{\s*group: null,\s*match_pool_status: null,\s*members: \[\],\s*invites: \[\],\s*friends: \[\],\s*current_user_match_setup: currentUserSetup\.status,\s*\}\s*,?\s*\}\s*\}/,
  )

  assert.match(
    route,
    /const \{ data, error \} = await supabase\s*\n\s*\.from\('groups'\)\s*\n\s*\.select\('id,leader_user_id,name,size,gender,status,created_at,updated_at'\)\s*\n\s*\.eq\('id', groupId\)\s*\n\s*\.maybeSingle\(\)\s*\n\s*if \(error \|\| !data\) \{\s*\n\s*return \{ error: 'group_state_read_failed' \}\s*\n\s*\}\s*return \{ group: data as GroupRecord \}/,
  )

  assert.match(
    route,
    /const \{ data, error \} = await supabase\.rpc\('get_group_member_summaries', \{ p_group_id: groupId \}\)\s*\n\s*if \(error \|\| !data \|\| data\.length === 0\) \{\s*return \{ error: 'group_state_read_failed' \}\s*\}\s*type Row = \{/,
  )

  assert.match(
    route,
    /if \(error \|\| !data \|\| data\.length === 0\) \{\s*return \{ error: 'group_state_read_failed' \}\s*\}/,
  )
  assert.match(route, /const \{ data: profiles, error: profilesError \} = await supabase/)
  assert.match(
    route,
    /if \(profilesError \|\| !profiles \|\| profiles\.length !== members\.length\) \{\s*return \{ error: 'group_state_read_failed' \}\s*\}/,
  )
  assert.match(route, /const \{ data: cardReadiness, error: cardReadinessError \} = await supabase/)
  assert.match(
    route,
    /if \(cardReadinessError\) \{\s*return \{ error: 'group_state_read_failed' \}\s*\}/,
  )
  assert.match(
    route,
    /const invitesState = await loadInvites\(supabase, group\.id\)\s*if \('error' in invitesState\) \{\s*return \{ error: invitesState\.error \}\s*\}/,
  )
  assert.match(
    route,
    /const friendsState = await loadFriends\(supabase, members, invitesState\.invites\)\s*if \('error' in friendsState\) \{\s*return \{ error: friendsState\.error \}\s*\}/,
  )
  assert.match(
    route,
    /const \{ data, error \} = await supabase\s*\.from\('group_invites'\)[\s\S]+if \(error\) \{\s*return \{ error: 'group_state_read_failed' \}\s*\}/,
  )
  assert.match(
    route,
    /const \{ data, error \} = await supabase\.rpc\('get_friend_summaries'\)\s*if \(error\) \{\s*return \{ error: 'group_state_read_failed' \}\s*\}/,
  )
  assert.match(
    route,
    /type MatchSetupLoadResult = \{\s*error: 'group_state_read_failed'\s*\} \|\s*\{\s*status: MatchSetupStatus\s*\}/,
  )

  assert.match(route, /\.rpc\('create_group_with_leader'/)
  assert.match(route, /\.rpc\('update_group_size'/)
  assert.match(route, /group_create_rpc_unavailable/)
  assert.match(route, /group_size_rpc_unavailable/)
  assert.doesNotMatch(route, /\.from\('groups'\)\s*\.insert\(/)
  assert.doesNotMatch(route, /\.from\('group_members'\)\s*\.insert\(/)
  assert.doesNotMatch(route, /group_create_compensation_failed/)
  assert.doesNotMatch(route, /leader_membership_create_failed/)

  assert.match(
    route,
    /const groupState = await loadGroup\(supabase, membership\.group_id\)\s*\n\s*if \('error' in groupState\) \{\s*\n\s*return \{ error: groupState\.error \}\s*\n\s*\}\s*\n\s*const membersState = await loadMembers\(supabase, groupState\.group\.id\)\s*\n\s*if \('error' in membersState\) \{\s*\n\s*return \{ error: membersState\.error \}\s*\n\s*\}\s*\n\s*const group = groupState\.group\s*\n\s*const members = membersState\.members/,
  )

  const idxMembershipQueryEnd = route.indexOf("if (membershipError) {")
  assert.ok(idxMembershipQueryEnd >= 0)
  assert.ok(route.indexOf("const groupState = await loadGroup(supabase, membership.group_id)") >= 0)
  const idxGroupStateLoad = route.indexOf("const groupState = await loadGroup(supabase, membership.group_id)")
  assert.ok(idxMembershipQueryEnd < idxGroupStateLoad)
  const idxGroupStateGuard = route.indexOf("if ('error' in groupState)", idxGroupStateLoad)
  const idxMembersState = route.indexOf("const membersState = await loadMembers(supabase, groupState.group.id)", idxGroupStateLoad)
  const idxMembersStateGuard = route.indexOf("if ('error' in membersState)", idxMembersState)
  const idxGroupAssign = route.indexOf("const group = groupState.group")
  const idxMembersAssign = route.indexOf("const members = membersState.members")
  const idxInvitesAssign = route.indexOf("const invitesState = await loadInvites(supabase, group.id)")
  const idxInvitesGuard = route.indexOf("if ('error' in invitesState)", idxInvitesAssign)
  const idxFriendsAssign = route.indexOf("const friendsState = await loadFriends(supabase, members, invitesState.invites)")
  const idxFriendsGuard = route.indexOf("if ('error' in friendsState)", idxFriendsAssign)
  assert.ok(idxGroupStateGuard >= 0)
  assert.ok(idxMembersState >= 0)
  assert.ok(idxMembersStateGuard >= 0)
  assert.ok(idxGroupAssign >= 0)
  assert.ok(idxMembersAssign >= 0)
  assert.ok(idxInvitesAssign >= 0)
  assert.ok(idxInvitesGuard >= 0)
  assert.ok(idxFriendsAssign >= 0)
  assert.ok(idxFriendsGuard >= 0)
  assert.ok(idxGroupStateGuard < idxMembersState)
  assert.ok(idxMembersState < idxMembersStateGuard)
  assert.ok(idxMembersStateGuard < idxMembersAssign)
  assert.ok(idxMembersAssign < idxInvitesAssign)
  assert.ok(idxInvitesAssign < idxInvitesGuard)
  assert.ok(idxInvitesGuard < idxFriendsAssign)
  assert.ok(idxFriendsAssign < idxFriendsGuard)

  const idxExistingLoad = route.indexOf("const existingState = await loadGroupState(supabase, user.id)")
  const idxProfileLookup = route.indexOf("const { data: profile, error: profileError } = await supabase")
  const idxExistingErrorGuard = route.indexOf("if ('error' in existingState)")
  const idxGroupCreateRpc = route.indexOf("supabase.rpc('create_group_with_leader'")
  assert.ok(idxExistingLoad >= 0)
  assert.ok(idxProfileLookup >= 0)
  assert.ok(idxExistingErrorGuard >= 0)
  assert.ok(idxGroupCreateRpc >= 0)
  assert.ok(idxExistingLoad < idxExistingErrorGuard)
  assert.ok(idxExistingErrorGuard < idxProfileLookup && idxExistingErrorGuard < idxGroupCreateRpc)
  assert.ok(idxProfileLookup < idxGroupCreateRpc)

  const idxGetState = route.indexOf("const state = await loadGroupState(supabase, user.id)")
  const idxGetNext = route.indexOf("if ('error' in state) {")
  assert.ok(idxGetState >= 0)
  assert.ok(idxGetNext >= 0)
  assert.ok(idxGetState < idxGetNext)

  const idxLoadGroupStart = route.indexOf("const { data, error } = await supabase\n    .from('groups')")
  const idxLoadGroupGuard = route.indexOf("if (error || !data)")
  const idxLoadGroupReturn = route.indexOf("return { group: data as GroupRecord }")
  assert.ok(idxLoadGroupStart >= 0)
  assert.ok(idxLoadGroupGuard >= 0)
  assert.ok(idxLoadGroupReturn >= 0)
  assert.ok(idxLoadGroupStart < idxLoadGroupGuard)
  assert.ok(idxLoadGroupGuard < idxLoadGroupReturn)

  const idxLoadMembersStart = route.indexOf("const { data, error } = await supabase.rpc('get_group_member_summaries'")
  const idxLoadMembersGuard = route.indexOf("if (error || !data || data.length === 0)")
  const idxLoadMembersReturn = route.indexOf("return {\n    members: members.map((member) => ({")
  assert.ok(idxLoadMembersStart >= 0)
  assert.ok(idxLoadMembersGuard >= 0)
  assert.ok(idxLoadMembersReturn >= 0)
  assert.ok(idxLoadMembersStart < idxLoadMembersGuard)
  assert.ok(idxLoadMembersGuard < idxLoadMembersReturn)

  const idxNoMembership = route.indexOf('if (!membership) {')
  const idxLoadGroupCall = route.indexOf('const groupState = await loadGroup(supabase, membership.group_id)')
  assert.ok(idxNoMembership >= 0)
  assert.ok(idxLoadGroupCall >= 0)
  assert.ok(idxNoMembership < idxLoadGroupCall)
  const idxNoMembershipSetup = route.indexOf('const currentUserSetup = await loadCurrentUserMatchSetup(supabase, userId)')
  const idxNoMembershipSetupGuard = route.indexOf("if ('error' in currentUserSetup)", idxNoMembershipSetup)
  const idxNoMembershipReturn = route.indexOf('return {\n      result: {')
  assert.ok(idxNoMembership < idxNoMembershipSetup)
  assert.ok(idxNoMembershipSetup < idxNoMembershipSetupGuard)
  assert.ok(idxNoMembershipSetupGuard < idxNoMembershipReturn)

  assert.ok(route.indexOf('const group = membership?.group_id') === -1)
})

test('group RPC error contract: exact tokens, status mapping, and create-race recovery', () => {
  const routePath = join(process.cwd(), 'app/api/groups/route.ts')
  const route = readFileSync(routePath, 'utf8')

  assert.match(route, /function mapGroupRpcError\(operation: GroupRpcOperation, error: GroupRpcError\)/)
  assert.match(route, /function hasGroupRpcErrorToken\(error: GroupRpcError, token: string\)/)
  assert.match(route, /\(\^\|\[\^a-z0-9_\]\)\$\{token\}\(\$\|\[\^a-z0-9_\]\)/)

  assert.match(route, /not_authenticated:\s*\{\s*error: 'not_authenticated',\s*status: 401\s*\}/)
  assert.match(route, /invalid_group_size:\s*\{\s*error: 'invalid_group_size',\s*status: 400\s*\}/)
  assert.match(route, /profile_gender_required:\s*\{\s*error: 'profile_gender_required',\s*status: 400\s*\}/)
  assert.match(route, /user_not_found:\s*\{\s*error: 'user_not_found',\s*status: 404\s*\}/)
  assert.match(route, /already_in_group:\s*\{\s*error: 'already_in_group',\s*status: 409\s*\}/)
  assert.match(route, /group_not_found:\s*\{\s*error: 'group_not_found',\s*status: 404\s*\}/)
  assert.match(route, /not_group_leader:\s*\{\s*error: 'not_group_leader',\s*status: 403\s*\}/)
  assert.match(route, /group_not_editable:\s*\{\s*error: 'group_not_editable',\s*status: 409\s*\}/)
  assert.match(route, /group_size_below_member_count:\s*\{\s*error: 'group_size_below_member_count',\s*status: 409\s*\}/)
  assert.match(route, /function isRpcUnavailableError\(error: GroupRpcError\)/)
  assert.match(route, /error\.code === 'PGRST202'/)
  assert.match(route, /error\.code === '42883'/)

  assert.match(route, /function isCreateGroupConflict\(error: GroupRpcError\)/)
  assert.match(route, /hasGroupRpcErrorToken\(error, 'already_in_group'\)/)
  assert.match(route, /hasGroupRpcErrorToken\(error, 'idx_group_members_active_user_unique'\)/)
  assert.match(route, /const concurrentState = await loadGroupState\(supabase, user\.id\)/)
  assert.match(route, /if \('error' in concurrentState\) \{\s*return jsonError\(concurrentState\.error, 500\)\s*\}/)
  assert.match(route, /if \(concurrentState\.result\.group\) \{\s*return NextResponse\.json\(\{ \.\.\.concurrentState\.result, current_user_id: user\.id \}\)\s*\}/)
  assert.match(route, /return jsonError\('already_in_group', 409\)/)

  assert.match(route, /const mappedError = mapGroupRpcError\('create', rpcError\)/)
  assert.match(route, /const mappedError = mapGroupRpcError\('size', rpcError\)/)
  assert.match(route, /return jsonError\(mappedError\.error, mappedError\.status\)/)
})
