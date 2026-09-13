import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import ts from 'typescript'

async function load(path) {
  assert.ok(existsSync(path), `${path} must exist`)
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

test('delivery is paused from discovery without deleting browser records', async () => {
  const { COMMUNITY_EXPERIENCES } = await load('lib/community/experience-explorer.ts')
  assert.deepEqual(COMMUNITY_EXPERIENCES.map(x => x.id), ['visit', 'mbti', 'places'])
  for (const path of ['components/community/CommunityPortal.tsx', 'components/home/QuantumHomeRecommendations.tsx']) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /배달/)
  }
  const route = readFileSync('app/(campus-eats)/community/campus-eats/delivery/page.tsx', 'utf8')
  assert.match(route, /redirect\('\/community\/content'\)/)
  assert.ok(existsSync('components/campus-eats/DeliveryWorldcup.tsx'))
})

test('home cards reach selected detail rather than discard the clicked context', async () => {
  const { meetupDestination, postDestination } = await load('lib/community/journey-links.ts')
  assert.equal(meetupDestination('a/b'), '/meetups/a%2Fb')
  assert.equal(postDestination('relationship-advice', 'post-id'), '/community/relationship-advice/post-id')
  assert.equal(postDestination('unknown', 'post-id'), '/community/stories')
  const source = readFileSync('components/home/QuantumHomePulse.tsx', 'utf8')
  assert.match(source, /href=\{meetupDestination\(meetup.id\)\}/)
  assert.match(source, /href=\{postDestination\(post.category, post.id\)\}/)
})

test('activity packs offer distinct preparation, prompts and endings without changing shared state', async () => {
  const { getActivityContent } = await load('lib/meetups/activity-content.ts')
  const cafe = getActivityContent('campus-cafe-chat', 'dining')
  const gaming = getActivityContent('team-gaming', 'gaming')
  const shopping = getActivityContent('campus-small-shop', 'other')
  assert.notEqual(cafe.start, gaming.start)
  assert.notEqual(shopping.activity, cafe.activity)
  assert.match(gaming.prepare, /게임.*모드.*역할/)
  assert.match(shopping.activity, /구매.*촬영/)
  for (const [id, category] of [['campus-cafe-chat','dining'],['team-gaming','gaming'],['x','running'],['x','badminton'],['x','study'],['x','board_game'],['x','walking'],['x','other']]) {
    const pack = getActivityContent(id, category)
    assert.equal(pack.prompts.length >= 3, true)
    assert.ok(pack.prepare && pack.start && pack.activity && pack.wrap)
  }
  const ui = readFileSync('components/meetups/ActivityPromptDeck.tsx', 'utf8')
  assert.match(ui, /자유롭게 진행/)
  assert.doesNotMatch(ui, /fetch\(|supabase|advance_shared/)
})

test('editorial starters use allowlisted draft ids, not fake member posts or auto submission', async () => {
  const { STORY_PROMPTS, storyDraft } = await load('lib/community/story-prompts.ts')
  for (const prompt of STORY_PROMPTS) {
    assert.equal(storyDraft(prompt.category, prompt.id)?.title, prompt.title)
    assert.equal(storyDraft('meetup-review', prompt.id), null)
  }
  assert.equal(storyDraft('feedback', '<script>'), null)
  const ui = readFileSync('components/community/StoryStarters.tsx', 'utf8')
  assert.match(ui, /운영자가 제안하는/)
  assert.match(ui, /글 초안 열기/)
  assert.doesNotMatch(ui, /fetch\(|like_count|author_alias/)
})

test('voice prompts differ by role and topic and never perform participation actions', async () => {
  const { voiceConversationPrompts } = await load('lib/community/voice-conversation-prompts.ts')
  const listener = voiceConversationPrompts({ topic: 'worries', adviceRole: 'listener' })
  const speaker = voiceConversationPrompts({ topic: 'worries', adviceRole: 'talker' })
  assert.notDeepEqual(listener.cards, speaker.cards)
  assert.match(listener.cards.join(' '), /들어|듣|조언/)
  assert.equal(voiceConversationPrompts({ topic: 'lck' }).nextHref, '/meetups?category=gaming')
  assert.match(voiceConversationPrompts({ topic: 'social', scope: 'department' }).cards.join(' '), /학과|수업/)
  for (const context of [{topic:'lck'}, {topic:'baseball'}, {topic:'worries'}, {topic:'social'}, {topic:'unknown'}]) {
    assert.ok(voiceConversationPrompts(context).cards.length >= 3)
  }
  const ui = readFileSync('components/social/VoiceConversationPrompts.tsx', 'utf8')
  assert.match(ui, /자유롭게 대화/)
  assert.doesNotMatch(ui, /fetch\(|getUserMedia|\.join\(/)
})

test('result and activity endings offer voluntary next steps without copying private responses', () => {
  assert.match(readFileSync('components/campus-eats/CampusEatsPilot.tsx', 'utf8'), /starter=cafe-or-walk/)
  const mbti = readFileSync('components/community/mbti/MbtiStats.tsx', 'utf8')
  assert.match(mbti, /starter=first-hello/)
  assert.match(mbti, /응답.*옮겨지지/)
  const guide = readFileSync('components/meetups/LiveActivityGuide.tsx', 'utf8')
  assert.match(guide, /\['wrap', 'next'\]\.includes\(scene.id\)/)
  assert.match(guide, /href="\/friends"/)
})
