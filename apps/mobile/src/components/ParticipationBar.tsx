import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, X } from 'lucide-react-native';

import { type TonightEvent } from '../domain/events';
import { colors, layout, radii, spacing } from '../theme/tokens';

type ParticipationBarProps = {
  event: TonightEvent | null;
  activeEvent: TonightEvent;
  disabled?: boolean;
  onJoin: () => void;
  onCancel: () => void;
};

export function ParticipationBar({ event, activeEvent, disabled = false, onJoin, onCancel }: ParticipationBarProps) {
  if (event) {
    return (
      <View style={styles.joined} accessibilityLiveRegion="polite">
        <View style={styles.joinedIcon}><Check size={18} color={colors.surface} strokeWidth={3} /></View>
        <View style={styles.copy}>
          <Text style={styles.joinedEyebrow}>참여 중</Text>
          <Text numberOfLines={1} style={styles.joinedTitle}>{event.title}</Text>
          <Text style={styles.joinedMeta}>{event.meetingTime} · {event.venue}</Text>
        </View>
        <Pressable accessibilityLabel="참여 취소" disabled={disabled} onPress={onCancel} style={[styles.cancelButton, disabled && styles.disabled]}>
          <X size={19} color={colors.ink} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable disabled={disabled} onPress={onJoin} style={({ pressed }) => [styles.joinButton, pressed && styles.pressed, disabled && styles.disabled]}>
      <Text style={styles.joinButtonTitle}>{disabled ? '저장 중' : `${activeEvent.title} 참여하기`}</Text>
      <Text style={styles.joinButtonMeta}>참여는 계정에 저장되며 결제는 아직 진행되지 않아요</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  joined: {
    minHeight: 84,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  joinedIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.safety,
  },
  copy: { flex: 1, minWidth: 0 },
  joinedEyebrow: { color: colors.safety, fontSize: 11, fontWeight: '900' },
  joinedTitle: { marginTop: 2, color: colors.ink, fontSize: 15, fontWeight: '900' },
  joinedMeta: { marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: '700' },
  cancelButton: {
    width: layout.minimumTouchTarget,
    height: layout.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.round,
    backgroundColor: colors.canvas,
  },
  joinButton: {
    minHeight: 68,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.card,
    backgroundColor: colors.action,
    paddingHorizontal: spacing.lg,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
  joinButtonTitle: { color: colors.surface, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  joinButtonMeta: { marginTop: 4, color: 'rgba(255,255,255,0.76)', fontSize: 10, fontWeight: '700', textAlign: 'center' },
});
