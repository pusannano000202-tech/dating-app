import { Check, ChevronDown, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getDepartmentCatalog, type MobileDepartment } from '../api/departments';
import { colors, radii, spacing } from '../theme/tokens';

export function DepartmentSelect({
  schoolId,
  value,
  onChange,
}: {
  schoolId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [departments, setDepartments] = useState<MobileDepartment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
  const filtered = useMemo(() => departments.filter((department) => (
    !normalizedQuery
    || `${department.name} ${department.college}`.toLocaleLowerCase('ko-KR').includes(normalizedQuery)
  )), [departments, normalizedQuery]);
  const exactMatch = departments.some((department) => department.name === query.trim());

  async function openPicker() {
    setOpen(true);
    if (departments.length > 0 || loading) return;
    setLoading(true);
    setError(false);
    try {
      setDepartments(await getDepartmentCatalog(schoolId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function choose(nextValue: string) {
    onChange(nextValue);
    setQuery('');
    setOpen(false);
  }

  return (
    <>
      <Text style={styles.label}>학과 (선택)</Text>
      <Pressable
        accessibilityRole="combobox"
        accessibilityLabel="학과 선택"
        accessibilityState={{ expanded: open }}
        onPress={() => void openPicker()}
        style={styles.trigger}
      >
        <View style={styles.triggerCopy}>
          <Text style={[styles.triggerValue, !value && styles.placeholder]} numberOfLines={1}>
            {value || '학과를 눌러 선택하세요'}
          </Text>
          <Text style={styles.triggerHint}>검색하거나 목록을 위아래로 내려볼 수 있어요</Text>
        </View>
        <ChevronDown size={19} color={colors.muted} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.overlay}>
          <Pressable accessibilityLabel="학과 선택 닫기" onPress={() => setOpen(false)} style={styles.backdrop} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleCopy}>
                <Text style={styles.sheetTitle}>학과 선택</Text>
                <Text style={styles.sheetDescription}>부산대학교 학과를 검색하거나 내려서 골라주세요.</Text>
              </View>
              <Pressable accessibilityLabel="닫기" onPress={() => setOpen(false)} style={styles.iconButton}>
                <X size={21} color={colors.ink} />
              </Pressable>
            </View>
            <View style={styles.searchBox}>
              <Search size={17} color={colors.muted} />
              <TextInput
                accessibilityLabel="학과 검색"
                value={query}
                onChangeText={setQuery}
                placeholder="학과명 또는 단과대명 검색"
                placeholderTextColor={colors.muted}
                autoFocus
                style={styles.searchInput}
              />
            </View>

            {loading ? <View style={styles.state}><ActivityIndicator color={colors.school} /><Text style={styles.stateText}>학과 목록을 불러오고 있어요.</Text></View> : null}
            {error ? (
              <View style={styles.state}>
                <Text style={styles.stateText}>목록을 불러오지 못했어요.</Text>
                <Pressable onPress={() => { setDepartments([]); void openPicker(); }} style={styles.retryButton}><Text style={styles.retryText}>다시 시도</Text></Pressable>
              </View>
            ) : null}
            {!loading && !error ? (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.name}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <Pressable accessibilityRole="button" accessibilityState={{ selected: item.name === value }} onPress={() => choose(item.name)} style={styles.option}>
                    <View style={styles.optionCopy}><Text style={styles.optionName}>{item.name}</Text><Text style={styles.optionCollege}>{item.college}</Text></View>
                    {item.name === value ? <Check size={18} color={colors.school} /> : null}
                  </Pressable>
                )}
                ListHeaderComponent={value ? <Pressable onPress={() => choose('')} style={styles.clearOption}><Text style={styles.clearText}>학과 선택 안 함</Text></Pressable> : null}
                ListEmptyComponent={!query.trim() ? <Text style={styles.emptyText}>표시할 학과가 없어요.</Text> : null}
                ListFooterComponent={query.trim().length >= 2 && !exactMatch ? <Pressable onPress={() => choose(query.trim())} style={styles.customOption}><Text style={styles.customText}>“{query.trim()}” 직접 입력</Text></Pressable> : null}
              />
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  trigger: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  triggerCopy: { flex: 1, minWidth: 0, paddingVertical: spacing.sm },
  triggerValue: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  placeholder: { color: colors.muted },
  triggerHint: { marginTop: 3, color: colors.muted, fontSize: 10, fontWeight: '700' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,32,0.48)' },
  backdrop: { flex: 1 },
  sheet: { height: '78%', borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card, backgroundColor: colors.canvas, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  sheetHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  sheetTitleCopy: { flex: 1, minWidth: 0 },
  sheetTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  sheetDescription: { marginTop: spacing.xs, color: colors.body, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchBox: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 15, fontWeight: '700' },
  listContent: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  option: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: spacing.sm },
  optionCopy: { flex: 1, minWidth: 0 },
  optionName: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  optionCollege: { marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: '700' },
  clearOption: { minHeight: 50, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: spacing.sm },
  clearText: { color: colors.action, fontSize: 13, fontWeight: '900' },
  customOption: { minHeight: 52, justifyContent: 'center', marginTop: spacing.sm, borderWidth: 1, borderColor: colors.school, borderRadius: radii.control, paddingHorizontal: spacing.md },
  customText: { color: colors.school, fontSize: 13, fontWeight: '900' },
  state: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stateText: { color: colors.body, fontSize: 13, fontWeight: '800' },
  retryButton: { minHeight: 44, justifyContent: 'center', borderRadius: radii.control, backgroundColor: colors.school, paddingHorizontal: spacing.lg },
  retryText: { color: colors.surface, fontSize: 13, fontWeight: '900' },
  emptyText: { paddingVertical: spacing.xl, textAlign: 'center', color: colors.muted, fontSize: 12, fontWeight: '700' },
});
