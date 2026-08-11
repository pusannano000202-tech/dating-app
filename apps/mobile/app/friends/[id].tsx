import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CalendarHeart, Check, Coffee, Footprints, RefreshCw, Send, Utensils, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  getSocialApiClient,
  SocialApiError,
  type MobileFriendDateProposal,
  type MobileFriendDateProposalKind,
} from '../../src/api/social';
import { Screen } from '../../src/components/Screen';
import { colors, radii, spacing } from '../../src/theme/tokens';

const QUICK_PROPOSALS: Array<{
  kind: MobileFriendDateProposalKind;
  label: string;
  message: string;
  icon: typeof Utensils;
}> = [
  { kind: 'meal', label: '밥', message: '밥 먹을래요?', icon: Utensils },
  { kind: 'cafe', label: '카페', message: '카페 갈래요?', icon: Coffee },
  { kind: 'walk', label: '산책', message: '산책할래요?', icon: Footprints },
];

const PREVIEW_CURRENT_USER_ID = '00000000-0000-4000-8000-000000000001';
const PREVIEW_FRIEND_USER_ID = '00000000-0000-4000-8000-000000000002';
const PREVIEW_PROPOSALS: MobileFriendDateProposal[] = [
  {
    id: '00000000-0000-4000-8000-000000000003',
    proposerUserId: PREVIEW_FRIEND_USER_ID,
    recipientUserId: PREVIEW_CURRENT_USER_ID,
    otherUserId: PREVIEW_FRIEND_USER_ID,
    otherDisplayName: '민지',
    kind: 'cafe',
    message: '수업 끝나고 카페 갈래요?',
    status: 'pending',
    respondedAt: null,
    createdAt: '2026-08-09T12:00:00.000Z',
  },
];

export default function FriendDateRoute() {
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[] }>();
  const friendUserId = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  const routeName = Array.isArray(params.name) ? params.name[0] : params.name;
  return <FriendDateScreen friendUserId={friendUserId} routeName={routeName} />;
}

