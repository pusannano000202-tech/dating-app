import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CalendarDays, MoonStar } from 'lucide-react-native';

import { PageHeader } from '../../src/components/PageHeader';
import { ParticipationBar } from '../../src/components/ParticipationBar';
import { Screen } from '../../src/components/Screen';
import { TonightEventCarousel } from '../../src/components/TonightEventCarousel';
import { scheduledEvents, tonightEvents } from '../../src/domain/events';
import { useParticipation } from '../../src/state/participation';
import { colors, radii, spacing } from '../../src/theme/tokens';

type Mode = 'tonight' | 'scheduled';

export default function MatchScreen() {
  const [mode, setMode] = useState<Mode>('tonight');
  const [activeIndex, setActiveIndex] = useState(0);
  const { participation, join, cancel } = useParticipation();
  const activeEvents = mode === 'tonight' ? tonightEvents : scheduledEvents;
  const activeEvent = activeEvents[activeIndex];
  const joinedEvent = useMemo(
    () => (
      tonightEvents.find((event) => event.id === participation?.eventId)
      ?? scheduledEvents.find((event) => event.id === participation?.eventId)
      ?? null
    ),
    [participation],
  );

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setActiveIndex(0);
  }

  function joinActiveEvent() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    join(activeEvent.id);
  }

  return (
    <Screen backgroundColor={colors.night} contentStyle={styles.content}>
      <PageHeader
        eyebrow="QUANTUM MATCH"
        title={mode === 'tonight' ? '오늘 밤, 다섯 명이 만나요' : '날짜를 먼저 정하고 만나요'}
        description="활동 하나만 고르면 장소와 남은 인원은 Quantum이 맞춰요."
        tone="dark"
      />

      <View style={styles.segment}>
        <Pressable onPress={() => changeMode('tonight')} style={[styles.segmentButton, mode === 'tonight' && styles.segmentActive]}>
          <MoonStar size={17} color={mode === 'tonight' ? colors.night : colors.nightText} />
          <Text style={[styles.segmentText, mode === 'tonight' && styles.segmentTextActive]}>오늘 밤</Text>
        </Pressable>
        <Pressable onPress={() => changeMode('scheduled')} style={[styles.segmentButton, mode === 'scheduled' && styles.segmentActive]}>
          <CalendarDays size={17} color={mode === 'scheduled' ? colors.night : colors.nightText} />
          <Text style={[styles.segmentText, mode === 'scheduled' && styles.segmentTextActive]}>약속 잡기</Text>
        </Pressable>
      </View>

      <TonightEventCarousel
        events={activeEvents}
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
        accessibilityLabel={mode === 'tonight' ? '오늘 밤 활동 선택' : '예정 모임 선택'}
      />
      <ParticipationBar event={joinedEvent} activeEvent={activeEvent} onJoin={joinActiveEvent} onCancel={cancel} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xl },
  segment: {
    minHeight: 54,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    flexDirection: 'row',
    borderRadius: radii.card,
    backgroundColor: colors.nightSurface,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: radii.control,
  },
  segmentActive: { backgroundColor: '#F3B95F' },
  segmentText: { color: colors.nightText, fontSize: 13, fontWeight: '900' },
  segmentTextActive: { color: colors.night },
});
