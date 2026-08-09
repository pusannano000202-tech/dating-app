import { Redirect } from 'expo-router';
import { Alert, StyleSheet, Text } from 'react-native';

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

function showPreviewAction(label: string) {
  Alert.alert('Development preview', `${label} is a local preview action.`);
}

export default function DevMyPreview() {
  if (!__DEV__) return <Redirect href="/login" />;

  return (
    <Screen contentStyle={styles.content}>
      <Text style={styles.notice}>DEV ONLY - local My fixture</Text>
      <MyProfileHeader
        actionLabel={previewProfile.actionLabel}
        displayName={previewProfile.displayName}
        onAction={() => showPreviewAction('Profile action')}
        primaryPhotoUrl={null}
        profileState="ready"
        progress={previewProfile.progress}
        school={previewProfile.school}
      />
      <MyPeopleSection
        friends={previewFriends}
        notificationsState="ready"
        onFriends={() => showPreviewAction('Friends')}
        onNotifications={() => showPreviewAction('Notifications')}
        receivedRequestCount={1}
        state="ready"
        unreadNotificationCount={2}
      />
      <MyProfileSection
        appearanceStatusLabel="Preview status: not connected"
        onBasic={() => showPreviewAction('Basic profile')}
        onPhotos={() => showPreviewAction('Profile photos')}
        onWorldcup={() => showPreviewAction('Worldcup')}
        photoCount={0}
        photoState="ready"
      />
      <MyFinanceSafetySection
        message={null}
        onDeposit={() => showPreviewAction('Deposit contract')}
        onSignOut={() => showPreviewAction('Sign out')}
        signingOut={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  notice: { color: '#65716D', fontSize: 12, fontWeight: '800', letterSpacing: 0 },
});
