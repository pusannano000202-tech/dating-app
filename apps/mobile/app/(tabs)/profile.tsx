import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';

import { useAuth } from '../../src/auth/context';
import { type MobileProfileSummary } from '../../src/api/client';
import { getProfilePhotosApi, type ProfilePhotos } from '../../src/api/profile-photos';
import { getQuantumApiClient } from '../../src/api/quantum';
import { getSocialApiClient, type MobileFriendsSnapshot, type MobileNotification } from '../../src/api/social';
import { MyFinanceSafetySection } from '../../src/components/my/MyFinanceSafetySection';
import { MyPeopleSection } from '../../src/components/my/MyPeopleSection';
import { MyProfileHeader } from '../../src/components/my/MyProfileHeader';
import { MyProfileSection } from '../../src/components/my/MyProfileSection';
import { Screen } from '../../src/components/Screen';
import { buildMyProfileProgress, getAppearanceStatusLabel, getMyPrimaryAction, selectActiveFriends } from '../../src/domain/my-hub';
import { spacing } from '../../src/theme/tokens';

type RequestState<T> = {
  status: 'loading' | 'ready' | 'error';
  data: T | null;
};

function loadingState<T>(): RequestState<T> {
  return { status: 'loading', data: null };
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [profileState, setProfileState] = useState<RequestState<MobileProfileSummary>>(loadingState);
  const [photosState, setPhotosState] = useState<RequestState<ProfilePhotos>>(loadingState);
  const [friendsState, setFriendsState] = useState<RequestState<MobileFriendsSnapshot>>(loadingState);
  const [notificationsState, setNotificationsState] = useState<RequestState<MobileNotification[]>>(loadingState);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const focusedRef = useRef(false);

  const reload = useCallback((isRefresh = false) => {
    const requestId = ++requestIdRef.current;
    let remaining = 4;
    const canUpdate = () => focusedRef.current && requestId === requestIdRef.current;
    const finish = () => {
      remaining -= 1;
      if (remaining === 0 && canUpdate()) setRefreshing(false);
    };

    setProfileState(loadingState);
    setPhotosState(loadingState);
    setFriendsState(loadingState);
    setNotificationsState(loadingState);
    if (isRefresh) setRefreshing(true);

    void getQuantumApiClient().getProfileOnboarding().then((summary) => {
      if (canUpdate()) setProfileState({ status: 'ready', data: summary });
    }).catch(() => {
      if (canUpdate()) setProfileState({ status: 'error', data: null });
    }).finally(finish);

    void getProfilePhotosApi().listPhotos().then((photos) => {
      if (canUpdate()) setPhotosState({ status: 'ready', data: photos });
    }).catch(() => {
      if (canUpdate()) setPhotosState({ status: 'error', data: null });
    }).finally(finish);

    void getSocialApiClient().then((client) => client.listFriends()).then((friends) => {
      if (canUpdate()) setFriendsState({ status: 'ready', data: friends });
    }).catch(() => {
      if (canUpdate()) setFriendsState({ status: 'error', data: null });
    }).finally(finish);

    void getSocialApiClient().then((client) => client.listNotifications({ unreadOnly: true, limit: 200 })).then((notifications) => {
      if (canUpdate()) setNotificationsState({ status: 'ready', data: notifications });
    }).catch(() => {
      if (canUpdate()) setNotificationsState({ status: 'error', data: null });
    }).finally(finish);
  }, []);

  useFocusEffect(useCallback(() => {
    if (!session) return;
    focusedRef.current = true;
    reload();
    return () => {
      focusedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [reload, session]));

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setMessage(null);
    try {
      await signOut();
    } catch {
      setMessage('로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSigningOut(false);
    }
  }

  function confirmSignOut() {
    Alert.alert('로그아웃', '이 기기에서 Quantum 로그인을 종료할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => void handleSignOut() },
    ]);
  }

  if (!session) return null;

  const summary = profileState.status === 'ready' ? profileState.data : null;
  const nextStep = summary?.nextStep ?? 'basic';
  const primaryAction = getMyPrimaryAction(nextStep);
  const primaryPhotoUrl = photosState.status === 'ready' ? photosState.data?.items[0]?.signedUrl ?? null : null;
  const photoCount = photosState.status === 'ready' ? photosState.data?.items.length ?? null : null;
  const activeFriends = friendsState.status === 'ready'
    ? selectActiveFriends(friendsState.data?.friends ?? [])
    : [];
  const receivedRequestCount = friendsState.status === 'ready'
    ? friendsState.data?.received.filter((request) => request.status === 'pending').length ?? 0
    : null;
  const unreadNotificationCount = notificationsState.status === 'ready'
    ? notificationsState.data?.length ?? 0
    : null;

  return (
    <Screen
      contentStyle={styles.content}
      scrollProps={{
        refreshControl: <RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} />,
      }}
    >
      <MyProfileHeader
        actionLabel={primaryAction.label}
        displayName={summary?.profile?.displayName ?? 'Quantum 사용자'}
        error={profileState.status === 'error'}
        loading={profileState.status === 'loading'}
        onAction={() => profileState.status === 'error' ? reload(true) : router.push(primaryAction.route)}
        primaryPhotoUrl={primaryPhotoUrl}
        progress={buildMyProfileProgress(nextStep)}
        school={summary?.profile?.school ?? null}
      />
      <MyPeopleSection
        friends={activeFriends}
        onFriends={() => router.push('/friends')}
        onNotifications={() => router.push('/notifications')}
        receivedRequestCount={receivedRequestCount}
        state={friendsState.status}
        notificationsState={notificationsState.status}
        unreadNotificationCount={unreadNotificationCount}
      />
      <MyProfileSection
        appearanceStatusLabel={summary ? getAppearanceStatusLabel(summary.appearanceStatus) : null}
        onBasic={() => router.push('/profile/basic')}
        onPhotos={() => router.push('/profile/photos')}
        onWorldcup={() => router.push('/profile/worldcup')}
        photoCount={photoCount}
        photoState={photosState.status}
      />
      <MyFinanceSafetySection
        message={message}
        onDeposit={() => router.push('/deposit')}
        onSignOut={confirmSignOut}
        signingOut={signingOut}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
});
