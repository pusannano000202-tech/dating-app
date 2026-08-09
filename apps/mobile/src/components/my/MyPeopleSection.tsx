import { Bell, ChevronRight, UsersRound } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radii, spacing } from '../../theme/tokens';

export type MyPeopleSectionProps = {
  state: 'loading' | 'ready' | 'error';
  friends: Array<{ userId: string; displayName: string | null }>;
  receivedRequestCount: number | null;
  unreadNotificationCount: number | null;
  onFriends: () => void;
  onNotifications: () => void;
};

function initials(displayName: string | null) {
  const name = displayName?.trim();
  return name ? name.slice(0, 2).toUpperCase() : '?';
}

export function MyPeopleSection({
  state,
  friends,
  receivedRequestCount,
  unreadNotificationCount,
  onFriends,
  onNotifications,
}: MyPeopleSectionProps) {
  const visibleFriends = friends.slice(0, 3);

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>사람</Text>
      <View style={styles.card}>
        {state === 'loading' ? <Text style={styles.empty}>친구 정보를 불러오는 중</Text>
          : state === 'error' ? <Text accessibilityRole="alert" style={styles.empty}>친구 정보를 확인하지 못했어요</Text>
          : visibleFriends.length ? (
          <View accessibilityLabel="연결된 친구" style={styles.friendRow}>
            <View style={styles.initialsRow}>
              {visibleFriends.map((friend) => <View key={friend.userId} style={styles.initial}><Text style={styles.initialText}>{initials(friend.displayName)}</Text></View>)}
            </View>
            <Text numberOfLines={1} style={styles.friendSummary}>연결된 친구를 확인해요</Text>
          </View>
          ) : <Text style={styles.empty}>아직 연결된 친구가 없어요.</Text>}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onFriends} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <UsersRound color={colors.school} size={19} />
            <Text style={styles.actionText}>친구와 초대</Text>
            {receivedRequestCount === null ? <Text style={styles.unavailable}>확인 필요</Text> : receivedRequestCount > 0 ? <Text style={styles.badge}>{receivedRequestCount}</Text> : null}
            <ChevronRight color={colors.muted} size={17} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onNotifications} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <Bell color={colors.school} size={19} />
            <Text style={styles.actionText}>알림</Text>
            {unreadNotificationCount === null ? <Text style={styles.unavailable}>확인 필요</Text> : unreadNotificationCount > 0 ? <Text style={styles.badge}>{unreadNotificationCount}</Text> : null}
            <ChevronRight color={colors.muted} size={17} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  card: { overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface },
  friendRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  initialsRow: { flexDirection: 'row' },
  initial: { width: 32, height: 32, marginRight: -6, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface, borderRadius: radii.round, backgroundColor: colors.surfaceMuted },
  initialText: { color: colors.body, fontSize: 11, fontWeight: '800' },
  friendSummary: { flex: 1, minWidth: 0, color: colors.body, fontSize: 14, fontWeight: '600' },
  empty: { minHeight: 68, paddingHorizontal: spacing.md, paddingVertical: spacing.lg, color: colors.muted, fontSize: 14, fontWeight: '600', textAlignVertical: 'center' },
  actions: { borderTopWidth: 1, borderTopColor: colors.line },
  action: { minHeight: layout.minimumTouchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  actionText: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '700' },
  unavailable: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  badge: { minWidth: 20, paddingHorizontal: 6, color: colors.surface, fontSize: 12, lineHeight: 20, fontWeight: '800', textAlign: 'center', borderRadius: radii.round, backgroundColor: colors.ink },
  pressed: { backgroundColor: colors.surfaceMuted },
});
