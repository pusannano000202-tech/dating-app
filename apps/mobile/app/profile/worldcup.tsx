import { useRouter } from 'expo-router';
import { ArrowLeft, Check, RotateCcw } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { getQuantumApiClient } from '../../src/api/quantum';
import type { MobileWorldcupContract } from '../../src/api/client';
import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import { colors, radii, spacing } from '../../src/theme/tokens';

type Candidate = MobileWorldcupContract['candidates'][number];

export default function WorldcupRoute() {
  return <WorldcupScreen />;
}

export function WorldcupScreen({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const [contract, setContract] = useState<MobileWorldcupContract | null>(preview ? createPreviewContract() : null);
  const [round, setRound] = useState<Candidate[]>(preview ? createPreviewContract().candidates : []);
  const [pairIndex, setPairIndex] = useState(0);
  const [nextRound, setNextRound] = useState<Candidate[]>([]);
  const [winnerIds, setWinnerIds] = useState<string[]>([]);
  const [finalWinner, setFinalWinner] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(!preview);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (preview) return;
    let active = true;
    void getQuantumApiClient().getProfileWorldcup().then((value) => {
      if (!active) return;
      setContract(value);
      setRound(value.candidates);
    }).catch(() => {
      if (active) setMessage('월드컵 사진을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [preview]);

  const pair = useMemo(() => [round[pairIndex], round[pairIndex + 1]] as const, [pairIndex, round]);
  const progress = Math.round((winnerIds.length / 63) * 100);

  async function choose(winner: Candidate) {
    if (saving || finalWinner || !contract) return;
    const allWinnerIds = [...winnerIds, winner.id];
    const advanced = [...nextRound, winner];
    setWinnerIds(allWinnerIds);

    if (pairIndex + 2 < round.length) {
      setNextRound(advanced);
      setPairIndex((value) => value + 2);
      return;
    }
    if (round.length > 2) {
      setRound(advanced);
      setNextRound([]);
      setPairIndex(0);
      return;
    }

    setFinalWinner(winner);
    if (preview) {
      setMessage('미리보기 선택이 끝났어요. 실제 앱에서는 이 결과를 비공개로 저장해요.');
      return;
    }
    setSaving(true);
    try {
      await getQuantumApiClient().saveProfileWorldcup(contract.version, allWinnerIds);
      router.replace('/profile/survey');
    } catch {
      setMessage('선택 결과를 저장하지 못했어요. 다시 저장해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  function restartPreview() {
    const next = createPreviewContract();
    setContract(next);
    setRound(next.candidates);
    setPairIndex(0);
    setNextRound([]);
    setWinnerIds([]);
    setFinalWinner(null);
    setMessage(null);
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator color={colors.school} /></View>;
  if (!contract || !pair[0] || !pair[1]) {
    return (
      <Screen contentStyle={styles.content}>
        <PageHeader title="월드컵을 열지 못했어요" description={message ?? '잠시 후 다시 시도해 주세요.'} />
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.iconButton}>
          <ArrowLeft size={21} color={colors.ink} />
        </Pressable>
        <Text style={styles.progressText}>{winnerIds.length} / 63</Text>
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
      <PageHeader eyebrow="IDEAL MATCH" title="더 끌리는 한 명을 골라주세요" description="정답은 없어요. 선택은 매칭 취향에만 비공개로 사용돼요." />

      <View style={styles.stage}>
        {pair.map((candidate, index) => (
          <Pressable
            key={candidate.id}
            accessibilityRole="button"
            accessibilityLabel={`${index === 0 ? '왼쪽' : '오른쪽'} 후보 선택`}
            disabled={saving || Boolean(finalWinner)}
            onPress={() => void choose(candidate)}
            style={({ pressed }) => [styles.candidate, pressed && styles.candidatePressed]}
          >
            <Image source={{ uri: candidate.imageUrl }} resizeMode="cover" style={styles.candidateImage} />
            <View style={styles.chooseBand}><Text style={styles.chooseText}>이 사람이 더 좋아요</Text></View>
          </Pressable>
        ))}
      </View>

      <View style={styles.roundBand}>
        <Text style={styles.roundLabel}>{roundLabel(round.length)}</Text>
        <Text style={styles.roundDescription}>사진 자체보다 전체적인 인상을 보고 선택해 주세요.</Text>
      </View>
      {saving ? <View style={styles.saving}><ActivityIndicator color={colors.school} /><Text style={styles.savingText}>취향을 안전하게 저장하는 중</Text></View> : null}
      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
      {preview && finalWinner ? (
        <Pressable onPress={restartPreview} style={styles.restartButton}>
          <RotateCcw size={18} color={colors.school} />
          <Text style={styles.restartText}>미리보기 다시 시작</Text>
        </Pressable>
      ) : null}
      {finalWinner && !preview && !saving ? (
        <View style={styles.doneBand}><Check size={18} color={colors.safety} /><Text style={styles.doneText}>선택이 완료됐어요.</Text></View>
      ) : null}
    </Screen>
  );
}

function roundLabel(count: number) {
  return count === 2 ? '결승' : `${count}강`;
}

function createPreviewContract(): MobileWorldcupContract {
  return {
    version: 'appearance-worldcup-mobile-v1',
    candidateGender: 'female',
    candidates: Array.from({ length: 64 }, (_, index) => ({
      id: `preview-${index + 1}`,
      imageUrl: `http://localhost:3007/appearance-ideal/female-64/${previewFiles[index % previewFiles.length]}`,
    })),
  };
}

const previewFiles = ['NEW_FI02.jpg', 'NEW_FI03.jpg', 'NEW_FI04.jpg', 'NEW_FI05.jpg'];

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  topRow: { minHeight: 48, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  progressText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 4, marginHorizontal: spacing.lg, marginBottom: spacing.xl, backgroundColor: colors.line },
  progressFill: { height: 4, backgroundColor: colors.action },
  stage: { marginTop: spacing.xl, paddingHorizontal: spacing.lg, flexDirection: 'row', gap: spacing.sm },
  candidate: { flex: 1, minWidth: 0, aspectRatio: 0.66, overflow: 'hidden', borderRadius: radii.card, backgroundColor: colors.surfaceMuted },
  candidatePressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  candidateImage: { width: '100%', height: '100%' },
  chooseBand: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,24,32,0.78)', paddingHorizontal: spacing.sm },
  chooseText: { color: colors.surface, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  roundBand: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  roundLabel: { color: colors.action, fontSize: 13, fontWeight: '900' },
  roundDescription: { marginTop: 4, color: colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  saving: { minHeight: 52, marginHorizontal: spacing.lg, marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  savingText: { color: colors.body, fontSize: 13, fontWeight: '800' },
  message: { marginHorizontal: spacing.lg, marginTop: spacing.lg, color: colors.action, fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  restartButton: { minHeight: 52, marginHorizontal: spacing.lg, marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.school, borderRadius: radii.control, backgroundColor: colors.surface },
  restartText: { color: colors.school, fontSize: 14, fontWeight: '900' },
  doneBand: { minHeight: 52, marginHorizontal: spacing.lg, marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  doneText: { color: colors.safety, fontSize: 14, fontWeight: '900' },
});
