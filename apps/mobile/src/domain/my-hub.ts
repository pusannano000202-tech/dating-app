import type { MobileAppearanceStatus, MobileProfileStep } from '../api/client';

export type MyProfileProgress = {
  completed: number;
  total: 4;
  percent: 0 | 25 | 50 | 75 | 100;
};

export type MyPrimaryRoute =
  | '/profile/basic'
  | '/profile/worldcup'
  | '/profile/survey'
  | '/profile/photos';

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

export function buildMyProfileProgress(step: MobileProfileStep): MyProfileProgress {
  switch (step) {
    case 'basic':
      return { completed: 0, total: 4, percent: 0 };
    case 'worldcup':
      return { completed: 1, total: 4, percent: 25 };
    case 'survey':
      return { completed: 2, total: 4, percent: 50 };
    case 'photos':
      return { completed: 3, total: 4, percent: 75 };
    case 'complete':
      return { completed: 4, total: 4, percent: 100 };
    default:
      return assertNever(step);
  }
}

export function getMyPrimaryAction(step: MobileProfileStep): {
  label: string;
  route: MyPrimaryRoute;
} {
  switch (step) {
    case 'basic':
      return { label: '기본정보 입력하기', route: '/profile/basic' };
    case 'worldcup':
      return { label: '이상형 월드컵 시작하기', route: '/profile/worldcup' };
    case 'survey':
      return { label: '성향 질문 마무리하기', route: '/profile/survey' };
    case 'photos':
      return { label: '프로필 사진 등록하기', route: '/profile/photos' };
    case 'complete':
      return { label: '프로필 확인하기', route: '/profile/basic' };
    default:
      return assertNever(step);
  }
}

export function getAppearanceStatusLabel(status: MobileAppearanceStatus): string {
  switch (status) {
    case 'not_requested':
      return '매칭을 찾을 때 분석해요';
    case 'pending':
      return '분석을 준비하고 있어요';
    case 'ready':
      return '매칭 준비가 되었어요';
    case 'failed':
      return '매칭 찾기에서 다시 시도해요';
    case 'stale':
      return '사진 변경으로 다시 분석이 필요해요';
    case 'unavailable':
      return '분석 상태를 확인하지 못했어요';
    default:
      return assertNever(status);
  }
}
