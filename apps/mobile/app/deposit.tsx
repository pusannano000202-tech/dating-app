import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CircleCheck, CircleDollarSign, RefreshCw, RotateCcw, ShieldCheck, WalletCards } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  DepositApiError,
  getDepositApi,
  type MobileDepositOverview,
  type MobileDepositStatus,
} from '../src/api/deposit';
import { PageHeader } from '../src/components/PageHeader';
import { Screen } from '../src/components/Screen';
import { colors, radii, spacing } from '../src/theme/tokens';

const DEPOSIT_LABEL = '보증금 10,000원';

export default function DepositRoute() {
  return <DepositScreen />;
}

export function DepositScreen({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const params = useLocalSearchParams<{
    match_id?: string | string[];
    group_id?: string | string[];
    matchId?: string | string[];
    groupId?: string | string[];
  }>();
  const scope = useMemo(() => ({
    matchId: preview ? 'preview-match' : readQueryValue(params.match_id) || readQueryValue(params.matchId),
    groupId: preview ? 'preview-group' : readQueryValue(params.group_id) || readQueryValue(params.groupId),
  }), [params.groupId, params.group_id, params.matchId, params.match_id, preview]);
  const hasScope = Boolean(scope.matchId && scope.groupId);
  const [overview, setOverview] = useState<MobileDepositOverview | null>(() => preview ? buildPreviewOverview() : null);
  const [loading, setLoading] = useState(hasScope && !preview);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'carryover' | 'refund' | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (preview) {
      setOverview(buildPreviewOverview());
      setLoading(false);
      setErrorMessage(null);
      return;
    }
    if (!scope.matchId || !scope.groupId) {
      setOverview(null);
      setLoading(false);
      setErrorMessage(null);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await getDepositApi().getDepositOverview(scope);
      setOverview(result);
    } catch (error) {
      setOverview(null);
      setErrorMessage(toDepositErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [preview, scope.groupId, scope.matchId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const status = overview?.deposit?.status ?? null;
  const statusCopy = getDepositStatusCopy(status, Boolean(overview));
  const canSettle = status === 'paid' || status === 'held';

  const chooseDepositCarryover = useCallback(async () => {
    if (!scope.matchId || !canSettle || busyAction) return;
    if (preview) {
      setActionMessage('보증금 1만원을 다음 매칭에 이어 쓰도록 보관했어요.');
      return;
    }
    setBusyAction('carryover');
    setErrorMessage(null);
    setActionMessage(null);
    try {
      await getDepositApi().chooseDepositCarryover({ matchId: scope.matchId });
      setActionMessage('보증금 1만원을 다음 매칭에 이어 쓰도록 보관했어요.');
    } catch (error) {
      setErrorMessage(toDepositErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, canSettle, preview, scope.matchId]);

  const requestFullDepositRefund = useCallback(async () => {
    if (!scope.matchId || !canSettle || busyAction) return;
    if (preview) {
      setOverview({ amount: 10_000, deposit: null });
      setActionMessage('보증금 1만원 전액 환불이 접수됐어요.');
      return;
    }
    setBusyAction('refund');
    setErrorMessage(null);
    setActionMessage(null);
    try {
      await getDepositApi().requestFullDepositRefund({ matchId: scope.matchId });
      setOverview({ amount: 10_000, deposit: null });
      setActionMessage('보증금 1만원 전액 환불이 접수됐어요.');
    } catch (error) {
      setErrorMessage(toDepositErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, canSettle, preview, scope.matchId]);

  function confirmCarryover() {
    Alert.alert(
      '다음 매칭에 이어 쓸까요?',
      '보증금 1만원을 다시 결제하지 않고 다음 확정 매칭에 사용합니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '이월하기', onPress: () => void chooseDepositCarryover() },
      ],
    );
  }

  function confirmRefund() {
    Alert.alert(
      '전액 환불할까요?',
      '보증금 1만원을 결제했던 수단으로 전액 돌려받습니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '전액 환불', style: 'destructive', onPress: () => void requestFullDepositRefund() },
      ],
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.iconButton}>
          <ArrowLeft size={21} color={colors.ink} />
        </Pressable>
        <Text style={styles.step}>보증금 관리</Text>
      </View>

      <PageHeader
        eyebrow="QUANTUM 약속 장치"
        title={'보증금은 만남 뒤\n선택해서 관리해요'}
        description="1만원은 보증금으로 따로 보관하고, 자율 후원과 섞지 않습니다."
      />

      <View style={styles.balancePanel}>
        <View style={styles.balanceIcon}>
          <WalletCards size={23} color={colors.school} />
        </View>
        <View style={styles.balanceCopy}>
          <Text style={styles.balanceLabel}>이 매칭에서 확인하는 금액</Text>
          <Text style={styles.balanceAmount}>{DEPOSIT_LABEL}</Text>
          <Text style={[styles.statusText, status && statusColor(status)]}>{statusCopy.title}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.statePanel}>
          <ActivityIndicator color={colors.school} />
          <Text style={styles.stateTitle}>보증금 상태를 확인하고 있어요</Text>
          <Text style={styles.stateBody}>결과가 오기 전에는 어떤 처리도 시작하지 않습니다.</Text>
        </View>
      ) : !hasScope ? (
        <View style={styles.statePanel}>
          <CircleDollarSign size={28} color={colors.muted} />
          <Text style={styles.stateTitle}>아직 확인할 매칭이 없어요</Text>
          <Text style={styles.stateBody}>매칭이 확정되면 해당 회차의 보증금 상태를 여기에서 확인할 수 있어요.</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.statePanel}>
          <RefreshCw size={27} color={colors.action} />
          <Text accessibilityRole="alert" style={styles.stateTitle}>상태를 불러오지 못했어요</Text>
          <Text style={styles.stateBody}>{errorMessage}</Text>
        </View>
      ) : (
        <View style={styles.verifiedPanel}>
          <ShieldCheck size={21} color={colors.safety} />
          <View style={styles.verifiedCopy}>
            <Text style={styles.verifiedTitle}>서버에서 확인한 상태</Text>
            <Text style={styles.verifiedBody}>{statusCopy.description}</Text>
          </View>
        </View>
      )}

      <View style={styles.actionSection}>
        <Text style={styles.sectionEyebrow}>만남 종료 후 선택</Text>
        <Text style={styles.sectionTitle}>1만원을 돌려받거나 이어 쓰세요</Text>
        <Text style={styles.sectionBody}>
          만남이 완료된 보증금만 선택할 수 있어요. 두 선택은 동시에 처리되지 않습니다.
        </Text>

        {actionMessage ? (
          <View style={styles.successPanel}>
            <CircleCheck size={20} color={colors.safety} />
            <Text accessibilityRole="alert" style={styles.successText}>{actionMessage}</Text>
          </View>
        ) : null}

        <DepositAction
          title="다음 매칭에 이월"
          description="같은 1만원을 다음 확정 매칭의 보증금으로 사용해요"
          icon={<RotateCcw size={21} color={colors.school} />}
          disabled={!canSettle || Boolean(busyAction)}
          busy={busyAction === 'carryover'}
          onPress={confirmCarryover}
        />
        <DepositAction
          title="전액 환불"
          description="보증금 1만원 전부를 결제했던 수단으로 돌려받아요"
          icon={<WalletCards size={21} color={colors.action} />}
          disabled={!canSettle || Boolean(busyAction)}
          busy={busyAction === 'refund'}
          onPress={confirmRefund}
        />
        <Text style={styles.supportNote}>자율 후원은 보증금과 섞지 않고 만남 후기에서 별도로 선택해요.</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!hasScope || loading}
        onPress={() => void loadOverview()}
        style={({ pressed }) => [
          styles.reloadButton,
          (!hasScope || loading) && styles.buttonDisabled,
          pressed && styles.pressed,
        ]}
      >
        {loading
          ? <ActivityIndicator color={colors.surface} />
          : <RefreshCw size={18} color={colors.surface} />}
        <Text style={styles.reloadText}>다시 확인</Text>
      </Pressable>
    </Screen>
  );
}

function buildPreviewOverview(): MobileDepositOverview {
  return {
    amount: 10_000,
    deposit: {
      id: 'preview-deposit',
      matchId: 'preview-match',
      groupId: 'preview-group',
      amount: 10_000,
      status: 'held',
      paidAt: '2026-08-12T12:00:00.000Z',
      createdAt: '2026-08-12T11:00:00.000Z',
    },
  };
}

function DepositAction({
  title,
  description,
  icon,
  disabled,
  busy,
  onPress,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, disabled && styles.buttonDisabled, pressed && styles.pressed]}
    >
      <View style={styles.actionIcon}>{busy ? <ActivityIndicator color={colors.school} /> : icon}</View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>
      <Text style={styles.actionBadge}>{disabled && !busy ? '완료 후' : '선택'}</Text>
    </Pressable>
  );
}