export function FriendDateScreen({
  friendUserId,
  routeName,
  preview = false,
}: {
  friendUserId: string;
  routeName?: string;
  preview?: boolean;
}) {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(preview ? PREVIEW_CURRENT_USER_ID : null);
  const [proposals, setProposals] = useState<MobileFriendDateProposal[]>(preview ? PREVIEW_PROPOSALS : []);
  const [kind, setKind] = useState<MobileFriendDateProposalKind>('meal');
  const [message, setMessage] = useState('밥 먹을래요?');
  const [loading, setLoading] = useState(!preview);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (preview) {
      setLoading(false);
      return;
    }
    if (!friendUserId) {
      setError('친구 정보를 확인할 수 없어요.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const client = await getSocialApiClient();
      const [nextProposals, friends] = await Promise.all([
        client.listFriendDateProposals(friendUserId),
        client.listFriends(),
      ]);
      if (!friends.friends.some((friend) => friend.userId === friendUserId)) {
        throw new SocialApiError('active_friendship_required', 403);
      }
      setCurrentUserId(friends.currentUserId);
      setProposals(nextProposals.slice().reverse());
    } catch (cause) {
      setError(toMessage(cause, '약속 대화를 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, [friendUserId, preview]);

  useEffect(() => { void refresh(); }, [refresh]);

  const friendName = useMemo(
    () => routeName?.trim() || proposals[0]?.otherDisplayName || 'Quantum 친구',
    [proposals, routeName],
  );

  function chooseQuickProposal(selected: typeof QUICK_PROPOSALS[number]) {
    setKind(selected.kind);
    setMessage(selected.message);
    setNotice(null);
  }

  async function sendProposal() {
    if (sending || !friendUserId || !message.trim()) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      if (preview) {
        setProposals((current) => [...current, {
          id: `preview-${current.length + 1}`,
          proposerUserId: PREVIEW_CURRENT_USER_ID,
          recipientUserId: PREVIEW_FRIEND_USER_ID,
          otherUserId: PREVIEW_FRIEND_USER_ID,
          otherDisplayName: friendName,
          kind,
          message: message.trim(),
          status: 'pending',
          respondedAt: null,
          createdAt: new Date().toISOString(),
        }]);
        setNotice('개발 미리보기에서 제안 카드를 확인했어요. 실제 전송은 하지 않았어요.');
        return;
      }
      await (await getSocialApiClient()).createFriendDateProposal(friendUserId, kind, message);
      setNotice(`${friendName}님에게 약속을 제안했어요.`);
      await refresh();
    } catch (cause) {
      setError(toMessage(cause, '약속 제안을 보내지 못했어요.'));
    } finally {
      setSending(false);
    }
  }

  async function respond(proposalId: string, accept: boolean) {
    if (workingId) return;
    setWorkingId(proposalId);
    setError(null);
    setNotice(null);
    try {
      if (preview) {
        setProposals((current) => current.map((proposal) => proposal.id === proposalId
          ? { ...proposal, status: accept ? 'accepted' : 'declined', respondedAt: new Date().toISOString() }
          : proposal));
        setNotice(accept ? '수락한 뒤 시간과 장소를 정하는 흐름이에요.' : '상대에게 정중한 거절 상태가 표시돼요.');
        return;
      }
      await (await getSocialApiClient()).respondToFriendDateProposal(proposalId, accept);
      setNotice(accept ? '좋아요. 이제 둘이 시간과 장소를 정하면 돼요.' : '이번 제안은 정중하게 거절했어요.');
      await refresh();
    } catch (cause) {
      setError(toMessage(cause, '제안에 답하지 못했어요.'));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <Screen contentStyle={styles.content} scrollProps={{ keyboardShouldPersistTaps: 'handled' }}>
      <View style={styles.topBar}>
        <IconButton label="친구 목록으로" onPress={() => router.back()}><ArrowLeft size={21} color={colors.ink} /></IconButton>
        <View style={styles.titleWrap}>
          <Text numberOfLines={1} style={styles.title}>{friendName}</Text>
          <Text style={styles.subtitle}>1:1 약속</Text>
        </View>
        <IconButton label="새로고침" onPress={() => void refresh()}><RefreshCw size={19} color={colors.school} /></IconButton>
      </View>

      <View style={styles.safetyNote}>
        <CalendarHeart size={18} color={colors.safety} />
        <Text style={styles.safetyText}>친구에게만 보이는 제안이에요. 상대가 수락하기 전에는 약속이 확정되지 않아요.</Text>
      </View>

      {preview ? <Status message="개발 전용 화면이에요. 버튼은 실제 친구에게 전송되지 않아요." tone="success" /> : null}

      {error ? <Status message={error} tone="error" /> : null}
      {notice ? <Status message={notice} tone="success" /> : null}

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.school} /><Text style={styles.loadingText}>약속 대화를 불러오는 중</Text></View>
      ) : (
        <View style={styles.thread}>
          {proposals.length === 0 ? (
            <View style={styles.empty}>
              <CalendarHeart size={25} color={colors.school} />
              <Text style={styles.emptyTitle}>아직 주고받은 약속이 없어요</Text>
              <Text style={styles.emptyBody}>부담 없는 한 문장으로 먼저 물어보세요.</Text>
            </View>
          ) : proposals.map((proposal) => {
            const mine = proposal.proposerUserId === currentUserId;
            const canRespond = !mine && proposal.recipientUserId === currentUserId && proposal.status === 'pending';
            return (
              <View key={proposal.id} style={[styles.proposalBubble, mine ? styles.proposalMine : styles.proposalTheirs]}>
                <Text style={[styles.proposalKind, mine && styles.proposalTextMine]}>{kindLabel(proposal.kind)}</Text>
                <Text style={[styles.proposalMessage, mine && styles.proposalTextMine]}>{proposal.message ?? defaultMessage(proposal.kind)}</Text>
                <Text style={[styles.proposalStatus, mine && styles.proposalStatusMine]}>{statusLabel(proposal.status)}</Text>
                {canRespond ? (
                  <View style={styles.responseRow}>
                    <Pressable disabled={Boolean(workingId)} onPress={() => void respond(proposal.id, false)} style={styles.declineButton}>
                      <X size={17} color={colors.action} /><Text style={styles.declineText}>거절</Text>
                    </Pressable>
                    <Pressable disabled={Boolean(workingId)} onPress={() => void respond(proposal.id, true)} style={styles.acceptButton}>
                      <Check size={17} color={colors.surface} /><Text style={styles.acceptText}>수락</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.composer}>
        <Text style={styles.composerTitle}>어떤 약속을 제안할까요?</Text>
        <View style={styles.quickRow}>
          {QUICK_PROPOSALS.map((proposal) => {
            const Icon = proposal.icon;
            const selected = kind === proposal.kind;
            return (
              <Pressable key={proposal.kind} onPress={() => chooseQuickProposal(proposal)} style={[styles.quickChoice, selected && styles.quickChoiceOn]}>
                <Icon size={17} color={selected ? colors.school : colors.muted} />
                <Text style={[styles.quickText, selected && styles.quickTextOn]}>{proposal.label}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => { setKind('custom'); setMessage(''); }} style={[styles.quickChoice, kind === 'custom' && styles.quickChoiceOn]}>
            <Text style={[styles.quickText, kind === 'custom' && styles.quickTextOn]}>직접</Text>
          </Pressable>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            value={message}
            onChangeText={(value) => { setMessage(value); if (!QUICK_PROPOSALS.some((proposal) => proposal.message === value)) setKind('custom'); }}
            placeholder="가볍게 약속을 제안해보세요"
            placeholderTextColor={colors.muted}
            maxLength={300}
            multiline
            style={styles.input}
          />
          <Pressable accessibilityLabel="약속 제안 보내기" disabled={sending || !message.trim()} onPress={() => void sendProposal()} style={[styles.sendButton, (!message.trim() || sending) && styles.disabled]}>
            {sending ? <ActivityIndicator color={colors.surface} /> : <Send size={19} color={colors.surface} />}
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

function kindLabel(kind: MobileFriendDateProposalKind) {
  if (kind === 'meal') return '같이 밥'
  if (kind === 'cafe') return '같이 카페'
  if (kind === 'walk') return '같이 산책'
  return '직접 제안'
}

function defaultMessage(kind: MobileFriendDateProposalKind) {
  return QUICK_PROPOSALS.find((proposal) => proposal.kind === kind)?.message ?? '같이 시간 보낼래요?';
}

function statusLabel(status: MobileFriendDateProposal['status']) {
  if (status === 'accepted') return '수락한 약속'
  if (status === 'declined') return '거절한 제안'
  if (status === 'cancelled') return '취소한 제안'
  return '답변 기다리는 중'
}

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>{children}</Pressable>;
}

function Status({ message, tone }: { message: string; tone: 'error' | 'success' }) {
  return <View style={[styles.status, tone === 'error' ? styles.statusError : styles.statusSuccess]}><Text accessibilityRole={tone === 'error' ? 'alert' : undefined} style={styles.statusText}>{message}</Text></View>;
}

function toMessage(cause: unknown, fallback: string) {
  if (!(cause instanceof SocialApiError)) return fallback;
  if (cause.code === 'auth_required' || cause.status === 401) return '로그인이 만료됐어요. 다시 로그인해주세요.';
  if (cause.code === 'active_friendship_required' || cause.status === 403) return '현재 연결된 친구에게만 약속을 제안할 수 있어요.';
  if (cause.code === 'proposal_already_pending' || cause.status === 409) return '이미 답변을 기다리는 제안이 있어요.';
  return fallback;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  topBar: { minHeight: 56, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, minWidth: 0, alignItems: 'center' },
  title: { maxWidth: '100%', color: colors.ink, fontSize: 16, fontWeight: '900' },
  subtitle: { marginTop: 2, color: colors.muted, fontSize: 11, fontWeight: '700' },
  safetyNote: { marginHorizontal: spacing.lg, marginTop: spacing.sm, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: '#A7D7D1', borderRadius: radii.card, backgroundColor: '#EFF9F7' },
  safetyText: { flex: 1, minWidth: 0, color: colors.body, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  status: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderWidth: 1, borderRadius: radii.control },
  statusError: { borderColor: '#F1B6B0', backgroundColor: '#FFF4F2' },
  statusSuccess: { borderColor: '#A7D7D1', backgroundColor: '#EFF9F7' },
  statusText: { color: colors.body, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  loading: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  thread: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xl, gap: spacing.md },
  empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: spacing.md, color: colors.ink, fontSize: 16, fontWeight: '900' },
  emptyBody: { marginTop: spacing.xs, color: colors.muted, fontSize: 12, fontWeight: '600' },
  proposalBubble: { maxWidth: '86%', padding: spacing.md, borderRadius: radii.card, borderWidth: 1 },
  proposalMine: { alignSelf: 'flex-end', borderColor: colors.school, borderTopRightRadius: 2, backgroundColor: colors.school },
  proposalTheirs: { alignSelf: 'flex-start', borderColor: colors.line, borderTopLeftRadius: 2, backgroundColor: colors.surface },
  proposalKind: { color: colors.school, fontSize: 11, fontWeight: '900' },
  proposalMessage: { marginTop: spacing.xs, color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  proposalTextMine: { color: colors.surface },
  proposalStatus: { marginTop: spacing.sm, color: colors.muted, fontSize: 11, fontWeight: '700' },
  proposalStatusMine: { color: '#D9E8F2' },
  responseRow: { marginTop: spacing.md, flexDirection: 'row', gap: spacing.sm },
  declineButton: { minWidth: 82, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderColor: '#F1B6B0', borderRadius: radii.control, backgroundColor: '#FFF4F2' },
  declineText: { color: colors.action, fontSize: 13, fontWeight: '900' },
  acceptButton: { minWidth: 82, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radii.control, backgroundColor: colors.safety },
  acceptText: { color: colors.surface, fontSize: 13, fontWeight: '900' },
  composer: { marginTop: 'auto', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.canvas },
  composerTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  quickRow: { flexDirection: 'row', gap: spacing.xs },
  quickChoice: { flex: 1, minWidth: 0, minHeight: 46, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface },
  quickChoiceOn: { borderColor: colors.school, backgroundColor: colors.surfaceMuted },
  quickText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  quickTextOn: { color: colors.school },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, minWidth: 0, minHeight: 52, maxHeight: 110, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface, color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  sendButton: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control, backgroundColor: colors.school },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
