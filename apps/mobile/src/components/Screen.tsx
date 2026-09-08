import type { PropsWithChildren, ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout } from '../theme/tokens';

type ScreenProps = PropsWithChildren<{
  backgroundColor?: string;
  before?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle'>;
}>;

export function Screen({
  children,
  backgroundColor = colors.canvas,
  before,
  contentStyle,
  scrollProps,
}: ScreenProps) {
  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor }]}>
      {before}
      <ScrollView
        {...scrollProps}
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentStyle]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 32 },
  inner: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
});