function getDepositStatusCopy(status: MobileDepositStatus | null, hasOverview: boolean) {
  if (!hasOverview) return { title: '확인 전', description: '매칭 정보를 확인하면 현재 상태가 표시됩니다.' };
  switch (status) {
    case 'pending':
      return { title: '결제 확인 중', description: '이 매칭의 보증금 결제 확인이 아직 끝나지 않았어요.' };
    case 'paid':
      return { title: '결제 완료', description: '이 매칭에 낸 보증금 1만원이 서버에서 확인됐어요.' };
    case 'held':
      return { title: '보관 중', description: '보증금 1만원이 이 매칭을 위해 보관 중인 것으로 확인됐어요.' };
    default:
      return { title: '내역 없음', description: '이 매칭에 연결된 활성 보증금 내역이 아직 없어요.' };
  }
}

function statusColor(status: MobileDepositStatus) {
  return status === 'pending' ? styles.statusPending : status === 'held' ? styles.statusHeld : styles.statusPaid;
}

function readQueryValue(value: string | string[] | undefined): string {
  const current = Array.isArray(value) ? value[0] : value;
  return typeof current === 'string' ? current.trim() : '';
}

function toDepositErrorMessage(error: unknown): string {
  if (error instanceof DepositApiError) {
    if (error.code === 'auth_required') return '모바일 로그인과 보증금 조회 서버의 인증 연결을 확인해야 해요.';
    if (error.code === 'network_error') return '네트워크 연결을 확인하고 다시 시도해 주세요.';
    if (error.code === 'invalid_response') return '안전하게 확인할 수 없는 응답이라 화면에 표시하지 않았어요.';
    if (error.code === 'match_not_completed') return '만남이 완료된 뒤 선택할 수 있어요.';
    if (error.code === 'refund_already_requested') return '이미 전액 환불을 요청했어요.';
    if (error.code === 'carryover_already_available') return '이미 다음 매칭 이월을 선택했어요.';
    if (error.code === 'no_show_cannot_refund' || error.code === 'no_show_cannot_carryover') {
      return '노쇼 처리된 보증금은 환불하거나 이월할 수 없어요.';
    }
    if (error.code === 'refund_settlement_pending') return '환불 요청은 저장됐고 결제사 처리를 기다리고 있어요.';
  }
  return '잠시 후 다시 확인해 주세요. 확인되지 않은 금액이나 상태는 표시하지 않습니다.';
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  topRow: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  step: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  balancePanel: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  balanceIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.control,
    backgroundColor: colors.surfaceMuted,
  },
  balanceCopy: { flex: 1, minWidth: 0 },
  balanceLabel: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  balanceAmount: { marginTop: 5, color: colors.ink, fontSize: 25, lineHeight: 31, fontWeight: '900' },
  statusText: { marginTop: spacing.sm, color: colors.muted, fontSize: 13, fontWeight: '900' },
  statusPending: { color: colors.warning },
  statusPaid: { color: colors.safety },
  statusHeld: { color: colors.school },
  statePanel: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    minHeight: 142,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  stateTitle: { marginTop: spacing.sm, color: colors.ink, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  stateBody: { marginTop: 6, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  verifiedPanel: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.safety,
    backgroundColor: '#E9F5F2',
    padding: spacing.lg,
  },
  verifiedCopy: { flex: 1, minWidth: 0 },
  verifiedTitle: { color: colors.safety, fontSize: 13, fontWeight: '900' },
  verifiedBody: { marginTop: 5, color: colors.body, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  actionSection: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  sectionEyebrow: { color: colors.school, fontSize: 11, fontWeight: '900' },
  sectionTitle: { marginTop: 5, color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  sectionBody: { marginTop: spacing.sm, color: colors.muted, fontSize: 12, lineHeight: 19, fontWeight: '600' },
  actionRow: {
    minHeight: 76,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  actionIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.control,
    backgroundColor: colors.surfaceMuted,
  },
  actionCopy: { flex: 1, minWidth: 0 },
  actionTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  actionDescription: { marginTop: 4, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  actionBadge: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.control,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  successPanel: {
    minHeight: 56,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.safety,
    backgroundColor: '#E9F5F2',
    paddingHorizontal: spacing.md,
  },
  successText: { flex: 1, color: colors.safety, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  supportNote: { marginTop: spacing.md, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  reloadButton: {
    minHeight: 52,
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.control,
    backgroundColor: colors.school,
  },
  reloadText: { color: colors.surface, fontSize: 14, fontWeight: '900' },
  buttonDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.82 },
});
