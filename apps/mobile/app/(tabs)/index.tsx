import { useRouter } from 'expo-router';
import {
  ChevronRight,
  MessageCircleMore,
  MoonStar,
  UtensilsCrossed,
  UsersRound,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getQuantumApiClient } from '../../src/api/quantum';
import { Screen } from '../../src/components/Screen';
import {
  buildHomeRecommendationWave,
  type HomeRecommendationId,
} from '../../src/domain/home-recommendations';
import { colors, layout, radii, spacing } from '../../src/theme/tokens';

const iconByRecommendation = {
  tonight: MoonStar,
  meetup: UsersRound,
  'campus-eats': UtensilsCrossed,
  feedback: MessageCircleMore,
} as const;

const colorByRecommendation: Record<HomeRecommendationId, string> = {
  tonight: colors.action,
  meetup: colors.safety,
  'campus-eats': colors.warning,
  feedback: colors.school,
};

export default function HomeScreen() {
  const router = useRouter();
  const [wave, setWave] = useState(() => buildHomeRecommendationWave(null));

  useEffect(() => {
    let isActive = true;

    async function loadRecommendation() {
      try {
        const catalog = await getQuantumApiClient().listEvents();
        if (isActive) setWave(buildHomeRecommendationWave(catalog));
      } catch {
        if (isActive) setWave(buildHomeRecommendationWave(null));
      }
    }

    void loadRecommendation();
    return () => {
      isActive = false;
    };
  }, []);

  const PrimaryIcon = iconByRecommendation[wave.primary.id];

  return (
    <Screen
      contentStyle={styles.content}
      before={(
        <View style={styles.topbar}>
          <Text style={styles.brand}>Quantum</Text>
          <Text style={styles.school}>부산대학교 · 오늘</Text>
        </View>
      )}
    >
      <View style={styles.primaryBand}>
        <View style={styles.primarySignal}>
          <View style={styles.primaryIcon}>
            <PrimaryIcon size={22} color="#F3B95F" />
          </View>
          <Text style={styles.primaryEyebrow}>{wave.primary.eyebrow}</Text>
        </View>

        <View style={styles.primaryCopy}>
          <Text style={styles.primaryTitle}>{wave.primary.title}</Text>
          <Text style={styles.primaryDescription}>{wave.primary.description}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`추천: ${wave.primary.title}`}
          onPress={() => router.push(wave.primary.href)}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>{wave.primary.action}</Text>
          <ChevronRight size={20} color={colors.surface} />
        </Pressable>
      </View>

      <View style={styles.nextSection}>
        <Text style={styles.nextTitle}>다음 선택</Text>
        <View style={styles.nextList}>
          {wave.secondary.map((item) => {
            const Icon = iconByRecommendation[item.id];
            const color = colorByRecommendation[item.id];

            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${item.action}`}
                onPress={() => router.push(item.href)}
                style={({ pressed }) => [styles.nextRow, pressed && styles.rowPressed]}
              >
                <View style={[styles.nextIcon, { backgroundColor: `${color}12` }]}>
                  <Icon size={20} color={color} />
                </View>
                <View style={styles.nextCopy}>
                  <Text style={[styles.nextEyebrow, { color }]}>{item.eyebrow}</Text>
                  <Text style={styles.nextItemTitle}>{item.title}</Text>
                  <Text style={styles.nextDescription}>{item.description}</Text>
                </View>
                <ChevronRight size={20} color={colors.muted} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  topbar: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    minHeight: 72,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.canvas,
  },
  brand: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  school: { marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: '700' },
  primaryBand: {
    minHeight: 318,
    justifyContent: 'flex-end',
    backgroundColor: colors.night,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  primarySignal: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  primaryIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.round,
    backgroundColor: colors.nightSurface,
  },
  primaryEyebrow: { color: '#F3B95F', fontSize: 12, fontWeight: '900' },
  primaryCopy: { minWidth: 0, marginTop: spacing.lg },
  primaryTitle: {
    color: colors.nightText,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '900',
    flexShrink: 1,
  },
  primaryDescription: {
    marginTop: spacing.sm,
    color: 'rgba(249,251,250,0.72)',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    flexShrink: 1,
  },
  primaryButton: {
    minHeight: 52,
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.control,
    backgroundColor: colors.action,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  nextSection: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  nextTitle: { color: colors.ink, fontSize: 19, fontWeight: '900' },
  nextList: { marginTop: spacing.sm },
  nextRow: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.md,
  },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  nextIcon: {
    width: layout.minimumTouchTarget,
    height: layout.minimumTouchTarget,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.control,
  },
  nextCopy: { flex: 1, minWidth: 0 },
  nextEyebrow: { fontSize: 10, fontWeight: '900' },
  nextItemTitle: {
    marginTop: 3,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    flexShrink: 1,
  },
  nextDescription: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
});
