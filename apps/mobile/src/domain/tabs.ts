export type PrimaryTab = {
  id: 'home' | 'match' | 'meetups' | 'community' | 'profile';
  label: string;
  href: '/' | '/match' | '/meetups' | '/community' | '/profile';
};

export const primaryTabs: readonly PrimaryTab[] = [
  { id: 'home', label: '홈', href: '/' },
  { id: 'match', label: '매칭', href: '/match' },
  { id: 'meetups', label: '모임', href: '/meetups' },
  { id: 'community', label: '커뮤니티', href: '/community' },
  { id: 'profile', label: '마이', href: '/profile' },
] as const;
