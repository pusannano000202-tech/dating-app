import { Tabs } from 'expo-router';
import { House, MessageCircle, Sparkles, UserRound, UsersRound } from 'lucide-react-native';

import { colors, layout } from '../../src/theme/tokens';

const iconByRoute = {
  index: House,
  match: Sparkles,
  meetups: UsersRound,
  community: MessageCircle,
  profile: UserRound,
} as const;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => {
        const Icon = iconByRoute[route.name as keyof typeof iconByRoute] ?? House;
        return {
          headerShown: false,
          tabBarActiveTintColor: colors.action,
          tabBarInactiveTintColor: colors.muted,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            minHeight: layout.tabBarHeight,
            height: layout.tabBarHeight,
            paddingTop: 7,
            paddingBottom: 7,
            borderTopWidth: 1,
            borderTopColor: colors.line,
            backgroundColor: colors.surface,
            elevation: 0,
          },
          tabBarItemStyle: { minHeight: layout.minimumTouchTarget },
          tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '800' },
          tabBarIcon: ({ color, size }) => <Icon size={Math.min(size, 22)} color={color} strokeWidth={2.2} />,
        };
      }}
    >
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="match" options={{ title: '매칭' }} />
      <Tabs.Screen name="meetups" options={{ title: '모임' }} />
      <Tabs.Screen name="community" options={{ title: '커뮤니티' }} />
      <Tabs.Screen name="profile" options={{ title: '마이' }} />
    </Tabs>
  );
}
