import { useRouter } from 'expo-router';
import { Bell, ChevronRight, MoonStar, Plus, Sparkles, UsersRound } from 'lucide-react-native';
import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Screen } from '../../src/components/Screen';
import { colors, layout, radii, spacing } from '../../src/theme/tokens';

const hero = require('../../assets/tonight-five.webp');

const recommendations = [
  {
    id: 'match',
    icon: Sparkles,
    eyebrow: '오늘 밤',
    title: '다섯 명이 만나는 활동 고르기',
    description: '저녁, 조깅, 보드게임 중 하나만 고르면 장소와 인원은 Quantum이 맞춰요.',
    action: '활동 돌려보기',
    href: '/match' as const,
    color: colors.action,
  },
  {
    id: 'meetups',
    icon: UsersRound,
    eyebrow: '내가 여는 모임',
    title: '같이 할 사람을 직접 모으기',
    description: '성별 조건 없이 운동, 관람, 공부처럼 하고 싶은 활동으로 방을 만들어요.',
    action: '모임 둘러보기',
    href: '/meetups' as const,
    color: colors.safety,
  },
] as const;

export default function HomeScreen() {
  const router = useRouter();

  return (
    <Screen
      contentStyle={styles.content}
      before={(
        <View style={styles.topbar}>
          <View>
            <Text style={styles.brand}>Quantum</Text>
            <Text style={styles.school}>부산대학교 · 오늘의 캠퍼스</Text>
          </View>
          <Pressable accessibilityLabel="알림" style={styles.iconButton}>
            <Bell size={21} color={colors.ink} />
            <View style={styles.notificationDot} />
          </Pressable>
        </View>
      )}
    >
      <ImageBackground source={hero} style={styles.hero} resizeMode="cover">
        <LinearGradient colors={['rgba(8,14,18,0.05)', 'rgba(8,14,18,0.9)']} style={StyleSheet.absoluteFill} />
        <View style={styles.heroContent}>
          <View style={styles.heroSignal}>
            <MoonStar size={15} color="#F3B95F" />
            <Text style={styles.heroSignalText}>오늘 밤 3개 활동이 열렸어요</Text>
          </View>
          <Text style={styles.heroTitle}>뭐 하지 고민하기 전에,{`\n`}Quantum이 다음 행동을 골라드려요.</Text>
          <Text style={styles.heroDescription}>한 번 누르면 활동 선택부터 만날 장소까지 이어집니다.</Text>
          <Pressable
            onPress={() => router.push('/match')}
            style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}
          >
            <Text style={styles.heroButtonText}>오늘 밤 약속 보기</Text>
            <ChevronRight size={20} color={colors.surface} />
          </Pressable>
        </View>
      </ImageBackground>

      <View style={styles.body}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>QUANTUM PICK</Text>
            <Text style={styles.sectionTitle}>지금 해볼 것</Text>
          </View>
          <Text style={styles.sectionHint}>두 가지만 골랐어요</Text>
        </View>

        <View style={styles.recommendationList}>
          {recommendations.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.id}
                onPress={() => router.push(item.href)}
                style={({ pressed }) => [styles.recommendation, pressed && styles.pressed]}
              >
                <View style={[styles.recommendationIcon, { backgroundColor: `${item.color}14` }]}>
                  <Icon size={22} color={item.color} />
                </View>
                <View style={styles.recommendationCopy}>
                  <Text style={[styles.recommendationEyebrow, { color: item.color }]}>{item.eyebrow}</Text>
                  <Text style={styles.recommendationTitle}>{item.title}</Text>
                  <Text style={styles.recommendationDescription}>{item.description}</Text>
                  <Text style={[styles.recommendationAction, { color: item.color }]}>{item.action}  →</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={() => router.push('/meetups')} style={styles.createRow}>
          <View style={styles.createIcon}><Plus size={20} color={colors.school} /></View>
          <View style={styles.createCopy}>
            <Text style={styles.createTitle}>원하는 활동이 없나요?</Text>
            <Text style={styles.createDescription}>내가 직접 모임을 열고 사람을 모을 수 있어요.</Text>
          </View>
          <ChevronRight size={20} color={colors.muted} />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 36 },
  topbar: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.canvas,
  },
  brand: { color: colors.ink, fontSize: 21, fontWeight: '900' },
  school: { marginTop: 2, color: colors.muted, fontSize: 11, fontWeight: '700' },
  iconButton: {
    width: layout.minimumTouchTarget,
    height: layout.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.round,
    backgroundColor: colors.surface,
  },
  notificationDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.action,
  },
  hero: { height: 390, justifyContent: 'flex-end', overflow: 'hidden' },
  heroContent: { padding: spacing.lg, paddingTop: 100 },
  heroSignal: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heroSignalText: { color: '#F3B95F', fontSize: 12, fontWeight: '900' },
  heroTitle: { marginTop: 10, color: colors.surface, fontSize: 27, lineHeight: 34, fontWeight: '900' },
  heroDescription: { marginTop: 9, color: 'rgba(255,255,255,0.76)', fontSize: 13, lineHeight: 20, fontWeight: '600' },
  heroButton: {
    minHeight: 52,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: radii.card,
    backgroundColor: colors.action,
  },
  heroButtonText: { color: colors.surface, fontSize: 16, fontWeight: '900' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  body: { backgroundColor: colors.canvas, paddingBottom: spacing.sm },
  sectionHeader: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  sectionEyebrow: { color: colors.school, fontSize: 11, fontWeight: '900' },
  sectionTitle: { marginTop: 4, color: colors.ink, fontSize: 21, fontWeight: '900' },
  sectionHint: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  recommendationList: { marginTop: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.sm },
  recommendation: {
    minHeight: 154,
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  recommendationIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.card,
  },
  recommendationCopy: { flex: 1 },
  recommendationEyebrow: { fontSize: 11, fontWeight: '900' },
  recommendationTitle: { marginTop: 4, color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  recommendationDescription: { marginTop: 6, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  recommendationAction: { marginTop: 10, fontSize: 12, fontWeight: '900' },
  createRow: {
    minHeight: 76,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.lg,
  },
  createIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.round,
    backgroundColor: colors.surfaceMuted,
  },
  createCopy: { flex: 1 },
  createTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  createDescription: { marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: '600' },
});
