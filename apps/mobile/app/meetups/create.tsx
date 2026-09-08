import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Minus, Plus } from 'lucide-react-native';

import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import {
  getMeetupsApiClient,
  MeetupApiError,
  MEETUP_CATEGORIES,
  toMeetupScheduleIso,
  type MeetupCategory,
} from '../../src/api/meetups';
import { colors, layout, radii, spacing } from '../../src/theme/tokens';

const categories: Array<{ id: MeetupCategory; label: string }> = [
  { id: 'running', label: '러닝' },
  { id: 'basketball', label: '농구' },
  { id: 'badminton', label: '배드민턴' },
  { id: 'tennis', label: '테니스' },
  { id: 'soccer', label: '축구' },
  { id: 'baseball', label: '야구' },
  { id: 'board_game', label: '보드게임' },
  { id: 'gaming', label: '게임' },
  { id: 'hiking', label: '등산' },
  { id: 'walking', label: '산책' },
  { id: 'dining', label: '맛집' },
  { id: 'study', label: '스터디' },
  { id: 'other', label: '기타' },
];

export default function CreateMeetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const initialCategory = useMemo(
    () => MEETUP_CATEGORIES.includes(params.category as MeetupCategory) ? params.category as MeetupCategory : 'running',
    [params.category],
  );
  const [category, setCategory] = useState<MeetupCategory>(initialCategory);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [dateText, setDateText] = useState('');
  const [timeText, setTimeText] = useState('');
  const [capacity, setCapacity] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    if (submitting) return;
    setMessage('');

    const validationError = validateForm({ title, description, placeName, capacity });
    if (validationError) {
      setMessage(validationError);
      return;
    }

    let scheduledAt: string;
    try {
      scheduledAt = toMeetupScheduleIso(dateText, timeText);
    } catch (error) {
      setMessage(getCreateErrorMessage(error));
      return;
    }

    setSubmitting(true);
    try {
      await getMeetupsApiClient().create({
        category,
        title: title.trim(),
        description: description.trim(),
        placeName: placeName.trim(),
        scheduledAt,
        capacity,
      });
      setMessage('모임을 만들었어요.');
      router.replace('/meetups');
    } catch (error) {
      setMessage(getCreateErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen contentStyle={styles.content} scrollProps={{ keyboardShouldPersistTaps: 'handled' }}>
      <PageHeader
        eyebrow="QUANTUM 모임"
        title="새 모임 만들기"
        description="매칭이 아닌 취미·친구 모임이에요. 내 학교 사람에게만 보여요."
        action={(
          <Pressable accessibilityLabel="모임 목록으로 돌아가기" onPress={() => router.back()} style={styles.iconButton}>
            <ArrowLeft size={21} color={colors.ink} />
          </Pressable>
        )}
      />

      <Field label="활동">
        <View style={styles.categoryGrid}>
          {categories.map((option) => {
            const selected = category === option.id;
            return (
              <Pressable
                accessibilityState={{ selected }}
                key={option.id}
                onPress={() => setCategory(option.id)}
                style={[styles.categoryButton, selected && styles.categoryButtonSelected]}
              >
                <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <Field label="모임 제목" hint={`${title.length}/60`}>
        <TextInput
          maxLength={60}
          onChangeText={setTitle}
          placeholder="예: 온천천 저녁 러닝"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={title}
        />
      </Field>

      <Field label="소개" hint={`${description.length}/500 · 선택`}>
        <TextInput
          maxLength={500}
          multiline
          onChangeText={setDescription}
          placeholder="어떤 사람과 어떻게 즐길지 적어주세요."
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.textarea]}
          textAlignVertical="top"
          value={description}
        />
      </Field>

      <Field label="만날 장소">
        <TextInput
          maxLength={80}
          onChangeText={setPlaceName}
          placeholder="예: 장전역 1번 출구"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={placeName}
        />
      </Field>

      <Field label="날짜와 시간" hint="현재보다 30분 이후">
        <View style={styles.scheduleRow}>
          <TextInput
            accessibilityLabel="모임 날짜"
            autoCapitalize="none"
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
            maxLength={10}
            onChangeText={setDateText}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.scheduleInput]}
            value={dateText}
          />
          <TextInput
            accessibilityLabel="모임 시간"
            autoCapitalize="none"
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
            maxLength={5}
            onChangeText={setTimeText}
            placeholder="HH:MM"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.timeInput]}
            value={timeText}
          />
        </View>
      </Field>

      <Field label="모집 인원" hint="2~20명">
        <View style={styles.stepper}>
          <Pressable accessibilityLabel="모집 인원 줄이기" disabled={capacity <= 2} onPress={() => setCapacity((value) => Math.max(2, value - 1))} style={styles.stepButton}>
            <Minus size={20} color={capacity <= 2 ? colors.line : colors.ink} />
          </Pressable>
          <Text style={styles.capacity}>{capacity}명</Text>
          <Pressable accessibilityLabel="모집 인원 늘리기" disabled={capacity >= 20} onPress={() => setCapacity((value) => Math.min(20, value + 1))} style={styles.stepButton}>
            <Plus size={20} color={capacity >= 20 ? colors.line : colors.ink} />
          </Pressable>
        </View>
      </Field>

      {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
      <Pressable disabled={submitting} onPress={() => void submit()} style={[styles.submitButton, submitting && styles.submitDisabled]}>
        {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.submitText}>모임 만들기</Text>}
      </Pressable>
    </Screen>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function validateForm(input: { title: string; description: string; placeName: string; capacity: number }) {
  const title = input.title.trim();
  const place = input.placeName.trim();
  if (title.length < 4 || title.length > 60) return '모임 제목을 4~60자로 적어주세요.';
  if (input.description.trim().length > 500) return '모임 소개는 500자 이하로 적어주세요.';
  if (place.length < 2 || place.length > 80) return '만날 장소를 2~80자로 적어주세요.';
  if (!Number.isInteger(input.capacity) || input.capacity < 2 || input.capacity > 20) return '모집 인원을 2~20명으로 정해주세요.';
  return null;
}

