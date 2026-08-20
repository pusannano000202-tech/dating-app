import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MeetingGuidePager } from '../src/components/MeetingGuidePager';
import { PageHeader } from '../src/components/PageHeader';
import { colors, layout, radii, spacing } from '../src/theme/tokens';
import {
  MEETING_GUIDE_MIN_TOUCH_TARGET,
  MEETING_GUIDE_SCENES,
} from '../src/domain/meeting-guide';
import { markMeetingGuideAcknowledged } from '../src/state/meeting-guide-ack';

export default function MeetingGuideScreen() {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const [finishState, setFinishState] = useState<'idle' | 'saving' | 'error'>('idle');

  async function exitGuide() {
    const canGoBack = typeof router.canGoBack === 'function' && router.canGoBack();
    if (canGoBack) {
      router.back();
      return;
    }
    router.replace('/match');
  }

  async function handleClose() {
    await exitGuide();
  }

  async function handleFinish() {
    if (finishState === 'saving') return;
    setFinishState('saving');
    try {
      await markMeetingGuideAcknowledged();
      await exitGuide();
    } catch {
      setFinishState('error');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <PageHeader
            eyebrow="QUANTUM 가이드"
            title="과팅 주의사항"
            description="행사 전반 진행 규칙을 6단계로 확인해 보세요."
            tone="light"
          />
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="닫기"
            accessibilityHint="안내 화면을 닫습니다."
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <ChevronLeft size={20} color={colors.ink} />
            <Text style={styles.closeText}>닫기</Text>
          </Pressable>
        </View>
        <View style={styles.pagerCard}>
          <MeetingGuidePager
            scenes={MEETING_GUIDE_SCENES}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            onFinish={handleFinish}
            isFinishing={finishState === 'saving'}
          />
          {finishState === 'error' ? (
            <Text role="alert" style={styles.errorText}>안내 확인을 저장하지 못했어요. 완료 버튼을 다시 눌러 주세요.</Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: layout.contentPadding,
    gap: spacing.lg,
  },
  topRow: {
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    minHeight: MEETING_GUIDE_MIN_TOUCH_TARGET,
    minWidth: MEETING_GUIDE_MIN_TOUCH_TARGET,
    paddingHorizontal: 8,
    borderRadius: radii.round,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
  closeText: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  pagerCard: {
    marginTop: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  errorText: {
    marginTop: spacing.md,
    color: colors.action,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
    textAlign: 'center',
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
