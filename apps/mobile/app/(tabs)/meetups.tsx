import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  CalendarDays,
  MapPin,
  Plus,
  RefreshCw,
  UsersRound,
} from 'lucide-react-native';

import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import {
  getMeetupsApiClient,
  MeetupApiError,
  type MeetupCategory,
  type MobileMeetup,
} from '../../src/api/meetups';
import { colors, layout, radii, spacing } from '../../src/theme/tokens';

type LoadState = 'loading' | 'ready' | 'auth_required' | 'unavailable' | 'error';

const categoryOptions: Array<{ id: MeetupCategory | 'all'; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'running', label: '러닝' },
  { id: 'basketball', label: '농구' },
  { id: 'badminton', label: '배드민턴' },
  { id: 'tennis', label: '테니스' },
  { id: 'soccer', label: '축구' },
  { id: 'baseball', label: '야구' },
  { id: 'board_game', label: '보드게임' },
  { id: 'gaming', label: '게임' },
  { id: 'hiking', label: '등산' },
  { id: 'walking', label: '산책' },
  { id: 'dining', label: '맛집' },
  { id: 'study', label: '스터디' },
  { id: 'other', label: '기타' },
];

const categoryLabel = new Map(categoryOptions.map((item) => [item.id, item.label]));

export default function MeetupsScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<MeetupCategory | 'all'>('all');
  const [meetups, setMeetups] = useState<MobileMeetup[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoadState('loading');
    setNotice('');
    try {
      const result = await getMeetupsApiClient().list(category === 'all' ? undefined : category);
      setMeetups(result.meetups);
      setLoadState(result.availability === 'ready'
        ? 'ready'
        : result.availability === 'auth_required'
          ? 'auth_required'
          : 'unavailable');
    } catch (error) {
      setMeetups([]);
      setLoadState(error instanceof MeetupApiError && error.code === 'auth_required' ? 'auth_required' : 'error');
    } finally {
      setRefreshing(false);
    }
  }, [category]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  async function toggleMembership(meetup: MobileMeetup) {
    if (meetup.is_host || busyId) return;
    setBusyId(meetup.id);
    setNotice('');
    try {
      const membership = meetup.joined
        ? await getMeetupsApiClient().leave(meetup.id)
        : await getMeetupsApiClient().join(meetup.id);
      await load(true);
      setNotice(membership.joined ? '모임에 참여했어요.' : '모임 참여를 취소했어요.');
    } catch (error) {
      setNotice(getMeetupErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen
      contentStyle={styles.content}
      scrollProps={{
        refreshControl: <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />,
      }}
    >
      <PageHeader
        eyebrow="QUANTUM 모임"
        title="같이 할 일을 먼저 골라요"
        description="연애 매칭과 별개로, 성별에 관계없이 취미와 친구 모임을 열고 참여해요."
        action={(
          <Pressable
            accessibilityLabel="모임 만들기"
            onPress={() => router.push('/meetups/create')}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Plus size={22} color={colors.surface} />
          </Pressable>
        )}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={styles.filterScroll}
      >
        {categoryOptions.map((option) => {
          const selected = category === option.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option.id}
              onPress={() => setCategory(option.id)}
              style={[styles.filter, selected && styles.filterSelected]}
            >
              <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionTitle}>지금 모집 중</Text>
          <Text style={styles.sectionDescription}>내 학교에서 실제로 열린 방만 보여요.</Text>
        </View>
        <Pressable accessibilityLabel="모임 목록 새로고침" onPress={() => void load(true)} style={styles.refreshButton}>
          <RefreshCw size={18} color={colors.school} />
        </Pressable>
      </View>

      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
      <MeetupListState state={loadState} onRetry={() => void load()} />

      {loadState === 'ready' && meetups.length === 0 ? (
        <View style={styles.emptyState}>
          <UsersRound size={28} color={colors.school} />
          <Text style={styles.emptyTitle}>아직 열린 모임이 없어요</Text>
          <Text style={styles.emptyDescription}>첫 번째 방을 만들어 같은 학교 친구를 불러봐요.</Text>
          <Pressable onPress={() => router.push('/meetups/create')} style={styles.primaryButton}>
            <Plus size={18} color={colors.surface} />
            <Text style={styles.primaryButtonText}>모임 만들기</Text>
          </Pressable>
        </View>
      ) : null}

      {loadState === 'ready' && meetups.length > 0 ? (
        <View style={styles.list}>
          {meetups.map((meetup) => {
            const full = meetup.status === 'full';
            const disabled = meetup.is_host || (!meetup.joined && full) || busyId !== null;
            return (
              <View key={meetup.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardCopy}>
                    <Text style={styles.category}>{categoryLabel.get(meetup.category) ?? '기타'}</Text>
                    <Text style={styles.cardTitle}>{meetup.title}</Text>
                  </View>
                  <Text style={[styles.status, full && styles.statusFull]}>{full ? '마감' : '모집 중'}</Text>
                </View>
                {meetup.description ? <Text style={styles.cardDescription}>{meetup.description}</Text> : null}
                <View style={styles.metaList}>
                  <Meta icon={<CalendarDays size={16} color={colors.muted} />} text={formatDate(meetup.scheduled_at)} />
                  <Meta icon={<MapPin size={16} color={colors.muted} />} text={meetup.place_name} />
                  <Meta icon={<UsersRound size={16} color={colors.muted} />} text={`${meetup.member_count}/${meetup.capacity}명`} />
                </View>
                <Pressable
                  disabled={disabled}
                  onPress={() => void toggleMembership(meetup)}
                  style={({ pressed }) => [
                    styles.membershipButton,
                    meetup.joined && styles.leaveButton,
                    disabled && styles.disabledButton,
                    pressed && !disabled && styles.pressed,
                  ]}
                >
                  {busyId === meetup.id ? <ActivityIndicator color={meetup.joined ? colors.school : colors.surface} /> : (
                    <Text style={[styles.membershipText, meetup.joined && styles.leaveText, disabled && styles.disabledText]}>
                      {meetup.is_host ? '내가 만든 모임' : meetup.joined ? '참여 취소' : full ? '모집 마감' : '참여하기'}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}

function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <View style={styles.metaRow}>{icon}<Text style={styles.metaText}>{text}</Text></View>;
}

function MeetupListState({ state, onRetry }: { state: LoadState; onRetry: () => void }) {
  if (state === 'loading') {
    return <View style={styles.state}><ActivityIndicator color={colors.school} /><Text style={styles.stateText}>모임을 불러오는 중이에요.</Text></View>;
  }
  if (state === 'ready') return null;

  const title = state === 'auth_required'
    ? '모바일 로그인 연결을 확인해야 해요'
    : state === 'unavailable'
      ? '모임 저장소가 아직 준비되지 않았어요'
      : '모임을 불러오지 못했어요';
  const description = state === 'auth_required'
    ? '모바일 토큰을 모임 API가 인식하도록 서버 연결이 필요해요.'
    : state === 'unavailable'
      ? '준비가 완료될 때까지 가짜 방은 보여주지 않아요.'
      : '네트워크를 확인한 뒤 다시 시도해 주세요.';
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{description}</Text>
      <Pressable onPress={onRetry} style={styles.retryButton}>
        <RefreshCw size={17} color={colors.school} />
        <Text style={styles.retryText}>다시 불러오기</Text>
      </Pressable>
    </View>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getMeetupErrorMessage(error: unknown) {
  if (!(error instanceof MeetupApiError)) return '잠시 후 다시 시도해 주세요.';
  if (error.code === 'meetup_full') return '방금 모집이 마감됐어요.';
  if (error.code === 'meetup_closed') return '이미 종료된 모임이에요.';
  if (error.code === 'host_cannot_leave') return '방장은 모임에서 나갈 수 없어요.';
  if (error.code === 'auth_required' || error.status === 401) return '모바일 로그인 연결을 다시 확인해 주세요.';
  return '네트워크를 확인한 뒤 다시 시도해 주세요.';
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg },
  addButton: {
    width: layout.minimumTouchTarget,
    height: layout.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.round,
    backgroundColor: colors.school,
  },
  filterScroll: { marginTop: spacing.xl, flexGrow: 0 },
  filters: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  filter: {
    minHeight: layout.minimumTouchTarget,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  filterSelected: { borderColor: colors.school, backgroundColor: colors.school },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  filterTextSelected: { color: colors.surface },
  sectionHeading: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '900' },
  sectionDescription: { marginTop: 4, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  refreshButton: {
    width: layout.minimumTouchTarget,
    height: layout.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    color: colors.school,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
  },
  state: { marginTop: spacing.xl, paddingHorizontal: spacing.lg, alignItems: 'center' },
  stateTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '900', textAlign: 'center' },
  stateText: { marginTop: spacing.sm, color: colors.muted, fontSize: 13, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  retryButton: {
    minHeight: layout.minimumTouchTarget,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  retryText: { color: colors.school, fontSize: 14, fontWeight: '900' },
  emptyState: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  emptyTitle: { marginTop: spacing.md, color: colors.ink, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  emptyDescription: { marginTop: spacing.sm, color: colors.muted, fontSize: 13, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  primaryButton: {
    minHeight: layout.minimumTouchTarget,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.control,
    backgroundColor: colors.school,
    paddingHorizontal: spacing.xl,
  },
  primaryButtonText: { color: colors.surface, fontSize: 14, fontWeight: '900' },
  list: { marginTop: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.md },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface, padding: spacing.lg },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  cardCopy: { flex: 1, minWidth: 0 },
  category: { color: colors.school, fontSize: 11, fontWeight: '900' },
  cardTitle: { marginTop: 4, color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '900' },
  status: { color: colors.safety, fontSize: 11, fontWeight: '900' },
  statusFull: { color: colors.muted },
  cardDescription: { marginTop: spacing.sm, color: colors.body, fontSize: 13, lineHeight: 20, fontWeight: '600' },
  metaList: { marginTop: spacing.md, gap: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  membershipButton: {
    minHeight: layout.minimumTouchTarget,
    marginTop: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.control,
    backgroundColor: colors.school,
    paddingHorizontal: spacing.lg,
  },
  leaveButton: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  disabledButton: { backgroundColor: colors.surfaceMuted, borderWidth: 0 },
  membershipText: { color: colors.surface, fontSize: 14, fontWeight: '900' },
  leaveText: { color: colors.school },
  disabledText: { color: colors.muted },
  pressed: { opacity: 0.78 },
});
