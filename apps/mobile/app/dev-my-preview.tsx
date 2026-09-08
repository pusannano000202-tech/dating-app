import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MyFinanceSafetySection } from '../src/components/my/MyFinanceSafetySection';
import { MyPeopleSection } from '../src/components/my/MyPeopleSection';
import { MyProfileHeader } from '../src/components/my/MyProfileHeader';
import { MyProfileSection } from '../src/components/my/MyProfileSection';
import { Screen } from '../src/components/Screen';
import { buildMyProfileProgress, getMyPrimaryAction } from '../src/domain/my-hub';
import { spacing } from '../src/theme/tokens';

// These values are local visual-QA fixtures, never production account or payment state.
const previewProfile = {
  displayName: 'Dev Preview User',
  school: 'Pusan National University',
  progress: buildMyProfileProgress('photos'),
  actionLabel: getMyPrimaryAction('photos').label,
};

const previewFriends = [
  { userId: 'fixture-minji', displayName: 'Minji' },
  { userId: 'fixture-jisoo', displayName: 'Jisoo' },
];

function getPreviewState(value: string | string[] | undefined) {
  const state = Array.isArray(value) ? value[0] : value;
  return state === 'loading' || state === 'error' ? state : 'ready';
}

export default function DevMyPreview() {
  if (!__DEV__) return <Redirect href="/login" />;

  const { state } = useLocalSearchParams<{ state?: string | string[] }>();
  const [lastAction, setLastAction] = useState('None');
  const previewState = getPreviewState(state);
  const isReady = previewState === 'ready';

  return (
    <Screen contentStyle={styles.content}>
      <Text style={styles.notice}>DEV ONLY - local My fixture</Text>
      <View style={styles.sections}>
        <MyProfileHeader
          actionLabel={previewProfile.actionLabel}
          displayName={isReady ? previewProfile.displayName : null}
          onAction={() => setLastAction('Profile action')}
          primaryPhotoUrl={null}
          profileState={previewState}
          progress={isReady ? previewProfile.progress : null}
          school={isReady ? previewProfile.school : null}
        />
        <MyPeopleSection
          friends={isReady ? previewFriends : []}
          notificationsState={previewState}
          onFriends={() => setLastAction('Friends')}
          onNotifications={() => setLastAction('Notifications')}
          receivedRequestCount={isReady ? 1 : null}
          state={previewState}
          unreadNotificationCount={isReady ? 2 : null}
        />
        <MyProfileSection
          appearanceStatusLabel={isReady ? 'Preview status: not connected' : null}
          onBasic={() => setLastAction('Basic profile')}
          onPhotos={() => setLastAction('Profile photos')}
          onWorldcup={() => setLastAction('Worldcup')}
          photoCount={isReady ? 0 : null}
          photoState={previewState}
        />
        <MyFinanceSafetySection
          message={null}
          onDeposit={() => setLastAction('Deposit contract')}
          onSignOut={() => setLastAction('Sign out')}
          signingOut={false}
        />
        <Text accessibilityLiveRegion="polite" style={styles.actionStatus} testID="my-preview-last-action">Last preview action: {lastAction}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg },
  sections: { gap: spacing.xl, paddingHorizontal: spacing.lg },
  notice: { color: '#65716D', fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  actionStatus: { color: '#65716D', fontSize: 12, fontWeight: '700', letterSpacing: 0 },
});
