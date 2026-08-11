import { useRouter } from 'expo-router';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { getQuantumApiClient } from '../../src/api/quantum';
import type { MobileSurveyAnswers, MobileSurveyContract } from '../../src/api/client';
import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import { colors, radii, spacing } from '../../src/theme/tokens';

const scaleLabels = ['전혀 아니야', '별로 아니야', '보통이야', '그런 편이야', '완전 그래'] as const;

export default function SurveyRoute() {
  return <SurveyScreen />;
}

export function SurveyScreen({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const [contract, setContract] = useState<MobileSurveyContract | null>(preview ? previewContract : null);
  const [traitIndex, setTraitIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<MobileSurveyAnswers>>({});
  const [loading, setLoading] = useState(!preview);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (preview) return;
    let active = true;
    void getQuantumApiClient().getProfileSurvey().then((value) => {
      if (active) setContract(value);
    }).catch(() => {
      if (active) setMessage('설문을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [preview]);

  const trait = contract?.traits[traitIndex] ?? null;
  const current = trait ? answers[trait.key] ?? [0, 0] : [0, 0];
  const completeCount = useMemo(() => contract?.traits.filter((item) => {
    const value = answers[item.key];
    return value?.every((answer) => answer >= 1 && answer <= 5);
  }).length ?? 0, [answers, contract]);

  function setAnswer(questionIndex: number, value: number) {
    if (!trait) return;
    const next: [number, number] = [...current] as [number, number];
    next[questionIndex] = value;
    setAnswers((previous) => ({ ...previous, [trait.key]: next }));
    setMessage(null);
  }

  async function next() {
    if (!trait || current.some((value) => value < 1 || value > 5)) {
      setMessage('두 질문에 모두 답해 주세요.');
      return;
    }
    if (!contract || traitIndex < contract.traits.length - 1) {
      setTraitIndex((value) => value + 1);
      return;
    }
    const complete = contract.traits.every((item) => answers[item.key]?.every((value) => value >= 1 && value <= 5));
    if (!complete) {
      setMessage('아직 답하지 않은 항목이 있어요.');
      return;
    }
    if (preview) {
      setMessage('미리보기에서는 저장하지 않아요. 실제 앱에서는 다음 단계로 이어져요.');
      return;
    }
    setSaving(true);
    try {
      await getQuantumApiClient().saveProfileSurvey(contract.version, answers as MobileSurveyAnswers);
      router.replace('/profile/photos');
    } catch {
      setMessage('설문을 저장하지 못했어요. 답변은 그대로 두었으니 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator color={colors.school} /></View>;
  if (!contract || !trait) {
    return <Screen contentStyle={styles.content}><PageHeader title="설문을 열지 못했어요" description={message ?? '잠시 후 다시 시도해 주세요.'} /></Screen>;
  }

  const isLast = traitIndex === contract.traits.length - 1;
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable accessibilityLabel="뒤로" onPress={() => traitIndex > 0 ? setTraitIndex((value) => value - 1) : router.back()} style={styles.iconButton}>
          <ArrowLeft size={21} color={colors.ink} />
        </Pressable>
        <Text style={styles.progress}>{completeCount} / {contract.traits.length}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((traitIndex + 1) / contract.traits.length) * 100}%` }]} />
      </View>
      <PageHeader eyebrow="QUANTUM FIT" title={`${trait.label}을 알려주세요`} description="정답은 없어요. 지금의 나와 가장 가까운 답을 고르면 돼요." />

      <View style={styles.questions}>
        {trait.questions.map((question, questionIndex) => (
          <View key={question} style={styles.questionBlock}>
            <Text style={styles.question}>{question}</Text>
            <View style={styles.scaleRow}>
              {scaleLabels.map((label, index) => {
                const value = index + 1;
                const selected = current[questionIndex] === value;
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${question} ${label}`}
                    onPress={() => setAnswer(questionIndex, value)}
                    style={[styles.scaleButton, selected && styles.scaleButtonSelected]}
                  >
                    <Text style={[styles.scaleNumber, selected && styles.scaleNumberSelected]}>{value}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.scaleEnds}><Text style={styles.scaleHint}>전혀 아니야</Text><Text style={styles.scaleHint}>완전 그래</Text></View>
          </View>
        ))}
        {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
      </View>

      <Pressable disabled={saving} onPress={() => void next()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
        {isLast ? <Check size={19} color={colors.surface} /> : <ChevronRight size={19} color={colors.surface} />}
        <Text style={styles.primaryText}>{saving ? '저장 중' : isLast ? '설문 완료' : '다음 성향'}</Text>
      </Pressable>
    </Screen>
  );
}

const previewContract: MobileSurveyContract = {
  version: 'big5-short-v1',
  traits: [
    { key: 'openness', label: '개방성', questions: ['새로운 취미나 경험을 즐겨 찾는 편이야?', '창의적이거나 예술적인 것에 관심이 많아?'] },
    { key: 'conscientiousness', label: '성실성', questions: ['계획을 세우고 체계적으로 일하는 편이야?', '맡은 일은 끝까지 마무리하고 마는 편이야?'] },
    { key: 'extraversion', label: '외향성', questions: ['사람들과 어울릴 때 에너지가 충전되는 편이야?', '모임에서 먼저 말 걸고 분위기 만드는 편이야?'] },
    { key: 'agreeableness', label: '친화성', questions: ['다른 사람 감정에 잘 공감하는 편이야?', '갈등보다는 타협과 배려를 선호해?'] },
    { key: 'neuroticism', label: '감수성', questions: ['스트레스나 걱정을 자주 느끼는 편이야?', '감정 기복이 있거나 예민한 편이야?'] },
  ],
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  topRow: { minHeight: 48, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  progress: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 4, marginHorizontal: spacing.lg, marginBottom: spacing.xl, backgroundColor: colors.line },
  progressFill: { height: 4, backgroundColor: colors.safety },
  questions: { marginTop: spacing.xl, paddingHorizontal: spacing.lg, gap: spacing.xl },
  questionBlock: { gap: spacing.md, paddingBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.line },
  question: { color: colors.ink, fontSize: 16, lineHeight: 24, fontWeight: '900' },
  scaleRow: { flexDirection: 'row', gap: spacing.sm },
  scaleButton: { flex: 1, aspectRatio: 1, maxHeight: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radii.round, backgroundColor: colors.surface },
  scaleButtonSelected: { borderColor: colors.safety, backgroundColor: colors.safety },
  scaleNumber: { color: colors.body, fontSize: 14, fontWeight: '900' },
  scaleNumberSelected: { color: colors.surface },
  scaleEnds: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleHint: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  message: { color: colors.action, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  primaryButton: { minHeight: 54, marginHorizontal: spacing.lg, marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.control, backgroundColor: colors.school },
  primaryText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  pressed: { opacity: 0.75 },
});
