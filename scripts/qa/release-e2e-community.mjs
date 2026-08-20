import { createQaAccount, createRuntime, executeWithCleanup } from './release-e2e-runtime.mjs'

async function rpc(account, fn, args) {
  const { data, error } = await account.client.rpc(fn, args)
  if (error) throw new Error('community_rpc_failed')
  return data
}

async function createPost(runtime, author) {
  const baseUrl = process.env.QA_BASE_URL?.replace(/\/$/, '')
  if (!baseUrl) throw new Error('qa_base_url_missing')
  const response = await fetch(`${baseUrl}/api/community/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${author.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'feedback', title: 'Release QA', body: 'Release QA scenario' }),
  })
  const payload = await response.json().catch(() => null)
  const postId = payload?.post?.id || payload?.post?.post_id
  if (response.status !== 201 || !postId) throw new Error('community_post_create_failed')
  return postId
}

const runtime = await createRuntime('community')
await executeWithCleanup(runtime, async () => {
  const author = await createQaAccount(runtime, 'community-a', 'female')
  const reader = await createQaAccount(runtime, 'community-b', 'male')
  const postId = await createPost(runtime, author)
  const root = await rpc(author, 'create_community_post_comment', { p_post_id: postId, p_body: 'root', p_parent_comment_id: null })
  const replyOne = await rpc(reader, 'create_community_post_comment', { p_post_id: postId, p_body: 'reply-one', p_parent_comment_id: root.id })
  const replyTwo = await rpc(author, 'create_community_post_comment', { p_post_id: postId, p_body: 'reply-two', p_parent_comment_id: replyOne.id })
  const tooDeep = await reader.client.rpc('create_community_post_comment', {
    p_post_id: postId, p_body: 'too-deep', p_parent_comment_id: replyTwo.id,
  })
  if (!tooDeep.error || tooDeep.error.message !== 'reply_depth_exceeded') throw new Error('reply_depth_not_enforced')
  const liked = await rpc(reader, 'toggle_community_comment_reaction', {
    p_post_id: postId, p_comment_id: root.id, p_reaction: 'like',
  })
  const disliked = await rpc(reader, 'toggle_community_comment_reaction', {
    p_post_id: postId, p_comment_id: root.id, p_reaction: 'dislike',
  })
  if (liked?.liked !== true || disliked?.disliked !== true || disliked?.liked === true) {
    throw new Error('comment_reaction_not_exclusive')
  }
  const foreignDelete = await author.client.rpc('delete_community_post_comment', {
    p_post_id: postId, p_comment_id: replyOne.id,
  })
  if (foreignDelete.error || foreignDelete.data !== false) throw new Error('foreign_comment_delete_allowed')
  const remainingComments = await rpc(reader, 'list_community_post_comments', {
    p_post_id: postId, p_limit: 100,
  })
  if (!remainingComments.some((comment) => comment.id === replyOne.id && comment.is_deleted === false)) {
    throw new Error('foreign_comment_delete_allowed')
  }
  await rpc(author, 'delete_community_post_comment', { p_post_id: postId, p_comment_id: root.id })
})
