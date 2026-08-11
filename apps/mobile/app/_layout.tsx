import { SplashScreen, Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../src/auth/context';
import { getQuantumApiClient } from '../src/api/quantum';
import { ParticipationProvider } from '../src/state/participation';
import { colors } from '../src/theme/tokens';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <ParticipationProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </ParticipationProvider>
      </SafeAreaProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const checkedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoading) void SplashScreen.hideAsync();
  }, [isLoading]);

  useEffect(() => {
    const userId = session?.user.id ?? null;
    if (!userId) {
      checkedUserId.current = null;
      return;
    }
    if (checkedUserId.current === userId) return;

    let active = true;
    void getQuantumApiClient().getProfileOnboarding().then((summary) => {
      if (!active) return;
      checkedUserId.current = userId;
      if (summary.isComplete) return;
      if (summary.nextStep === 'basic' && pathname !== '/profile/basic') {
        router.replace('/profile/basic');
      } else if (summary.nextStep === 'worldcup' && pathname !== '/profile/worldcup') {
        router.replace('/profile/worldcup');
      } else if (summary.nextStep === 'survey' && pathname !== '/profile/survey') {
        router.replace('/profile/survey');
      } else if (summary.nextStep === 'photos' && pathname !== '/profile/photos') {
        router.replace('/profile/photos');
      }
    }).catch(() => {
      if (active) checkedUserId.current = userId;
    });

    return () => { active = false; };
  }, [pathname, router, session?.user.id]);

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator color={colors.school} /></View>;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="meeting-guide" />
        <Stack.Screen name="deposit" />
        <Stack.Screen name="profile/basic" />
        <Stack.Screen name="profile/worldcup" />
        <Stack.Screen name="profile/photos" />
        <Stack.Screen name="profile/survey" />
        <Stack.Screen name="meetups/create" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="friends/[id]" />
        <Stack.Screen name="notifications" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
        {__DEV__ ? <Stack.Screen name="dev-my-preview" /> : null}
        {__DEV__ ? <Stack.Screen name="dev-deposit-preview" /> : null}
        {__DEV__ ? <Stack.Screen name="dev-worldcup-preview" /> : null}
        {__DEV__ ? <Stack.Screen name="dev-survey-preview" /> : null}
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
});
