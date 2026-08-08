import { ChevronRight, HeartHandshake, MessageSquareText, Send, Star, Utensils } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import { colors, radii, spacing } from '../../src/theme/tokens';

const destinations = [
  { id: 'feedback', title: '개발자에게 피드백', description: '불편한 점과 원하는 기능을 가장 빠르게 전달해요.', icon: Send, color: colors.school },
  { id: 'review', title: '만남 리뷰', description: '실제로 만난 뒤 느낀 점과 안전 경험을 남겨요.', icon: Star, color: colors.warning },
  { id: 'advice', title: '연애 상담·코치', description: '혼자 고민하던 관계 이야기를 안전하게 나눠요.', icon: HeartHandshake, color: colors.action },
  { id: 'campus-eats', title: '우리 학교 맛집', description: '돈까스와 커피부터 학교 생활권 맛집을 골라요.', icon: Utensils, color: colors.safety },
] as const;

export default function CommunityScreen() {
  return (
    <Screen contentStyle={styles.content}>
      <PageHeader
        eyebrow="QUANTUM COMMUNITY"
        title="만난 뒤에도 이어지는 이야기"
        description="활동을 찾고, 만남을 돌아보고, Quantum에 직접 의견을 전할 수 있어요."
      />

      <View style={styles.list}>
        {destinations.map((item) => {
          const Icon = item.icon;
          return (
            <Pressable key={item.id} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={[styles.icon, { backgroundColor: `${item.color}15` }]}>
                <Icon size={22} color={item.color} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.description}>{item.description}</Text>
              </View>
              <ChevronRight size={20} color={colors.muted} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.feedbackBand}>
        <MessageSquareText size={22} color={colors.school} />
        <View style={styles.feedbackCopy}>
          <Text style={styles.feedbackTitle}>앱이 대신 움직이지 못한 순간이 있었나요?</Text>
          <Text style={styles.feedbackDescription}>어디서 막혔는지 알려주면 다음 업데이트의 첫 번째 후보가 됩니다.</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg },
  list: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  row: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.md,
  },
  pressed: { opacity: 0.72 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.card },
  copy: { flex: 1 },
  title: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  description: { marginTop: 4, color: colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  feedbackBand: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
  },
  feedbackCopy: { flex: 1 },
  feedbackTitle: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '900' },
  feedbackDescription: { marginTop: 5, color: colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '600' },
});
