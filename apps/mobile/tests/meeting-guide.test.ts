import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GUIDE_NAVIGATION_LABELS,
  GUIDE_POSTER_ASPECT_RATIO,
  MEETING_GUIDE_GRID,
  MEETING_GUIDE_MIN_TOUCH_TARGET,
  MEETING_GUIDE_SCENES,
  MEETING_GUIDE_VOLUNTARY_SUPPORT_OPTIONS,
  getGuidePosterLayout,
  getGuideProgressLabel,
  getGuideSceneByIndex,
  getGuideSceneImageCell,
  type MeetingGuideScene,
} from '../src/domain/meeting-guide';

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

test('meeting guide has exactly 6 scenes in strict step order', () => {
  assert.equal(MEETING_GUIDE_SCENES.length, 6);
  for (let index = 0; index < MEETING_GUIDE_SCENES.length; index += 1) {
    const scene = getGuideSceneByIndex(index);
    assert.equal(scene.stepNumber, index + 1);
    assert.equal(scene.title.startsWith(`${index + 1}.`), true);
    assert.equal(scene.title.length > 0, true);
    assert.equal(scene.description.length > 0, true);
  }
});

test('every guide scene is told through participant speech and a final Quantum verdict', () => {
  for (const scene of MEETING_GUIDE_SCENES) {
    const dialogue = (scene as MeetingGuideScene & {
      dialogue?: readonly { speaker: string; text: string; tone: string }[];
    }).dialogue;

    assert.ok(dialogue, `${scene.title} should provide dialogue bubbles`);
    assert.equal(dialogue.length >= 2 && dialogue.length <= 3, true);
    assert.equal(dialogue[0]?.speaker === '참가자' || dialogue[0]?.speaker === '팀원', true);
    assert.equal(dialogue.at(-1)?.speaker, 'Quantum');
    assert.equal(dialogue.every((bubble) => bubble.text.trim().length > 0), true);
  }
});

test('personal contact scene shows a direct prohibited-action warning in dialogue', () => {
  const scene = getGuideSceneByIndex(1) as MeetingGuideScene & {
    dialogue?: readonly { speaker: string; text: string; tone: string }[];
  };
  const combined = scene.dialogue?.map((bubble) => bubble.text).join(' ') ?? '';

  assert.equal(includesAny(combined, ['인스타', '전화번호', '카카오톡']), true);
  assert.equal(includesAny(combined, ['금지됩니다', '요구하지 마세요']), true);
  assert.equal(scene.dialogue?.at(-1)?.tone, 'warning');
});

test('scene 6 uses event-only pseudonym (app provided or user-chosen) and public venue', () => {
  const scene = getGuideSceneByIndex(5);
  assert.equal(scene.title.includes('행사 전용 가명'), true);
  assert.equal(includesAny(`${scene.title} ${scene.description}`, ['앱이 제시한 가명', '직접', '선택']), true);
  assert.equal(includesAny(`${scene.description} ${scene.details.join(' ')}`, ['공개장소', '공개 장소']), true);
});

test('scene 1 is team-wide chat opening 20 minutes before', () => {
  const scene = getGuideSceneByIndex(0);
  const combined = `${scene.title} ${scene.description} ${scene.details.join(' ')}`;
  assert.equal(scene.title.includes('시작 20분 전'), true);
  assert.equal(includesAny(combined, ['팀 채팅', '팀 단위', '전체 채팅']), true);
  assert.equal(includesAny(combined, ['1:1']), false);
});

test('scene 2 bans personal request words and uses app report flow', () => {
  const scene = getGuideSceneByIndex(1);
  const combined = `${scene.title} ${scene.description} ${scene.details.join(' ')}`;
  assert.equal(includesAny(combined, ['본명', '전화번호', '카카오톡', '인스타그램']), true);
  assert.equal(includesAny(combined, ['앱 내 신고', '신고']), true);
  assert.equal(includesAny(combined, ['스태프']), false);
});

