import { Camera, ChevronRight, LockKeyhole, LogOut, Settings, ShieldCheck, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../src/auth/context';
import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import { colors, radii, spacing } from '../../src/theme/tokens';

const profileRows = [
  { title: '기본정보', description: '닉네임, 학교, 참여 방식', icon: UserRound },
  { title: '프로필 사진', description: '최대 3장 · 분석은 매칭 찾기 때만', icon: Camera },
  { title: '안전과 공개 범위', description: '가명, 차단, 친구 삭제 관리', icon: ShieldCheck },
  { title: '앱 설정', description: '알림과 접근 권한', icon: Settings },
] as const;

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSignOut() {
    setMessage(null);
    try {
      await signOut();
    } catch {
      setMessage('로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }

  if (!session) return null;

  return (
    <Screen contentStyle={styles.content}>
      <PageHeader
        eyebrow="MY QUANTUM"
        title="내 정보와 안전 설정"
        description="웹과 모바일에서 같은 Quantum 계정과 참여 정보를 사용합니다."
      />

      <View style={styles.accountBand}>
        <View style={styles.avatar}><LockKeyhole size={24} color={colors.school} /></View>
        <View style={styles.accountCopy}>
          <Text style={styles.accountTitle}>Quantum 계정 연결됨</Text>
          <Text style={styles.accountDescription}>{session.user.email ?? '소셜 로그인 계정'}</Text>
        </View>
      </View>

      <Pressable onPress={() => void handleSignOut()} style={styles.loginButton}>
        <LogOut size={19} color={colors.surface} />
        <Text style={styles.loginButtonText}>로그아웃</Text>
      </Pressable>
      {message && <Text style={styles.errorText} role="alert">{message}</Text>}

      <View style={styles.rows}>
        {profileRows.map((item) => {
          const Icon = item.icon;
          return (
            <Pressable key={item.title} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Icon size={20} color={colors.body} />
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowDescription}>{item.description}</Text>
              </View>
              <ChevronRight size={19} color={colors.muted} />
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.privacyNote}>외모 점수와 내부 매칭 정보는 다른 사용자에게 공개하지 않습니다.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg },
  accountBand: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
  },
  avatar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.surface },
  accountCopy: { flex: 1 },
  accountTitle: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '900' },
  accountDescription: { marginTop: 4, color: colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  loginButton: {
    minHeight: 52,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radii.card,
    backgroundColor: colors.school,
  },
  loginButtonText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  errorText: { marginHorizontal: spacing.lg, marginTop: spacing.sm, color: colors.action, fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  rows: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  pressed: { opacity: 0.7 },
  rowCopy: { flex: 1 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  rowDescription: { marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: '600' },
  privacyNote: { margin: spacing.lg, color: colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
});
