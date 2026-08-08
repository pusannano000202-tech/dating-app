import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme/tokens';

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'light' | 'dark';
};

export function PageHeader({ eyebrow, title, description, action, tone = 'light' }: PageHeaderProps) {
  const dark = tone === 'dark';
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={[styles.eyebrow, dark && styles.eyebrowDark]}>{eyebrow}</Text> : null}
        <Text style={[styles.title, dark && styles.titleDark]}>{title}</Text>
        {description ? <Text style={[styles.description, dark && styles.descriptionDark]}>{description}</Text> : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  copy: { flex: 1 },
  eyebrow: { color: colors.school, fontSize: 12, fontWeight: '800' },
  eyebrowDark: { color: '#F3B95F' },
  title: {
    marginTop: 4,
    color: colors.ink,
    fontSize: typography.title,
    lineHeight: 34,
    fontWeight: '900',
  },
  titleDark: { color: colors.nightText },
  description: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  descriptionDark: { color: 'rgba(249,251,250,0.68)' },
});
