import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { CalendarDays, ChevronRight, MoonStar, RefreshCw, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ImageBackground, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { getQuantumApiClient } from '../../src/api/quantum';
import { QuantumApiError, type MobileProfileStep, type QuantumPartyType } from '../../src/api/client';
import { EventOperationsSummary } from '../../src/components/EventOperationsSummary';
import { PageHeader } from '../../src/components/PageHeader';
import { ParticipationBar } from '../../src/components/ParticipationBar';
import { Screen } from '../../src/components/Screen';
import { TonightEventCarousel } from '../../src/components/TonightEventCarousel';
import type { TonightEvent } from '../../src/domain/events';
import { hasAcknowledgedMeetingGuide } from '../../src/state/meeting-guide-ack';
import { useParticipation } from '../../src/state/participation';
import { colors, radii, spacing } from '../../src/theme/tokens';

type Mode = 'tonight' | 'scheduled';
type EventCatalog = { tonight: TonightEvent[]; scheduled: TonightEvent[] };

const MODE_SCENE_IMAGES: Record<Mode, ImageSourcePropType> = {
  tonight: require('../../assets/events/jogging.webp'),
  scheduled: require('../../assets/events/board-game.webp'),
};

export default function MatchScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('tonight');
  const [partyType, setPartyType] = useState<QuantumPartyType>('solo');
  const [activeIndex, setActiveIndex] = useState(0);
  const [catalog, setCatalog] = useState<EventCatalog>({ tonight: [], scheduled: [] });
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [guideAcknowledged, setGuideAcknowledged] = useState(false);
  const [isPreparingMatch, setIsPreparingMatch] = useState(false);
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

  useEffect(() => {
    if (participation?.partyType) setPartyType(participation.partyType);
  }, [participation?.partyType]);

  useFocusEffect(useCallback(() => {
    let isActive = true;
    void hasAcknowledgedMeetingGuide()
      .then((acknowledged) => {
        if (isActive) setGuideAcknowledged(acknowledged);
      })
      .catch(() => {
        if (isActive) setGuideAcknowledged(false);
      });

    return () => {
      isActive = false;
    };
  }, []));

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setActiveIndex(0);
    setActionMessage(null);
  }

  async function joinActiveEvent() {
    if (!activeEvent || isSaving || isPreparingMatch) return;
    setActionMessage(null);

    if (partyType === 'friends') {
      setActionMessage('친구팀 연결 준비 중이에요. 지금은 혼자 참여만 저장할 수 있어요.');
      return;
    }

    let acknowledged: boolean;
    try {
      acknowledged = await hasAcknowledgedMeetingGuide();
      setGuideAcknowledged(acknowledged);
    } catch {
      setActionMessage('안전 안내 확인 상태를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }

    if (!acknowledged) {
      router.push('/meeting-guide');
      return;
    }

    setIsPreparingMatch(true);
    try {
      const api = getQuantumApiClient();
      const onboarding = await api.getProfileOnboarding();
      if (!onboarding.isComplete) {
        if (onboarding.nextStep === 'basic') {
          router.push('/profile/basic');
        } else if (onboarding.nextStep === 'worldcup') {
          router.push('/profile/worldcup');
        } else if (onboarding.nextStep === 'survey') {
          router.push('/profile/survey');
        } else if (onboarding.nextStep === 'photos') {
          router.push('/profile/photos');
        } else {
          setActionMessage(profileStepMessage(onboarding.nextStep));
        }
        return;
      }

      if (onboarding.appearanceStatus !== 'ready') {
        setActionMessage('매칭에만 쓰는 비공개 기준을 준비하고 있어요. 잠시만 기다려 주세요.');
        await api.prepareAppearanceScoreForMatch();
      }

      setActionMessage(null);
      await join(activeEvent.id, partyType);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error) {
      if (error instanceof QuantumApiError && error.code === 'photo_required') {
        setActionMessage('매칭 전에 얼굴이 잘 보이는 대표 사진을 등록해 주세요.');
        router.push('/profile/photos');
      } else if (error instanceof QuantumApiError && isAppearancePhotoIssue(error.code)) {
        setActionMessage(appearancePhotoIssueMessage(error.code));
        router.push('/profile/photos');
      } else if (error instanceof QuantumApiError && error.code === 'analysis_in_progress') {
        setActionMessage('이미 분석을 준비 중이에요. 잠시 후 다시 참여해 주세요.');
      } else if (error instanceof QuantumApiError && isAppearanceServiceError(error.code)) {
        setActionMessage('외모 분석 서버가 잠시 쉬고 있어요. 사진은 그대로 보관되니 잠시 후 다시 눌러 주세요.');
      } else {
        setActionMessage('현재 상태를 확인하지 못했어요. 잠시 후 다시 참여해 주세요.');
      }
    } finally {
      setIsPreparingMatch(false);
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
        title={mode === 'tonight' ? '오늘 밤, 활동으로 만나요' : '날짜를 먼저 정하고 만나요'}
        description="활동 하나만 고르면 장소와 남은 인원은 Quantum이 맞춰요."
        tone="dark"
      />

      <View style={styles.segment}>
        <ModeButton
          active={mode === 'tonight'}
          label="오늘 바로"
          detail="오늘 바로 가볍게 만나기"
          icon="tonight"
          image={MODE_SCENE_IMAGES.tonight}
          onPress={() => changeMode('tonight')}
        />
        <ModeButton
          active={mode === 'scheduled'}
          label="날짜 골라 만나기"
          detail="원하는 날짜의 특별한 만남"
          icon="scheduled"
          image={MODE_SCENE_IMAGES.scheduled}
          onPress={() => changeMode('scheduled')}
        />
      </View>

      <View style={styles.partySegment} accessibilityLabel="참여 방식">
        <PartyButton active={partyType === 'solo'} disabled={Boolean(participation)} label="혼자 참여" onPress={() => setPartyType('solo')} />
        <PartyButton active={partyType === 'friends'} disabled={Boolean(participation)} label="친구와 참여" onPress={() => setPartyType('friends')} />
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
          <EventOperationsSummary operations={activeEvent.operations} />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="안전 안내 보기"
            onPress={() => router.push('/meeting-guide')}
            style={({ pressed }) => [styles.guideLink, pressed && styles.guideLinkPressed]}
          >
            <ShieldCheck size={20} color={colors.safety} />
            <View style={styles.guideCopy}>
              <Text style={styles.guideTitle}>안전 안내 보기</Text>
              <Text style={styles.guideMeta}>{guideAcknowledged ? '확인 완료 · 다시 보기' : '첫 참여 전에 6개 규칙을 확인해 주세요'}</Text>
            </View>
            <ChevronRight size={20} color={colors.nightText} />
          </Pressable>
          <ParticipationBar
            event={joinedEvent}
            activeEvent={activeEvent}
            participationPartyType={participation?.partyType ?? null}
            disabled={isSaving || isPreparingMatch}
            joinUnavailableReason={partyType === 'friends' ? '친구팀 연결 준비 중' : null}
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

function profileStepMessage(step: MobileProfileStep): string {
  if (step === 'worldcup') return '이상형 월드컵을 마치면 매칭에 참여할 수 있어요.';
  if (step === 'survey') return '취향 설문을 마치면 매칭에 참여할 수 있어요.';
  return '프로필을 마치면 매칭에 참여할 수 있어요.';
}

function isAppearanceServiceError(code: string): boolean {
  return code === 'ai_server_not_configured'
    || code === 'ai_server_unavailable'
    || code === 'ai_server_timeout'
    || code === 'analysis_quota_unavailable'
    || code === 'server_unavailable'
    || code === 'score_state_failed'
    || code === 'profile_update_failed';
}

type AppearancePhotoIssue =
  | 'photo_no_face'
  | 'photo_multiple_people'
  | 'photo_face_occluded'
  | 'photo_low_quality'
  | 'photo_minor_suspected';

function isAppearancePhotoIssue(code: string): code is AppearancePhotoIssue {
  return code === 'photo_no_face'
    || code === 'photo_multiple_people'
    || code === 'photo_face_occluded'
    || code === 'photo_low_quality'
    || code === 'photo_minor_suspected';
}

function appearancePhotoIssueMessage(code: AppearancePhotoIssue): string {
  if (code === 'photo_multiple_people') return '여러 명이 나온 사진 대신 본인만 나온 사진을 다시 올려 주세요.';
  if (code === 'photo_face_occluded') return '얼굴이 가려지지 않은 본인 사진을 다시 올려 주세요.';
  if (code === 'photo_low_quality') return '흐리거나 어두운 사진 대신 얼굴이 선명한 사진을 다시 올려 주세요.';
  if (code === 'photo_minor_suspected') return '성인 여부를 확인할 수 있는 최근 본인 사진을 다시 올려 주세요.';
  return '얼굴이 잘 보이는 본인 사진을 다시 올려 주세요.';
}

function ModeButton({
  active,
  label,
  detail,
  icon,
  image,
  onPress,
}: {
  active: boolean;
  label: string;
  detail: string;
  icon: Mode;
  image: ImageSourcePropType;
  onPress: () => void;
}) {
  const Icon = icon === 'tonight' ? MoonStar : CalendarDays;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.segmentButton, active ? styles.segmentActive : styles.segmentInactive]}
    >
      <ImageBackground source={image} resizeMode="cover" style={styles.modeSceneImage} imageStyle={styles.modeSceneImageRadius}>
        <View style={[styles.modeSceneOverlay, active ? styles.modeSceneOverlayActive : styles.modeSceneOverlayInactive]} />
        <View style={styles.modeSceneCopy}>
          <View style={styles.modeSceneEyebrow}>
            <Icon size={15} color="#F3B95F" />
            <Text style={styles.modeSceneEyebrowText}>{icon === 'tonight' ? '지금 가능한 활동' : '다가오는 일정'}</Text>
          </View>
          <Text numberOfLines={2} style={styles.segmentText}>{label}</Text>
          {active ? <Text numberOfLines={1} style={styles.segmentDetail}>{detail}</Text> : null}
        </View>
      </ImageBackground>
    </Pressable>
  );
}

function PartyButton({ active, disabled, label, onPress }: { active: boolean; disabled: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.partyButton, active && styles.partyActive, disabled && styles.partyLocked]}
    >
      <Text style={[styles.partyText, active && styles.partyTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xl },
  segment: {
    minHeight: 88,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    flexDirection: 'row',
    gap: 2,
    overflow: 'hidden',
    borderRadius: radii.card,
    backgroundColor: '#0D151C',
  },
  segmentButton: {
    flex: 1,
    minHeight: 88,
    overflow: 'hidden',
  },
  segmentActive: { flex: 1.35 },
  segmentInactive: { flex: 0.85, opacity: 0.78 },
  modeSceneImage: { flex: 1, justifyContent: 'flex-end' },
  modeSceneImageRadius: { borderRadius: radii.card },
  modeSceneOverlay: { ...StyleSheet.absoluteFill },
  modeSceneOverlayActive: { backgroundColor: 'rgba(13,21,28,0.58)' },
  modeSceneOverlayInactive: { backgroundColor: 'rgba(13,21,28,0.78)' },
  modeSceneCopy: { minHeight: 88, justifyContent: 'flex-end', paddingHorizontal: 12, paddingVertical: 10 },
  modeSceneEyebrow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  modeSceneEyebrowText: { color: '#F3B95F', fontSize: 9, fontWeight: '900', letterSpacing: 0 },
  segmentText: { marginTop: 4, color: colors.nightText, fontSize: 15, lineHeight: 19, fontWeight: '900', letterSpacing: 0 },
  segmentDetail: { marginTop: 2, color: 'rgba(255,255,255,0.72)', fontSize: 10, fontWeight: '700', letterSpacing: 0 },
  partySegment: { marginHorizontal: spacing.lg, marginTop: spacing.sm, flexDirection: 'row', gap: spacing.sm },
  partyButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: radii.control },
  partyActive: { borderColor: colors.safety, backgroundColor: 'rgba(20,122,112,0.24)' },
  partyLocked: { opacity: 0.72 },
  partyText: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '800' },
  partyTextActive: { color: colors.nightText },
  statePanel: { minHeight: 330, marginHorizontal: spacing.lg, marginTop: spacing.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.md, borderRadius: radii.card, backgroundColor: colors.nightSurface, padding: spacing.xl },
  stateTitle: { color: colors.nightText, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  stateText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700' },
  retryButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radii.control, backgroundColor: '#F3B95F', paddingHorizontal: spacing.lg },
  retryText: { color: colors.night, fontSize: 13, fontWeight: '900' },
  guideLink: {
    minHeight: 56,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: spacing.sm,
  },
  guideLinkPressed: { opacity: 0.72 },
  guideCopy: { flex: 1, minWidth: 0 },
  guideTitle: { color: colors.nightText, fontSize: 13, fontWeight: '900', letterSpacing: 0 },
  guideMeta: { marginTop: 2, color: 'rgba(255,255,255,0.62)', fontSize: 11, fontWeight: '700', letterSpacing: 0 },
  errorText: { marginHorizontal: spacing.lg, marginTop: spacing.md, color: '#FF8D7E', fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
});
