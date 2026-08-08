import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarDays, ChevronRight, MapPin, Plus, UsersRound } from 'lucide-react-native';

import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import { colors, layout, radii, spacing } from '../../src/theme/tokens';

const meetupIdeas = [
  { id: 'jogging', label: '운동', title: '온천천 같이 달리기', image: require('../../assets/events/jogging.webp') },
  { id: 'board', label: '취미', title: '초보 보드게임 모임', image: require('../../assets/events/board-game.webp') },
  { id: 'dinner', label: '맛집', title: '새 식당 같이 가기', image: require('../../assets/events/dinner.webp') },
] as const;

export default function MeetupsScreen() {
  const [notice, setNotice] = useState<string | null>(null);

  function showPreviewNotice() {
    setNotice('모임 개설은 다음 단계에서 기존 Quantum 서버와 연결됩니다.');
    if (typeof Alert?.alert === 'function') Alert.alert('모바일 앱 1차 미리보기', '서버 연결 후 실제 모임을 개설할 수 있어요.');
  }

  return (
    <Screen contentStyle={styles.content}>
      <PageHeader
        eyebrow="QUANTUM 모임"
        title="같이 할 일을 먼저 골라요"
        description="성별 조건 없이 야구, 축구, 공부, 산책처럼 같이 하고 싶은 활동으로 방을 만들어요."
        action={(
          <Pressable accessibilityLabel="새 모임 만들기" onPress={showPreviewNotice} style={styles.addButton}>
            <Plus size={22} color={colors.surface} />
          </Pressable>
        )}
      />

      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>이런 모임은 어때요?</Text>
        <Text style={styles.sectionHint}>사진을 눌러 바로 만들기</Text>
      </View>
      <View style={styles.ideaList}>
        {meetupIdeas.map((idea) => (
          <Pressable key={idea.id} onPress={showPreviewNotice} style={({ pressed }) => [styles.idea, pressed && styles.pressed]}>
            <Image source={idea.image} style={styles.ideaImage} />
            <View style={styles.ideaCopy}>
              <Text style={styles.ideaLabel}>{idea.label}</Text>
              <Text style={styles.ideaTitle}>{idea.title}</Text>
              <Text style={styles.ideaAction}>이 활동으로 모임 열기</Text>
            </View>
            <ChevronRight size={20} color={colors.muted} />
          </Pressable>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>지금 모집 중</Text>
        <Text style={styles.sectionHint}>서버 연결 전 예시</Text>
      </View>
      <View style={styles.emptyState}>
        <UsersRound size={26} color={colors.school} />
        <Text style={styles.emptyTitle}>모바일 모임 목록을 준비하고 있어요</Text>
        <Text style={styles.emptyDescription}>실제 앱에서는 내 학교에서 열린 방만 안전하게 불러옵니다.</Text>
        <View style={styles.metaRow}>
          <CalendarDays size={15} color={colors.muted} />
          <Text style={styles.metaText}>날짜와 시간</Text>
          <MapPin size={15} color={colors.muted} />
          <Text style={styles.metaText}>학교 주변 장소</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg },
  addButton: {
    width: layout.minimumTouchTarget,
    height: layout.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.round,
    backgroundColor: colors.school,
  },
  notice: { marginHorizontal: spacing.lg, marginTop: spacing.md, color: colors.school, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  sectionHeader: { marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  sectionHint: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  ideaList: { marginTop: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.sm },
  idea: {
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  ideaImage: { width: 88, height: 76, borderRadius: radii.control },
  ideaCopy: { flex: 1 },
  ideaLabel: { color: colors.action, fontSize: 10, fontWeight: '900' },
  ideaTitle: { marginTop: 3, color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  ideaAction: { marginTop: 7, color: colors.school, fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.78 },
  emptyState: {
    margin: spacing.lg,
    marginTop: spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: spacing.xl,
  },
  emptyTitle: { marginTop: spacing.md, color: colors.ink, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  emptyDescription: { marginTop: 6, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  metaRow: { marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { marginRight: 6, color: colors.muted, fontSize: 11, fontWeight: '700' },
});
