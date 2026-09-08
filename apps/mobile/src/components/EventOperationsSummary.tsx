import { Clock3, MessageCircle, UsersRound } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import type { TonightEventOperations } from '../domain/events';
import { colors, spacing } from '../theme/tokens';

type EventOperationsSummaryProps = {
  operations: TonightEventOperations | null;
};

export function EventOperationsSummary({ operations }: EventOperationsSummaryProps) {
  if (!operations) {
    return (
      <View style={styles.wrap} accessibilityLabel="운영 요약">
        <Text style={styles.eyebrow}>운영 요약</Text>
        <View style={styles.fallbackRow}>
          <Clock3 size={18} color={colors.warning} />
          <Text style={styles.fallbackText}>운영 일정 확정 중</Text>
        </View>
      </View>
    );
  }

  const assignmentValue = operations.eventType === 'tonight'
    ? `T-120 ${formatTime(operations.firstAssignmentAt)} · T-90 ${formatTime(operations.secondAssignmentAt)} · T-60 ${formatTime(operations.finalAssignmentAt)}`
    : `1차 ${formatTime(operations.firstAssignmentAt)} · 2차 ${formatTime(operations.secondAssignmentAt)} · 최종 ${formatTime(operations.finalAssignmentAt)}`;
  const eventDayValue = operations.eventType === 'tonight'
    ? `T-20 채팅 ${formatTime(operations.chatOpensAt)} · T+10 노쇼 신고 ${formatTime(operations.noShowReportOpensAt)}`
    : `채팅 ${formatTime(operations.chatOpensAt)} · 노쇼 신고 ${formatTime(operations.noShowReportOpensAt)}`;

  return (
    <View style={styles.wrap} accessibilityLabel="운영 요약">
      <Text style={styles.eyebrow}>운영 요약</Text>
      <SummaryRow
        icon={<UsersRound size={18} color={colors.safety} />}
        label="참여 인원"
        value={`목표 남 ${operations.capacityByGender.male} · 여 ${operations.capacityByGender.female} / 최소 혼성 ${operations.minimumCapacityTotal}명`}
      />
      <SummaryRow
        icon={<Clock3 size={18} color={colors.warning} />}
        label="팀 편성"
        value={assignmentValue}
      />
      <SummaryRow
        icon={<MessageCircle size={18} color="#F3B95F" />}
        label="당일 진행"
        value={eventDayValue}
      />
    </View>
  );
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}>{icon}</View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
    </View>
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.14)',
    paddingVertical: spacing.sm,
  },
  fallbackRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.14)',
  },
  icon: {
    width: 24,
    alignItems: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  value: {
    marginTop: 3,
    color: colors.nightText,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
    letterSpacing: 0,
  },
  fallbackText: {
    color: colors.nightText,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
    letterSpacing: 0,
  },
});
