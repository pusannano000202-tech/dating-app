import { ChevronRight, Images } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MobileAlbumMatch } from '../../api/meeting-album';
import { colors, radii, spacing } from '../../theme/tokens';

export function MyMeetingAlbumSection({
  latestMatch,
  state,
  onOpen,
}: {
  latestMatch: MobileAlbumMatch | null;
  state: 'loading' | 'ready' | 'error';
  onOpen: () => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>만남 사진첩</Text>
      <Pressable
        accessibilityRole="button"
        disabled={!latestMatch}
        onPress={onOpen}
        style={({ pressed }) => [styles.card, pressed && styles.pressed, !latestMatch && styles.disabled]}
      >
        <View style={styles.icon}><Images size={22} color={colors.school} /></View>
        <View style={styles.copy}>
          <Text style={styles.title}>{latestMatch ? '함께 남긴 사진 보기' : state === 'loading' ? '만남을 확인하는 중' : '아직 열린 사진첩이 없어요'}</Text>
          <Text numberOfLines={1} style={styles.description}>
            {latestMatch?.venueName ?? '확정된 만남 뒤 참가자끼리 사진을 모아봐요'}
          </Text>
        </View>
        {latestMatch ? <ChevronRight size={19} color={colors.muted} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  card: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface, padding: spacing.md },
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.card, backgroundColor: colors.surfaceMuted },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  description: { marginTop: 4, color: colors.muted, fontSize: 12, fontWeight: '600' },
  pressed: { backgroundColor: colors.surfaceMuted },
  disabled: { opacity: 0.68 },
});
