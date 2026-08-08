import * as Haptics from 'expo-haptics';
import { CalendarDays, MoonStar, RefreshCw } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { getQuantumApiClient } from '../../src/api/quantum';
import type { QuantumPartyType } from '../../src/api/client';
import { PageHeader } from '../../src/components/PageHeader';
import { ParticipationBar } from '../../src/components/ParticipationBar';
import { Screen } from '../../src/components/Screen';
import { TonightEventCarousel } from '../../src/components/TonightEventCarousel';
import type { TonightEvent } from '../../src/domain/events';
import { useParticipation } from '../../src/state/participation';
import { colors, radii, spacing } from '../../src/theme/tokens';

type Mode = 'tonight' | 'scheduled';
type EventCatalog = { tonight: TonightEvent[]; scheduled: TonightEvent[] };

export default function MatchScreen() {
  const [mode, setMode] = useState<Mode>('tonight');
  const [partyType, setPartyType] = useState<QuantumPartyType>('solo');
  const [activeIndex, setActiveIndex] = useState(0);
  const [catalog, setCatalog] = useState<EventCatalog>({ tonight: [], scheduled: [] });
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const { participation, join, cancel, isSaving, error: participationError } = useParticipation();
  const activeEvents = catalog[mode];
  const activeEvent = activeEvents[activeIndex];
  const allEvents = useMemo(() => [...catalog.tonight, ...catalog.scheduled], [catalog]);
  const joinedEvent = useMemo(
    () => allEvents.find((event) => event.id === participation?.eventId) ?? null,
    [allEvents, participation?.eventId],
  );

  async function loadEvents() {
    setCatalogState('loading');
    try {
      const events = await getQuantumApiClient().listEvents();
      setCatalog(events);
      setCatalogState('ready');
    } catch {
      setCatalogState('error');
    }
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setActiveIndex(0);
    setActionMessage(null);
  }

  async function joinActiveEvent() {
    if (!activeEvent || isSaving) return;
    setActionMessage(null);
    try {
      await join(activeEvent.id, partyType);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch {
      setActionMessage('잠시 후 다시 참여해 주세요.');
    }
  }

  async function cancelParticipation() {
    if (isSaving) return;
    setActionMessage(null);
    try {
      await cancel();
    } catch {
      setActionMessage('잠시 후 다시 취소해 주세요.');
    }
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
        <ModeButton active={mode === 'tonight'} label="오늘 밤" icon="tonight" onPress={() => changeMode('tonight')} />
        <ModeButton active={mode === 'scheduled'} label="약속 잡기" icon="scheduled" onPress={() => changeMode('scheduled')} />
      </View>

      <View style={styles.partySegment} accessibilityLabel="참여 방식">
        <PartyButton active={partyType === 'solo'} label="혼자 참여" onPress={() => setPartyType('solo')} />
        <PartyButton active={partyType === 'friends'} label="친구와 참여" onPress={() => setPartyType('friends')} />
      </View>

      {catalogState === 'loading' && (
        <View style={styles.statePanel}><ActivityIndicator color="#F3B95F" /><Text style={styles.stateText}>모임을 불러오는 중이에요</Text></View>
      )}
      {catalogState === 'error' && (
        <View style={styles.statePanel}>
          <Text style={styles.stateTitle}>모임을 불러오지 못했어요</Text>
          <Pressable onPress={() => void loadEvents()} style={styles.retryButton}>
            <RefreshCw size={17} color={colors.night} />
            <Text style={styles.retryText}>다시 불러오기</Text>
          </Pressable>
        </View>
      )}
      {catalogState === 'ready' && activeEvent && (
        <>
          <TonightEventCarousel
            events={activeEvents}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            accessibilityLabel={mode === 'tonight' ? '오늘 밤 활동 선택' : '예정 모임 선택'}
          />
          <ParticipationBar
            event={joinedEvent}
            activeEvent={activeEvent}
            disabled={isSaving}
            onJoin={() => void joinActiveEvent()}
            onCancel={() => void cancelParticipation()}
          />
        </>
      )}
      {(participationError || actionMessage) && (
        <Text style={styles.errorText} role="alert">{actionMessage ?? participationError}</Text>
      )}
    </Screen>
  );
}

function ModeButton({ active, label, icon, onPress }: { active: boolean; label: string; icon: Mode; onPress: () => void }) {
  const Icon = icon === 'tonight' ? MoonStar : CalendarDays;
  return (
    <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.segmentActive]}>
      <Icon size={17} color={active ? colors.night : colors.nightText} />
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PartyButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.partyButton, active && styles.partyActive]}>
      <Text style={[styles.partyText, active && styles.partyTextActive]}>{label}</Text>
    </Pressable>
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
  partySegment: { marginHorizontal: spacing.lg, marginTop: spacing.sm, flexDirection: 'row', gap: spacing.sm },
  partyButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: radii.control },
  partyActive: { borderColor: colors.safety, backgroundColor: 'rgba(20,122,112,0.24)' },
  partyText: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '800' },
  partyTextActive: { color: colors.nightText },
  statePanel: { minHeight: 330, marginHorizontal: spacing.lg, marginTop: spacing.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.md, borderRadius: radii.card, backgroundColor: colors.nightSurface, padding: spacing.xl },
  stateTitle: { color: colors.nightText, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  stateText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700' },
  retryButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radii.control, backgroundColor: '#F3B95F', paddingHorizontal: spacing.lg },
  retryText: { color: colors.night, fontSize: 13, fontWeight: '900' },
  errorText: { marginHorizontal: spacing.lg, marginTop: spacing.md, color: '#FF8D7E', fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
});
