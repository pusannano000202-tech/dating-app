import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EventOperationsSummary } from '../src/components/EventOperationsSummary';
import { MeetingGuidePager } from '../src/components/MeetingGuidePager';
import { PageHeader } from '../src/components/PageHeader';
import { ParticipationBar } from '../src/components/ParticipationBar';
import { Screen } from '../src/components/Screen';
import { TonightEventCarousel } from '../src/components/TonightEventCarousel';
import type { TonightEvent } from '../src/domain/events';
import { MEETING_GUIDE_SCENES } from '../src/domain/meeting-guide';
import { colors, radii, spacing } from '../src/theme/tokens';

const PREVIEW_EVENT: TonightEvent = {
  id: 'preview-tonight-walk-20260809-2030',
  kind: 'jogging',
  scheduleType: 'tonight',
  eyebrow: '오늘 20:30 · 2자리',
  title: '온천천 저녁 산책',
  description: '부산대에서 출발해 온천천을 함께 걷고, 안내 콘텐츠가 끝나면 편하게 귀가해요.',
  venue: '부산대 정문 시계탑 앞',
  meetingTime: '2026-08-09T20:30:00+09:00',
  capacity: 5,
  remaining: 2,
  imageKey: 'jogging',
  operations: {
    serverTime: '2026-08-09T16:00:00+09:00',
    eventId: 'preview-tonight-walk-20260809-2030',
    templateId: 'tonight-oncheoncheon-walk',
    eventType: 'tonight',
    activityType: 'walk',
    status: 'open',
    title: '온천천 저녁 산책',
    summary: '부산대에서 출발해 온천천을 함께 걷는 저녁 활동',
    imageUrl: null,
    startsAt: '2026-08-09T20:30:00+09:00',
    endsAt: '2026-08-09T22:00:00+09:00',
    checkInOpensAt: '2026-08-09T20:00:00+09:00',
    firstAssignmentAt: '2026-08-09T18:30:00+09:00',
    secondAssignmentAt: '2026-08-09T19:00:00+09:00',
    finalAssignmentAt: '2026-08-09T19:30:00+09:00',
    chatOpensAt: '2026-08-09T20:10:00+09:00',
    noShowReportOpensAt: '2026-08-09T20:40:00+09:00',
    timezone: 'Asia/Seoul',
    meetingPoint: { label: '부산대 정문 시계탑 앞', roadAddress: null, mapUrl: null },
    endPoint: { label: '온천천 산책로', roadAddress: null, mapUrl: null },
    routeSummary: '부산대 정문에서 온천천 산책로까지 왕복',
    capacityTotal: 5,
    capacityByGender: { male: 3, female: 2 },
    minimumCapacityTotal: 3,
    minimumCapacityByGender: { male: 1, female: 1 },
    reducedCapacityRequiresConsent: true,
    remainingByGender: { male: 1, female: 1 },
    partyRules: {
      soloAllowed: true,
      friendsAllowed: true,
      maxPartySize: 3,
      sameGenderOnly: true,
      preserveFriendParty: true,
      fillOpenSeatsWithSameGenderSolo: true,
    },
    rules: ['행사 전용 가명 사용', '외부 연락처 요청 금지'],
    contactRules: { externalContactRequestAllowed: false, afterContactChannel: 'quantum_chat' },
    deposit: { amountKrw: 10000, policyVersion: 'preview-only' },
    participation: null,
    remainingTotal: 2,
  },
};

export default function DevGuidedEventPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string }>();
  const [activeEventIndex, setActiveEventIndex] = useState(0);
  const [activeGuideIndex, setActiveGuideIndex] = useState(0);
  const view = params.view === 'guide' ? 'guide' : 'match';
  const events = useMemo(() => [PREVIEW_EVENT], []);

  if (!__DEV__) return <Redirect href="/login" />;

  return (
    <Screen backgroundColor={view === 'match' ? colors.night : colors.canvas} contentStyle={styles.content}>
      <View style={styles.switcher}>
        <PreviewButton active={view === 'match'} label="매칭 화면" onPress={() => router.setParams({ view: 'match' })} />
        <PreviewButton active={view === 'guide'} label="안내 만화" onPress={() => router.setParams({ view: 'guide' })} />
      </View>

      {view === 'match' ? (
        <>
          <PageHeader
            eyebrow="QUANTUM MATCH"
            title="오늘 밤, 활동으로 만나요"
            description="활동 하나만 고르면 장소와 남은 인원은 Quantum이 맞춰요."
            tone="dark"
          />
          <TonightEventCarousel
            events={events}
            activeIndex={activeEventIndex}
            onActiveIndexChange={setActiveEventIndex}
            accessibilityLabel="오늘 밤 활동 선택"
          />
          <EventOperationsSummary operations={PREVIEW_EVENT.operations} />
          <ParticipationBar
            event={null}
            activeEvent={PREVIEW_EVENT}
            participationPartyType={null}
            onJoin={() => undefined}
            onCancel={() => undefined}
          />
        </>
      ) : (
        <>
          <PageHeader
            eyebrow="QUANTUM GUIDE"
            title="만나기 전에 이것만 확인해요"
            description="가명, 팀 채팅, 귀가와 신고 규칙을 한 장면씩 확인해요."
            tone="light"
          />
          <View style={styles.guideBody}>
            <MeetingGuidePager
              scenes={MEETING_GUIDE_SCENES}
              activeIndex={activeGuideIndex}
              onActiveIndexChange={setActiveGuideIndex}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

function PreviewButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.switchButton, active && styles.switchButtonActive]}>
      <Text style={[styles.switchText, active && styles.switchTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xl },
  switcher: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    minHeight: 48,
    flexDirection: 'row',
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    padding: 4,
  },
  switchButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control },
  switchButtonActive: { backgroundColor: colors.school },
  switchText: { color: colors.muted, fontSize: 13, fontWeight: '900', letterSpacing: 0 },
  switchTextActive: { color: colors.surface },
  guideBody: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
  },
});
