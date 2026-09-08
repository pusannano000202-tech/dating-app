export type HomeRecommendationId = 'tonight' | 'meetup' | 'campus-eats' | 'feedback';
export type HomeRecommendationHref = '/match' | '/meetups' | '/community';

export type HomeRecommendation = {
  id: HomeRecommendationId;
  href: HomeRecommendationHref;
  eyebrow: string;
  title: string;
  description: string;
  action: string;
};

export type HomeRecommendationWave = {
  primary: HomeRecommendation;
  secondary: readonly HomeRecommendation[];
};

type HomeEventCatalog = {
  tonight: readonly TonightEvent[];
  scheduled: readonly TonightEvent[];
};

const fallbackRecommendation: HomeRecommendation = {
  id: 'campus-eats',
  href: '/community',
  eyebrow: '오늘 한 판',
  title: '부산대 돈까스 월드컵 해보기',
  description: '커뮤니티에서 바로 대결을 시작할 수 있어요.',
  action: '월드컵 시작',
};

const tonightFallback: HomeRecommendation = {
  id: 'tonight',
  href: '/match',
  eyebrow: '오늘 밤',
  title: '오늘 밤 약속 찾아보기',
  description: '열린 활동을 확인하고 마음에 들면 참여해요.',
  action: '약속 보기',
};

const meetupRecommendation: HomeRecommendation = {
    id: 'meetup',
    href: '/meetups',
    eyebrow: '내가 여는 모임',
    title: '같이 할 모임 만들기',
    description: '운동, 공부, 맛집처럼 하고 싶은 일을 골라요.',
    action: '모임 보러 가기',
};

const feedbackRecommendation: HomeRecommendation = {
    id: 'feedback',
    href: '/community',
    eyebrow: '운영자에게',
    title: 'Quantum에 의견 보내기',
    description: '불편했던 점이나 바라는 점을 웹 게시판에 남겨요.',
    action: '피드백 보내기',
};

export function buildHomeRecommendationWave(catalog: HomeEventCatalog | null): HomeRecommendationWave {
  const tonightEvent = catalog?.tonight.find(isActionableTonightEvent);
  if (tonightEvent) {
    return {
      primary: {
        id: 'tonight',
        href: '/match',
        eyebrow: '오늘 밤 추천',
        title: tonightEvent.title,
        description: `${tonightEvent.venue}에서 열리는 활동이에요.`,
        action: '약속 보러 가기',
      },
      secondary: [meetupRecommendation, fallbackRecommendation, feedbackRecommendation],
    };
  }

  return {
    primary: fallbackRecommendation,
    secondary: [tonightFallback, meetupRecommendation, feedbackRecommendation],
  };
}

function isActionableTonightEvent(event: TonightEvent): boolean {
  if (event.scheduleType !== 'tonight') return false;
  if (!event.operations) return event.remaining === null || event.remaining > 0;

  return event.operations.status === 'open'
    && event.remaining !== null
    && event.remaining > 0
    && Date.parse(event.operations.startsAt) > Date.parse(event.operations.serverTime);
}
import type { TonightEvent } from './events';
