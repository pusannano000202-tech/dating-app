import { ArrowLeft, CalendarHeart, Check, Link2, RefreshCw, UserPlus, UserRound, UsersRound, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  getSocialApiClient,
  SocialApiError,
  type MobileDepartmentSuggestion,
  type MobileFriendRequest,
  type MobileFriendsSnapshot,
  type MobileGroupInvite,
} from '../src/api/social';
import { PageHeader } from '../src/components/PageHeader';
import { Screen } from '../src/components/Screen';
import { colors, radii, spacing } from '../src/theme/tokens';

const EMPTY: MobileFriendsSnapshot = { sent: [], received: [], friends: [], currentUserId: null };

export default function FriendsRoute() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [discoveryEnabled, setDiscoveryEnabled] = useState(false);
  const [suggestions, setSuggestions] = useState<MobileDepartmentSuggestion[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [invite, setInvite] = useState<MobileGroupInvite | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await (await getSocialApiClient()).listFriends());
    } catch (cause) {
      setError(toMessage(cause, '친구 정보를 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const received = useMemo(
    () => snapshot.received.filter((request) => request.status === 'pending'),
    [snapshot.received],
  );
  const sent = useMemo(
    () => snapshot.sent.filter((request) => request.status === 'pending'),
    [snapshot.sent],
  );

  async function decide(request: MobileFriendRequest, decision: 'accept' | 'decline') {
    if (workingId) return;
    setWorkingId(request.id);
    setError(null);
    try {
      await (await getSocialApiClient()).respondToFriendRequest(request.id, decision);
      setNotice(decision === 'accept' ? '친구가 되었어요.' : '요청을 거절했어요.');
      await refresh();
    } catch (cause) {
      setError(toMessage(cause, decision === 'accept' ? '요청을 수락하지 못했어요.' : '요청을 거절하지 못했어요.'));
    } finally {
      setWorkingId(null);
    }
  }

  async function toggleDepartmentDiscovery() {
    if (discoveryLoading) return;
    const next = !discoveryEnabled;
    setDiscoveryLoading(true);
    setError(null);
    try {
      const result = await (await getSocialApiClient()).setDepartmentDiscovery(next);
      setDiscoveryEnabled(result.discoveryEnabled);
      setSuggestions(result.suggestions);
      if (!next) setNotice('같은 학과 추천을 껐어요.');
    } catch (cause) {
      setError(toMessage(cause, '같은 학과 추천 설정을 바꾸지 못했어요.'));
    } finally {
      setDiscoveryLoading(false);
    }
  }

  async function requestSuggestion(suggestion: MobileDepartmentSuggestion) {
    if (workingId) return;
    setWorkingId(suggestion.userId);
    setError(null);
    try {
      await (await getSocialApiClient()).sendFriendRequest(suggestion.userId);
      setSuggestions((current) => current.filter((item) => item.userId !== suggestion.userId));
      setNotice(`${suggestion.displayName ?? '학과 친구'}님에게 요청을 보냈어요.`);
      await refresh();
    } catch (cause) {
      setError(toMessage(cause, '친구 요청을 보내지 못했어요.'));
    } finally {
      setWorkingId(null);
    }
  }

  async function inspectInvite() {
    if (!inviteToken.trim() || inviteLoading) return;
    setInviteLoading(true);
    setError(null);
    setInvite(null);
    try {
      setInvite(await (await getSocialApiClient()).getGroupInvite(inviteToken));
    } catch (cause) {
      setError(toMessage(cause, '유효한 초대를 찾지 못했어요.'));
    } finally {
      setInviteLoading(false);
    }
  }

  async function acceptInvite() {
    if (!invite || inviteLoading) return;
    setInviteLoading(true);
    setError(null);
    try {
      await (await getSocialApiClient()).acceptGroupInvite(inviteToken);
      setNotice('그룹 초대를 수락했어요.');
      setInvite(null);
      setInviteToken('');
    } catch (cause) {
      setError(toMessage(cause, '그룹 초대를 수락하지 못했어요.'));
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <Screen contentStyle={styles.content} scrollProps={{ keyboardShouldPersistTaps: 'handled' }}>
      <View style={styles.topBar}>
        <IconButton label="뒤로" onPress={() => router.back()}><ArrowLeft size={21} color={colors.ink} /></IconButton>
        <IconButton label="새로고침" onPress={() => void refresh()}><RefreshCw size={19} color={colors.school} /></IconButton>
      </View>
      <PageHeader eyebrow="QUANTUM FRIENDS" title="함께할 친구" description="요청을 확인하고, 같은 학과 친구나 받은 그룹 초대를 연결해요." />

      {error ? <StatusBox tone="error" message={error} actionLabel="다시 시도" onAction={() => void refresh()} /> : null}
      {notice ? <StatusBox tone="success" message={notice} /> : null}

      {loading ? (
        <View style={styles.state}><ActivityIndicator color={colors.school} /><Text style={styles.stateText}>친구 정보를 불러오는 중</Text></View>
      ) : (
        <View style={styles.sections}>
          {received.length > 0 ? <Section title="받은 요청" count={received.length}>
            {received.map((request) => (
              <View key={request.id} style={styles.personRow}>
                <Initial name={request.senderDisplayName} />
                <View style={styles.personCopy}><Text style={styles.personName}>{request.senderDisplayName ?? 'Quantum 사용자'}</Text><Text style={styles.personMeta}>친구 요청을 보냈어요</Text></View>
                <IconButton label="수락" onPress={() => void decide(request, 'accept')} disabled={Boolean(workingId)}><Check size={19} color={colors.safety} /></IconButton>
                <IconButton label="거절" onPress={() => void decide(request, 'decline')} disabled={Boolean(workingId)}><X size={19} color={colors.action} /></IconButton>
              </View>
            ))}
          </Section> : null}

          <Section title="내 친구" count={snapshot.friends.length}>
            {snapshot.friends.length === 0 ? <Empty icon={<UserRound size={22} color={colors.muted} />} text="아직 연결된 친구가 없어요." /> : snapshot.friends.map((friend) => (
              <Pressable
                key={friend.userId}
                accessibilityRole="button"
                accessibilityLabel={`${friend.displayName ?? 'Quantum 친구'}님에게 약속 제안`}
                onPress={() => router.push({ pathname: '/friends/[id]', params: { id: friend.userId, name: friend.displayName ?? '' } })}
                style={({ pressed }) => [styles.personRow, pressed && styles.pressed]}
              >
                <Initial name={friend.displayName} />
                <View style={styles.personCopy}><Text style={styles.personName}>{friend.displayName ?? 'Quantum 친구'}</Text><Text style={styles.personMeta}>약속을 제안하거나 받은 답을 확인해요</Text></View>
                <CalendarHeart size={20} color={colors.school} />
              </Pressable>
            ))}
          </Section>

          {sent.length > 0 ? <Section title="보낸 요청" count={sent.length}>
            {sent.map((request) => <View key={request.id} style={styles.personRow}><Initial name={request.receiverDisplayName} /><View style={styles.personCopy}><Text style={styles.personName}>{request.receiverDisplayName ?? 'Quantum 사용자'}</Text><Text style={styles.personMeta}>응답을 기다리고 있어요</Text></View></View>)}
          </Section> : null}

          <Section title="같은 학과 친구">
            <Text style={styles.sectionDescription}>직접 켜야 추천이 시작돼요. 끄면 추천 목록도 바로 숨겨져요.</Text>
            <Pressable disabled={discoveryLoading} onPress={() => void toggleDepartmentDiscovery()} style={[styles.wideButton, discoveryEnabled && styles.secondaryButton]}>
              {discoveryLoading ? <ActivityIndicator color={discoveryEnabled ? colors.school : colors.surface} /> : <UsersRound size={18} color={discoveryEnabled ? colors.school : colors.surface} />}
              <Text style={[styles.wideButtonText, discoveryEnabled && styles.secondaryButtonText]}>{discoveryEnabled ? '같은 학과 추천 끄기' : '같은 학과 추천 켜기'}</Text>
            </Pressable>
            {discoveryEnabled && suggestions.length === 0 ? <Empty icon={<UsersRound size={22} color={colors.muted} />} text="지금 추천할 학과 친구가 없어요." /> : null}
            {suggestions.map((suggestion) => (
              <View key={suggestion.userId} style={styles.personRow}>
                <Initial name={suggestion.displayName} />
                <View style={styles.personCopy}><Text style={styles.personName}>{suggestion.displayName ?? '같은 학과 사용자'}</Text><Text style={styles.personMeta}>학교·학과가 같아요</Text></View>
                <IconButton label="친구 요청" onPress={() => void requestSuggestion(suggestion)} disabled={Boolean(workingId)}><UserPlus size={19} color={colors.school} /></IconButton>
              </View>
            ))}
          </Section>

          <Section title="초대 코드로 참여">
            <Text style={styles.sectionDescription}>친구가 보낸 그룹 초대 링크의 코드를 입력해 확인해요.</Text>
            <View style={styles.inputRow}>
              <TextInput value={inviteToken} onChangeText={(value) => { setInviteToken(value); setInvite(null); }} placeholder="초대 코드" placeholderTextColor={colors.muted} autoCapitalize="none" style={styles.input} />
              <Pressable disabled={!inviteToken.trim() || inviteLoading} onPress={() => void inspectInvite()} style={styles.squareAction} accessibilityLabel="초대 확인"><Link2 size={19} color={colors.surface} /></Pressable>
            </View>
            {invite ? <Pressable disabled={inviteLoading} onPress={() => void acceptInvite()} style={styles.wideButton}><Check size={18} color={colors.surface} /><Text style={styles.wideButtonText}>이 그룹 초대 수락</Text></Pressable> : null}
            <Text style={styles.pendingText}>내 초대 목록과 모바일 초대 만들기는 준비 중이에요.</Text>
          </Section>
        </View>
      )}
    </Screen>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}</Text>{typeof count === 'number' ? <Text style={styles.count}>{count}</Text> : null}</View>{children}</View>;
}

function Initial({ name }: { name: string | null }) {
  return <View style={styles.initial}><Text style={styles.initialText}>{(name?.trim().charAt(0) || 'Q').toUpperCase()}</Text></View>;
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <View style={styles.empty}>{icon}<Text style={styles.emptyText}>{text}</Text></View>;
}

function IconButton({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <Pressable accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, disabled && styles.disabled]}>{children}</Pressable>;
}

function StatusBox({ tone, message, actionLabel, onAction }: { tone: 'error' | 'success'; message: string; actionLabel?: string; onAction?: () => void }) {
  return <View style={[styles.status, tone === 'error' ? styles.statusError : styles.statusSuccess]}><Text accessibilityRole={tone === 'error' ? 'alert' : undefined} style={styles.statusText}>{message}</Text>{actionLabel && onAction ? <Pressable onPress={onAction}><Text style={styles.statusAction}>{actionLabel}</Text></Pressable> : null}</View>;
}

function toMessage(cause: unknown, fallback: string) {
  if (!(cause instanceof SocialApiError)) return fallback;
  if (cause.code === 'auth_required' || cause.status === 401) return '로그인이 만료됐어요. 다시 로그인해 주세요.';
  if (cause.code === 'department_discovery_consent_required') return '같은 학과 추천을 먼저 켜 주세요.';
  if (cause.code === 'profile_department_required') return '프로필에 학과를 먼저 입력해 주세요.';
  if (cause.code === 'invite_not_found') return '만료됐거나 찾을 수 없는 초대예요.';
  return fallback;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  topBar: { minHeight: 48, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.4 },
  sections: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.xl },
  section: { gap: spacing.md },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  count: { minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: radii.round, textAlign: 'center', textAlignVertical: 'center', color: colors.school, backgroundColor: colors.surfaceMuted, fontSize: 12, fontWeight: '900' },
  sectionDescription: { color: colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  personRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  initial: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  initialText: { color: colors.school, fontSize: 16, fontWeight: '900' },
  personCopy: { flex: 1, minWidth: 0 },
  personName: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  personMeta: { marginTop: 3, color: colors.muted, fontSize: 12, fontWeight: '600' },
  empty: { minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface },
  emptyText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  state: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stateText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  wideButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.control, backgroundColor: colors.school },
  wideButtonText: { color: colors.surface, fontSize: 14, fontWeight: '900' },
  secondaryButton: { borderWidth: 1, borderColor: colors.school, backgroundColor: colors.surface },
  secondaryButtonText: { color: colors.school },
  inputRow: { flexDirection: 'row', gap: spacing.sm },
  input: { flex: 1, minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, paddingHorizontal: spacing.md, backgroundColor: colors.surface, color: colors.ink, fontSize: 14, fontWeight: '700' },
  squareAction: { width: 50, height: 50, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.school },
  pendingText: { color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  status: { marginHorizontal: spacing.lg, marginTop: spacing.lg, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: radii.control },
  statusError: { borderColor: '#F1B6B0', backgroundColor: '#FFF4F2' },
  statusSuccess: { borderColor: '#A7D7D1', backgroundColor: '#EFF9F7' },
  statusText: { flex: 1, color: colors.body, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  statusAction: { color: colors.school, fontSize: 12, fontWeight: '900' },
});
