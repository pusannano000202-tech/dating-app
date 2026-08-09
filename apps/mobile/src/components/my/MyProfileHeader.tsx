import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react-native';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MyProfileProgress } from '../../domain/my-hub';
import { colors, layout, radii, spacing, typography } from '../../theme/tokens';

type MyProfileHeaderLoadState =
  | {
    profileState: 'loading' | 'ready' | 'error';
    loading?: never;
    error?: never;
  }
  | {
    profileState?: never;
    loading: boolean;
    error: boolean;
  };

export type MyProfileHeaderProps = {
  displayName: string | null;
  school: string | null;
  primaryPhotoUrl: string | null;
  progress: MyProfileProgress | null;
  actionLabel: string;
  onAction: () => void;
} & MyProfileHeaderLoadState;

function initials(displayName: string | null) {
  return displayName?.trim().slice(0, 2) || '?';
}

export function MyProfileHeader({
  displayName,
  school,
  primaryPhotoUrl,
  progress,
  actionLabel,
  onAction,
  profileState,
  loading: legacyLoading,
  error: legacyError,
}: MyProfileHeaderProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const resolvedProfileState = profileState ?? (legacyLoading ? 'loading' : legacyError ? 'error' : 'ready');
  const loading = resolvedProfileState === 'loading';
  const error = resolvedProfileState === 'error';

  useEffect(() => {
    setImageFailed(false);
  }, [primaryPhotoUrl]);

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>마이</Text>
      <Text style={styles.title}>내 정보와 만남을 한곳에서 관리해요.</Text>
      <View style={styles.profileRow}>
        {loading ? <Text style={styles.status}>프로필 정보를 불러오는 중</Text>
          : error ? <Text accessibilityRole="alert" style={styles.error}>프로필 정보를 확인하지 못했어요</Text>
          : <>
            {primaryPhotoUrl && !imageFailed ? (
              <Image accessibilityLabel={`${displayName ?? '내'} 프로필 사진`} onError={() => setImageFailed(true)} source={{ uri: primaryPhotoUrl }} style={styles.avatar} resizeMode="cover" />
            ) : (
              <View accessibilityLabel={`${displayName ?? '내'} 이니셜`} style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{initials(displayName)}</Text>
              </View>
            )}
            <View style={styles.profileCopy}>
              <Text numberOfLines={1} style={styles.name}>{displayName ?? '프로필을 시작해 주세요'}</Text>
              <Text numberOfLines={1} style={styles.school}>{school ?? '등록된 학교 정보가 없어요'}</Text>
            </View>
          </>}
      </View>
      <View style={styles.progressBlock}>
        {progress ? (
          <>
            <Text style={styles.progressLabel}>{progress.completed}/{progress.total} 완료</Text>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress.percent }} style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
            </View>
          </>
        ) : <Text style={styles.progressLabel}>{loading ? '프로필 진행 상태를 불러오는 중' : '프로필 진행 상태를 확인하지 못했어요'}</Text>}
      </View>
      <Pressable
        accessibilityLabel={loading ? '프로필 불러오는 중' : error ? '프로필 다시 확인' : actionLabel}
        accessibilityRole="button"
        accessibilityState={{ busy: loading, disabled: loading }}
        disabled={loading}
        onPress={onAction}
        style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed, loading && styles.disabled]}
      >
        {loading ? <ActivityIndicator color={colors.surface} /> : <><Text style={styles.primaryActionText}>{error ? '다시 확인' : actionLabel}</Text><ChevronRight color={colors.surface} size={18} /></>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface },
  eyebrow: { color: colors.school, fontSize: typography.caption, fontWeight: '800' },
  title: { marginTop: spacing.xs, color: colors.ink, fontSize: typography.section, lineHeight: 27, fontWeight: '800' },
  profileRow: { marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 72, height: 72, borderRadius: radii.round, backgroundColor: colors.surfaceMuted },
  avatarFallback: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: radii.round, backgroundColor: colors.surfaceMuted },
  avatarInitial: { color: colors.body, fontSize: 22, fontWeight: '800' },
  profileCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  status: { flex: 1, color: colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  name: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  school: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  error: { color: colors.body, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  progressBlock: { marginTop: spacing.lg, gap: spacing.sm },
  progressLabel: { color: colors.body, fontSize: 13, fontWeight: '700' },
  progressTrack: { height: 8, overflow: 'hidden', borderRadius: radii.round, backgroundColor: colors.surfaceMuted },
  progressFill: { height: '100%', borderRadius: radii.round, backgroundColor: colors.safety },
  primaryAction: { minHeight: layout.minimumTouchTarget, marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radii.card, backgroundColor: colors.school, paddingHorizontal: spacing.md },
  primaryActionText: { color: colors.surface, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.86 },
  disabled: { opacity: 0.62 },
});
