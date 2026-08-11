import { router } from 'expo-router';
import { LogIn, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../src/auth/context';
import type { QuantumOAuthProvider } from '../src/auth/oauth';
import { colors, radii, spacing } from '../src/theme/tokens';

export default function LoginScreen() {
  const { signIn, configError } = useAuth();
  const [activeProvider, setActiveProvider] = useState<QuantumOAuthProvider | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSignIn(provider: QuantumOAuthProvider) {
    setActiveProvider(provider);
    setMessage(null);
    try {
      const completed = await signIn(provider);
      if (completed) router.replace('/');
      else setMessage('로그인이 취소됐어요. 다시 눌러 진행할 수 있어요.');
    } catch {
      setMessage(`${provider === 'google' ? 'Google' : '카카오'} 로그인을 완료하지 못했어요.`);
    } finally {
      setActiveProvider(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.hero}>
        <Text style={styles.brand}>QUANTUM</Text>
        <Text style={styles.title}>오늘의 만남을{`\n`}한 번에 시작해요</Text>
        <Text style={styles.description}>웹에서 사용하던 계정과 같은 계정으로 연결됩니다.</Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.safetyRow}>
          <ShieldCheck size={19} color={colors.safety} />
          <Text style={styles.safetyText}>로그인 정보는 Supabase 보안 저장소에 보관해요.</Text>
        </View>

        <ProviderButton
          label="Google 계정으로 계속하기"
          provider="google"
          loading={activeProvider === 'google'}
          disabled={Boolean(activeProvider) || Boolean(configError)}
          onPress={handleSignIn}
        />
        <ProviderButton
          label="카카오로 계속하기"
          provider="kakao"
          loading={activeProvider === 'kakao'}
          disabled={Boolean(activeProvider) || Boolean(configError)}
          onPress={handleSignIn}
        />

        {(configError || message) && (
          <Text style={styles.error} role="alert">{configError ?? message}</Text>
        )}
        {__DEV__ ? (
          <Pressable onPress={() => router.push('/dev-profile-preview')} style={styles.previewLink}>
            <Text style={styles.previewLinkText}>기본정보 화면 미리보기</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function ProviderButton({
  label,
  provider,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  provider: QuantumOAuthProvider;
  loading: boolean;
  disabled: boolean;
  onPress: (provider: QuantumOAuthProvider) => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onPress(provider)}
      style={({ pressed }) => [
        styles.providerButton,
        provider === 'kakao' && styles.kakaoButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.ink} /> : <LogIn size={19} color={colors.ink} />}
      <Text style={styles.providerText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: spacing.lg },
  hero: { flex: 1, justifyContent: 'flex-end', paddingBottom: spacing.xl },
  brand: { color: colors.school, fontSize: 13, fontWeight: '900' },
  title: { marginTop: 10, color: colors.ink, fontSize: 31, lineHeight: 39, fontWeight: '900' },
  description: { marginTop: spacing.md, color: colors.muted, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  panel: { paddingBottom: spacing.xl * 2 },
  safetyRow: { marginBottom: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 8 },
  safetyText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  providerButton: {
    minHeight: 54,
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  kakaoButton: { borderColor: '#FEE500', backgroundColor: '#FEE500' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
  providerText: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  error: { marginTop: spacing.md, color: colors.action, fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  previewLink: { minHeight: 44, marginTop: spacing.md, alignItems: 'center', justifyContent: 'center' },
  previewLinkText: { color: colors.school, fontSize: 12, fontWeight: '800' },
});