test('scene 3 is 90~150-minute flow with safe return without 2nd/external requests', () => {
  const scene = getGuideSceneByIndex(2);
  assert.equal(includesAny(scene.description, ['시작 후 90~150분', '90~150분']), true);
  assert.equal(includesAny(scene.description, ['귀가']), true);
  assert.equal(includesAny(scene.description + scene.details.join(' '), ['2차', '외부 연락처']), true);
  assert.equal(includesAny(scene.title + scene.description + scene.details.join(' '), ['스태프']), false);
});

test('scene 4 expresses 시작 10분 후 노쇼 and group photo for attendance/dispute evidence only', () => {
  const scene = getGuideSceneByIndex(3);
  const combined = `${scene.title} ${scene.description} ${scene.details.join(' ')}`;
  assert.equal(includesAny(combined, ['시작 10분 후']), true);
  assert.equal(includesAny(combined, ['노쇼', '지각']), true);
  assert.equal(includesAny(combined, ['단체사진은 출석/분쟁 증빙 전용']), true);
  assert.equal(includesAny(combined, ['프로필', '홍보', '외모분석']), true);
  assert.equal(includesAny(combined, ['사용하지 않습니다', '사용하지 않아야', '미사용']), true);
});

test('scene 5 separates deposit from voluntary support options and avoids claiming payment completion', () => {
  const scene = getGuideSceneByIndex(4);
  const combined = `${scene.title} ${scene.description} ${scene.details.join(' ')}`;
  assert.equal(includesAny(combined, ['보증금', '1만원']), true);
  assert.equal(includesAny(combined, ['전액 반환', '다음 매칭', '이월']), true);
  assert.equal(includesAny(combined, ['결제 완료']), false);
  assert.equal(includesAny(scene.title, ['애프터', '자율후원']), true);
  for (const option of MEETING_GUIDE_VOLUNTARY_SUPPORT_OPTIONS) {
    assert.equal(includesAny(combined, [option]), true);
  }
});

test('guide panel layout is exactly 2x3 and each scene maps to a unique sprite cell', () => {
  assert.equal(MEETING_GUIDE_GRID.columns, 2);
  assert.equal(MEETING_GUIDE_GRID.rows, 3);

  const used = new Set<string>();
  for (const scene of MEETING_GUIDE_SCENES) {
    const cell = getGuideSceneImageCell(scene.stepNumber - 1);
    assert.ok(cell.column >= 0 && cell.column < MEETING_GUIDE_GRID.columns);
    assert.ok(cell.row >= 0 && cell.row < MEETING_GUIDE_GRID.rows);
    const key = `${cell.row}-${cell.column}`;
    assert.equal(used.has(key), false, `${key} should be unique`);
    used.add(key);
  }
});

test('guide image crop uses full scene width with 2x3 poster ratio', () => {
  const layout = getGuidePosterLayout(360);
  assert.equal(layout.cellWidth, 360);
  assert.equal(layout.posterWidth, 360 * MEETING_GUIDE_GRID.columns);
  assert.equal(layout.posterHeight, layout.posterWidth * GUIDE_POSTER_ASPECT_RATIO);
  assert.equal(layout.cellHeight, layout.posterHeight / MEETING_GUIDE_GRID.rows);
});

test('navigation labels and touch target sizes satisfy accessibility constraints', () => {
  assert.equal(GUIDE_NAVIGATION_LABELS.previous, '이전');
  assert.equal(GUIDE_NAVIGATION_LABELS.next, '다음');
  assert.equal(GUIDE_NAVIGATION_LABELS.finish, '완료');
  assert.equal(MEETING_GUIDE_MIN_TOUCH_TARGET >= 44, true);
});

test('progress label is stable and includes current and total in format', () => {
  const progress = MEETING_GUIDE_SCENES.map((_: MeetingGuideScene, index) => getGuideProgressLabel(index));
  assert.equal(progress[0], '1/6');
  assert.equal(progress[5], '6/6');
  assert.equal(progress.length, 6);
});
