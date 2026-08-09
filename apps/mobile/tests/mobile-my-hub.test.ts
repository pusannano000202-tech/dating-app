import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMyProfileProgress,
  getAppearanceStatusLabel,
  getMyPrimaryAction,
} from '../src/domain/my-hub';

test('builds four-step profile progress from the server next step', () => {
  assert.deepEqual(buildMyProfileProgress('basic'), { completed: 0, total: 4, percent: 0 });
  assert.deepEqual(buildMyProfileProgress('worldcup'), { completed: 1, total: 4, percent: 25 });
  assert.deepEqual(buildMyProfileProgress('survey'), { completed: 2, total: 4, percent: 50 });
  assert.deepEqual(buildMyProfileProgress('photos'), { completed: 3, total: 4, percent: 75 });
  assert.deepEqual(buildMyProfileProgress('complete'), { completed: 4, total: 4, percent: 100 });
});

test('returns the primary action for each profile step', () => {
  assert.deepEqual(getMyPrimaryAction('basic'), { label: '기본정보 입력하기', route: '/profile/basic' });
  assert.deepEqual(getMyPrimaryAction('worldcup'), {
    label: '이상형 월드컵 시작하기',
    route: '/profile/worldcup',
  });
  assert.deepEqual(getMyPrimaryAction('survey'), {
    label: '성향 질문 마무리하기',
    route: '/profile/survey',
  });
  assert.deepEqual(getMyPrimaryAction('photos'), {
    label: '프로필 사진 등록하기',
    route: '/profile/photos',
  });
  assert.deepEqual(getMyPrimaryAction('complete'), { label: '프로필 확인하기', route: '/profile/basic' });
});

test('keeps appearance status labels nonempty and free of numeric scores', () => {
  const statuses = ['not_requested', 'pending', 'ready', 'failed', 'stale', 'unavailable'] as const;
  const expectedLabels: Record<(typeof statuses)[number], string> = {
    not_requested: '매칭을 찾을 때 분석해요',
    pending: '분석을 준비하고 있어요',
    ready: '매칭 준비가 되었어요',
    failed: '매칭 찾기에서 다시 시도해요',
    stale: '사진 변경으로 다시 분석이 필요해요',
    unavailable: '분석 상태를 확인하지 못했어요',
  };

  for (const status of statuses) {
    const label = getAppearanceStatusLabel(status);

    assert.equal(label, expectedLabels[status]);
    assert.notEqual(label.trim(), '');
    assert.doesNotMatch(label, /\d/);
  }
});
