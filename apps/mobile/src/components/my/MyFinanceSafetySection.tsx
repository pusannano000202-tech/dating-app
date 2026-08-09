import { ChevronRight, LogOut, ShieldCheck, WalletCards } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radii, spacing } from '../../theme/tokens';

export type MyFinanceSafetySectionProps = {
  onDeposit: () => void;
  onSignOut: () => void;
  signingOut: boolean;
  message: string | null;
};

export function MyFinanceSafetySection({ onDeposit, onSignOut, signingOut, message }: MyFinanceSafetySectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>결제와 안전</Text>
      <View style={styles.card}>
        <Pressable accessibilityRole="button" onPress={onDeposit} style={({ pressed }) => [styles.depositRow, pressed && styles.pressed]}>
          <WalletCards color={colors.school} size={20} />
          <View style={styles.depositCopy}>
            <Text style={styles.depositTitle}>보증금 10,000원</Text>
            <Text style={styles.depositDescription}>확정 매칭에서 상태를 확인해요</Text>
          </View>
          <ChevronRight color={colors.muted} size={17} />
        </Pressable>
        <View style={styles.safetyNote}>
          <ShieldCheck color={colors.safety} size={19} />
          <Text style={styles.safetyText}>외모 점수와 내부 매칭 정보는 다른 사용자에게 공개하지 않아요.</Text>
        </View>
        {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={signingOut}
          onPress={onSignOut}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed, signingOut && styles.disabled]}
        >
          {signingOut ? <ActivityIndicator color={colors.muted} size="small" /> : <LogOut color={colors.muted} size={18} />}
          <Text style={styles.signOutText}>로그아웃</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  card: { overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface },
  depositRow: { minHeight: layout.minimumTouchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  depositCopy: { flex: 1, minWidth: 0, gap: 2 },
  depositTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  depositDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  safetyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surfaceMuted },
  safetyText: { flex: 1, color: colors.safety, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  message: { marginHorizontal: spacing.md, marginTop: spacing.sm, color: colors.action, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  signOut: { minHeight: layout.minimumTouchTarget, marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line },
  signOutText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  pressed: { backgroundColor: colors.surfaceMuted },
  disabled: { opacity: 0.62 },
});