function getCreateErrorMessage(error: unknown) {
  if (!(error instanceof MeetupApiError)) return '잠시 후 다시 시도해 주세요.';
  if (error.code === 'invalid_schedule') return '날짜는 YYYY-MM-DD, 시간은 HH:MM 형식으로 적어주세요.';
  if (error.code === 'schedule_too_soon') return '모임 시간을 현재보다 30분 이후로 정해주세요.';
  if (error.code === 'profile_required') return '모임을 만들려면 기본 프로필을 먼저 완성해야 해요.';
  if (error.code === 'community_schema_unavailable') return '모임 저장소가 아직 준비되지 않았어요.';
  if (error.code === 'auth_required' || error.code === 'Unauthorized' || error.status === 401) return '모바일 로그인 연결을 다시 확인해 주세요.';
  return '모임을 저장하지 못했어요. 입력값과 네트워크를 확인해 주세요.';
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, paddingBottom: 48 },
  iconButton: {
    width: layout.minimumTouchTarget,
    height: layout.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
  },
  field: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  labelRow: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  label: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  hint: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  input: {
    minHeight: layout.minimumTouchTarget,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  textarea: { minHeight: 108 },
  categoryGrid: { marginTop: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryButton: {
    minHeight: layout.minimumTouchTarget,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  categoryButtonSelected: { borderColor: colors.school, backgroundColor: colors.school },
  categoryText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  categoryTextSelected: { color: colors.surface },
  scheduleRow: { flexDirection: 'row', gap: spacing.sm },
  scheduleInput: { flex: 1 },
  timeInput: { width: 112 },
  stepper: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  stepButton: {
    width: layout.minimumTouchTarget,
    height: layout.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
  },
  capacity: { minWidth: 54, color: colors.ink, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  message: { marginHorizontal: spacing.lg, marginTop: spacing.lg, color: colors.action, fontSize: 13, lineHeight: 20, fontWeight: '800' },
  submitButton: {
    minHeight: 52,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.control,
    backgroundColor: colors.school,
  },
  submitDisabled: { opacity: 0.58 },
  submitText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
});
