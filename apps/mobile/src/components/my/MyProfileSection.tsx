import { Camera, ChevronRight, Heart, UserRound } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radii, spacing } from '../../theme/tokens';

export type MyProfileSectionProps = {
  photoCount: number | null;
  appearanceStatusLabel: string | null;
  onBasic: () => void;
  onPhotos: () => void;
  onWorldcup: () => void;
};

export function MyProfileSection({ photoCount, appearanceStatusLabel, onBasic, onPhotos, onWorldcup }: MyProfileSectionProps) {
  const photoDescription = photoCount !== null ? `현재 ${photoCount}장 등록됨` : '사진 등록 상태를 확인해요';

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>내 프로필</Text>
      <View style={styles.card}>
        <ProfileAction description="학교와 기본 정보를 확인해요" icon={<UserRound color={colors.school} size={19} />} label="기본정보" onPress={onBasic} />
        <ProfileAction description={photoDescription} icon={<Camera color={colors.school} size={19} />} label="프로필 사진" onPress={onPhotos} />
        <ProfileAction description={appearanceStatusLabel ?? '이상형 선택 결과를 확인해요'} icon={<Heart color={colors.school} size={19} />} label="이상형 월드컵" onPress={onWorldcup} />
      </View>
    </View>
  );
}

function ProfileAction({ description, icon, label, onPress }: { description: string; icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      {icon}
      <View style={styles.copy}>
        <Text style={styles.actionLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.description}>{description}</Text>
      </View>
      <ChevronRight color={colors.muted} size={17} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  card: { overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface },
  action: { minHeight: layout.minimumTouchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  actionLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  description: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  pressed: { backgroundColor: colors.surfaceMuted },
});
