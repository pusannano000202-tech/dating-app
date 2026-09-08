import { ArrowLeft, Bell, BellRing, CheckCheck, RefreshCw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { getSocialApiClient, SocialApiError, type MobileNotification } from '../src/api/social';
import { PageHeader } from '../src/components/PageHeader';
import { Screen } from '../src/components/Screen';
import { colors, radii, spacing } from '../src/theme/tokens';

export default function NotificationsRoute() {
  const router = useRouter();
  const [items, setItems] = useState<MobileNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await (await getSocialApiClient()).listNotifications());
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const unreadCount = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  async function markOne(item: MobileNotification) {
    if (item.readAt || working) return;
    setWorking(true);
    setError(null);
    try {
      await (await getSocialApiClient()).markNotificationRead(item.id);
      const now = new Date().toISOString();
      setItems((current) => current.map((notice) => notice.id === item.id ? { ...notice, readAt: now } : notice));
    } catch (cause) {
      setError(toMessage(cause, '알림을 읽음 처리하지 못했어요.'));
    } finally {
      setWorking(false);
    }
  }

  async function markAll() {
    if (unreadCount === 0 || working) return;
    setWorking(true);
    setError(null);
    try {
      await (await getSocialApiClient()).markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((current) => current.map((notice) => ({ ...notice, readAt: notice.readAt ?? now })));
    } catch (cause) {
      setError(toMessage(cause, '알림을 모두 읽음 처리하지 못했어요.'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton label="뒤로" onPress={() => router.back()}><ArrowLeft size={21} color={colors.ink} /></IconButton>
        <IconButton label="새로고침" onPress={() => void refresh()}><RefreshCw size={19} color={colors.school} /></IconButton>
      </View>
      <PageHeader eyebrow="QUANTUM NOTICE" title="알림" description="친구 요청과 매칭 진행 소식을 놓치지 않게 모아 보여줘요." action={unreadCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount}</Text></View> : undefined} />

      {error ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Pressable onPress={() => void refresh()}><Text style={styles.retry}>다시 시도</Text></Pressable></View> : null}

      <View style={styles.toolbar}>
        <Text style={styles.toolbarText}>{unreadCount > 0 ? `읽지 않은 알림 ${unreadCount}개` : '새 알림을 모두 확인했어요'}</Text>
        <Pressable accessibilityRole="button" disabled={unreadCount === 0 || working} onPress={() => void markAll()} style={styles.markAll}>
          <CheckCheck size={17} color={unreadCount === 0 ? colors.muted : colors.school} />
          <Text style={[styles.markAllText, unreadCount === 0 && styles.mutedText]}>모두 읽음</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.state}><ActivityIndicator color={colors.school} /><Text style={styles.stateText}>알림을 불러오는 중</Text></View>
      ) : items.length === 0 ? (
        <View style={styles.state}><Bell size={25} color={colors.muted} /><Text style={styles.stateTitle}>아직 받은 알림이 없어요.</Text><Text style={styles.stateText}>친구 요청이나 매칭 소식이 오면 여기에 보여요.</Text></View>
      ) : (
        <View style={styles.list}>{items.map((item) => <NotificationRow key={item.id} item={item} disabled={working} onPress={() => void markOne(item)} />)}</View>
      )}
    </Screen>
  );
}

function NotificationRow({ item, disabled, onPress }: { item: MobileNotification; disabled: boolean; onPress: () => void }) {
  const unread = !item.readAt;
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.pressed]}>
      <View style={[styles.icon, unread && styles.iconUnread]}>{unread ? <BellRing size={20} color={colors.school} /> : <Bell size={20} color={colors.muted} />}</View>
      <View style={styles.copy}>
        <View style={styles.titleRow}><Text numberOfLines={2} style={styles.title}>{notificationTitle(item)}</Text>{unread ? <View style={styles.dot} /> : null}</View>
        <Text numberOfLines={3} style={styles.summary}>{notificationSummary(item)}</Text>
        <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

function notificationTitle(item: MobileNotification) {
  if (typeof item.payload.title === 'string') return item.payload.title;
  switch (item.kind) {
    case 'friend_request_received': return '새 친구 요청이 왔어요';
    case 'match_created': return '새 매칭이 도착했어요';
    case 'match_confirmed': return '매칭이 확정됐어요';
    case 'meeting_reminder': return '오늘 만남을 확인해 주세요';
    case 'daily_card_available': return '오늘의 카드가 열렸어요';
    case 'review_request': return '만남 후기를 남겨주세요';
    default: return 'Quantum 알림';
  }
}

function notificationSummary(item: MobileNotification) {
  if (typeof item.payload.body === 'string') return item.payload.body;
  switch (item.kind) {
    case 'friend_request_received': return '친구 화면에서 요청을 확인하고 수락하거나 거절할 수 있어요.';
    case 'match_created': return '매칭 화면에서 다음 행동을 확인해 주세요.';
    case 'match_confirmed': return '약속 시간과 준비 사항을 확인해 주세요.';
    case 'meeting_reminder': return '시간과 장소를 한 번 더 확인해 주세요.';
    case 'daily_card_available': return '정해진 시간 안에 카드를 확인할 수 있어요.';
    default: return '새 소식이 도착했어요.';
  }
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>{children}</Pressable>;
}

function toMessage(cause: unknown, fallback = '알림을 불러오지 못했어요.') {
  if (cause instanceof SocialApiError && (cause.code === 'auth_required' || cause.status === 401)) return '로그인이 만료됐어요. 다시 로그인해 주세요.';
  return fallback;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  topBar: { minHeight: 48, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
  badge: { minWidth: 32, height: 32, paddingHorizontal: 9, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.action },
  badgeText: { color: colors.surface, fontSize: 12, fontWeight: '900' },
  toolbar: { marginTop: spacing.xl, paddingHorizontal: spacing.lg, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  toolbarText: { flex: 1, color: colors.muted, fontSize: 12, fontWeight: '700' },
  markAll: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  markAllText: { color: colors.school, fontSize: 12, fontWeight: '900' },
  mutedText: { color: colors.muted },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  row: { minHeight: 104, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface },
  rowUnread: { borderColor: '#AEC9DD', backgroundColor: '#F7FBFD' },
  icon: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  iconUnread: { backgroundColor: colors.surfaceMuted },
  copy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '900' },
  dot: { width: 7, height: 7, borderRadius: radii.round, backgroundColor: colors.action },
  summary: { marginTop: 5, color: colors.body, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  time: { marginTop: spacing.sm, color: colors.muted, fontSize: 10, fontWeight: '700' },
  state: { minHeight: 260, marginHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface },
  stateTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  stateText: { maxWidth: 260, color: colors.muted, textAlign: 'center', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  error: { marginHorizontal: spacing.lg, marginTop: spacing.lg, minHeight: 50, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderWidth: 1, borderColor: '#F1B6B0', borderRadius: radii.control, backgroundColor: '#FFF4F2' },
  errorText: { flex: 1, color: colors.body, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  retry: { color: colors.school, fontSize: 12, fontWeight: '900' },
});
