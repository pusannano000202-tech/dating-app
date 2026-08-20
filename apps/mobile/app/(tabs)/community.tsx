import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowUpRight,
  ChevronRight,
  Clock3,
  HeartHandshake,
  Send,
  Star,
} from 'lucide-react-native';
import { useState } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import { readMobileConfig } from '../../src/config/runtime';
import { colors, radii, spacing } from '../../src/theme/tokens';

const apiOrigin = readMobileConfig(process.env).apiOrigin;
const campusEatsImage = { uri: `${apiOrigin}/campus-eats/preview/cutlet-katsu.webp` };

const featuredDestination = {
  id: 'campus-eats',
  title: '부산대 돈까스 월드컵',
  action: '바로 시작',
  webPath: '/community/campus-eats?mode=battle&category=donkatsu',
} as const;

const boardDestinations = [
  {
    id: 'feedback',
    title: 'Quantum에 제안하기',
    action: '운영자에게 하고 싶은 말',
    webPath: '/community/feedback',
    icon: Send,
    color: colors.school,
  },
  {
    id: 'meeting-reviews',
    title: '만남 후기',
    action: '분위기와 운영 경험 보기',
    webPath: '/community/meetup-review',
    icon: Star,
    color: colors.warning,
  },
  {
    id: 'dating-advice',
    title: '연애 상담',
    action: '익명 고민 나누기',
    webPath: '/community/relationship-advice',
    icon: HeartHandshake,
    color: colors.safety,
  },
] as const;

type CommunityDestination = typeof featuredDestination | (typeof boardDestinations)[number];

export function CommunityScreen() {
  const [openingId, setOpeningId] = useState<CommunityDestination['id'] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function openWebDestination(destination: CommunityDestination) {
    setOpeningId(destination.id);
    setNotice(null);

    try {
      const url = new URL(destination.webPath, `${apiOrigin}/`).toString();
      await WebBrowser.openBrowserAsync(url);
    } catch {
      setNotice('웹 화면을 열지 못했어요. 연결 상태를 확인하고 다시 눌러 주세요.');
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <PageHeader eyebrow="QUANTUM COMMUNITY" title="오늘은 뭐 먹지?" />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="부산대 돈까스 월드컵 시작"
        onPress={() => void openWebDestination(featuredDestination)}
        style={({ pressed }) => [styles.featured, pressed && styles.pressed]}
      >
        <ImageBackground source={campusEatsImage} style={styles.featuredImage} resizeMode="cover">
          <LinearGradient
            colors={['rgba(17,24,32,0.06)', 'rgba(17,24,32,0.92)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.featuredCopy}>
            <Text style={styles.featuredEyebrow}>CAMPUS EATS · 이번 주 한 판</Text>
            <Text style={styles.featuredTitle}>{featuredDestination.title}</Text>
            <View style={styles.featuredAction}>
              <Text style={styles.featuredActionText}>
                {openingId === featuredDestination.id ? '여는 중...' : featuredDestination.action}
              </Text>
              <ArrowUpRight size={18} color={colors.ink} />
            </View>
          </View>
        </ImageBackground>
      </Pressable>

      {notice ? (
        <Text accessibilityLiveRegion="polite" role="alert" style={styles.notice}>{notice}</Text>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>바로 이야기하기</Text>
        <Text style={styles.sectionHint}>웹 커뮤니티</Text>
      </View>

      <View style={styles.list}>
        {boardDestinations.map((item) => {
          const Icon = item.icon;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${item.action}`}
              onPress={() => void openWebDestination(item)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={[styles.icon, { backgroundColor: `${item.color}14` }]}>
                <Icon size={21} color={item.color} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowAction}>
                  {openingId === item.id ? '여는 중...' : item.action}
                </Text>
              </View>
              <ChevronRight size={20} color={colors.muted} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.pendingBand}>
        <Clock3 size={20} color={colors.muted} />
        <View style={styles.pendingCopy}>
          <Text style={styles.pendingTitle}>모바일 안에서 글쓰기</Text>
          <Text style={styles.pendingStatus}>준비 중 · 지금은 연결된 웹 게시판에서 이용할 수 있어요.</Text>
        </View>
      </View>
    </Screen>
  );
}

export default CommunityScreen;

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  featured: {
    height: 252,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    overflow: 'hidden',
    borderRadius: radii.card,
    backgroundColor: colors.night,
  },
  featuredImage: { flex: 1, justifyContent: 'flex-end' },
  featuredCopy: { padding: spacing.lg },
  featuredEyebrow: { color: '#F3B95F', fontSize: 11, fontWeight: '900' },
  featuredTitle: {
    marginTop: 5,
    color: colors.nightText,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  featuredAction: {
    minHeight: 44,
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.control,
    backgroundColor: '#F3B95F',
    paddingHorizontal: spacing.md,
  },
  featuredActionText: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  notice: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    color: colors.action,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
  },
  sectionHeader: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '900' },
  sectionHint: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  list: { marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.md,
  },
  icon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.card,
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  rowAction: { marginTop: 4, color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  pendingBand: {
    minHeight: 72,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.lg,
  },
  pendingCopy: { flex: 1, minWidth: 0 },
  pendingTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  pendingStatus: { marginTop: 4, color: colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '600' },
});
