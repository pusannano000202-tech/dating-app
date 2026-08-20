import { useRouter } from 'expo-router';
import { ArrowLeft, Check, ChevronRight, MessageCircleMore, Pencil } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { getQuantumApiClient } from '../../src/api/quantum';
import type { MobileBasicProfileInput } from '../../src/api/client';
import { Screen } from '../../src/components/Screen';
import { DepartmentSelect } from '../../src/components/DepartmentSelect';
import { colors, radii, spacing } from '../../src/theme/tokens';

type BasicProfileStep =
  | 'nickname'
  | 'phone'
  | 'gender'
  | 'age'
  | 'height'
  | 'school'
  | 'department'
  | 'review';

const STEPS: BasicProfileStep[] = [
  'nickname',
  'phone',
  'gender',
  'age',
  'height',
  'school',
  'department',
  'review',
];

const QUESTION_COPY: Record<BasicProfileStep, { title: string; body: string }> = {
  nickname: {
    title: 'Quantum에서 어떤 이름으로 불러드릴까요?',
    body: '실명 대신 친구들에게 보일 편한 닉네임을 적어주세요.',
  },
  phone: {
    title: '연락 가능한 휴대폰 번호를 알려주세요.',
    body: '계정 확인과 중요한 약속 안내에만 사용해요.',
  },
  gender: {
    title: '성별을 알려주세요.',
    body: '이상형 월드컵과 매칭 후보를 준비할 때 사용해요.',
  },
  age: {
    title: '나이는 몇 살인가요?',
    body: '가운데 숫자가 내 나이가 되도록 위아래로 움직여주세요.',
  },
  height: {
    title: '키도 알려주실래요?',
    body: '선택 항목이에요. 휠을 움직이거나 편하게 건너뛸 수 있어요.',
  },
  school: {
    title: '어느 학교에 다니고 있나요?',
    body: '학교 생활권에 맞는 모임과 커뮤니티를 추천해드려요.',
  },
  department: {
    title: '학과와 학년도 알려주세요.',
    body: '둘 다 선택 항목이고, 나중에 마이 탭에서 바꿀 수 있어요.',
  },
  review: {
    title: '제가 제대로 들었는지 확인해주세요.',
    body: '수정할 항목을 누르면 그 질문으로 바로 돌아갈 수 있어요.',
  },
};

const AGE_OPTIONS = Array.from({ length: 18 }, (_, index) => index + 18);
const HEIGHT_OPTIONS = Array.from({ length: 111 }, (_, index) => index + 140);
const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
const WHEEL_ITEM_HEIGHT = 48;

export default function BasicProfileRoute() {
  return <BasicProfileScreen />;
}

export function BasicProfileScreen({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<BasicProfileStep>('nickname');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [age, setAge] = useState(22);
  const [height, setHeight] = useState<number | null>(null);
  const [school, setSchool] = useState('부산대학교');
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    if (preview) {
      setLoading(false);
      return;
    }
    let active = true;
    void getQuantumApiClient().getProfileOnboarding().then((summary) => {
      if (!active || !summary.profile) return;
      setDisplayName(summary.profile.displayName);
      setGender(summary.profile.gender);
      setAge(summary.profile.age);
      setHeight(summary.profile.height);
      setSchool(summary.profile.school);
      setDepartment(summary.profile.department ?? '');
      setYear(summary.profile.year);
    }).catch(() => {
      if (active) setMessage('저장된 정보를 불러오지 못했어요. 새로 입력해도 괜찮아요.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [preview]);

  const stepIndex = STEPS.indexOf(step);
  const progress = `${stepIndex + 1} / ${STEPS.length}`;
  const progressWidth = `${((stepIndex + 1) / STEPS.length) * 100}%` as `${number}%`;
  const question = QUESTION_COPY[step];
  const summary = useMemo(() => [
    { label: '닉네임', value: displayName || '미입력', step: 'nickname' as const },
    { label: '연락처', value: phone || '미입력', step: 'phone' as const },
    { label: '성별', value: gender === 'male' ? '남자' : gender === 'female' ? '여자' : '미선택', step: 'gender' as const },
    { label: '나이', value: `${age}세`, step: 'age' as const },
    { label: '키', value: height ? `${height}cm` : '선택 안 함', step: 'height' as const },
    { label: '학교', value: school || '미입력', step: 'school' as const },
    { label: '학과·학년', value: `${department || '선택 안 함'}${year ? ` · ${year}학년` : ''}`, step: 'department' as const },
  ], [age, department, displayName, gender, height, phone, school, year]);

  function validateStep(target: BasicProfileStep): string | null {
    if (target === 'nickname' && displayName.trim().length < 2) return '닉네임은 2자 이상 적어주세요.';
    if (target === 'phone' && !/^010-?\d{4}-?\d{4}$/.test(phone)) return '010 휴대폰 번호를 확인해주세요.';
    if (target === 'gender' && !gender) return '성별을 선택해주세요.';
    if (target === 'age' && (age < 18 || age > 35)) return '나이는 18~35세 사이에서 선택해주세요.';
    if (target === 'height' && height !== null && (height < 140 || height > 250)) return '키를 다시 선택해주세요.';
    if (target === 'school' && !school.trim()) return '학교를 입력해주세요.';
    return null;
  }

  function next() {
    const error = validateStep(step);
    if (error) return setMessage(error);
    setMessage(null);
    setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]);
  }

  function previous() {
    setMessage(null);
    if (stepIndex === 0) return router.back();
    setStep(STEPS[stepIndex - 1]);
  }

  async function save() {
    for (const requiredStep of ['nickname', 'phone', 'gender', 'age', 'height', 'school'] as const) {
      const error = validateStep(requiredStep);
      if (error) {
        setStep(requiredStep);
        setMessage(error);
        return;
      }
    }

    const input: MobileBasicProfileInput = {
      displayName: displayName.trim(),
      phone,
      gender: gender as 'male' | 'female',
      age,
      height,
      bodyType: null,
      hairDensity: null,
      school: school.trim(),
      department: department.trim() || null,
      year,
    };

    setSaving(true);
    setMessage(null);
    try {
      await getQuantumApiClient().saveBasicProfile(input);
      router.replace('/(tabs)/profile');
    } catch {
      setMessage('기본정보를 저장하지 못했어요. 답변은 그대로 두었으니 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={colors.school} /></View>;
  }

  return (
    <Screen
      key={step}
      contentStyle={styles.content}
      scrollProps={{ keyboardShouldPersistTaps: 'handled' }}
    >
      <View style={styles.topRow}>
        <Pressable accessibilityLabel="이전 질문" onPress={previous} style={styles.iconButton}>
          <ArrowLeft size={21} color={colors.ink} />
        </Pressable>
        <View style={styles.brandRow}>
          <MessageCircleMore size={16} color={colors.school} />
          <Text style={styles.brand}>Quantum</Text>
        </View>
        <Text style={styles.progress}>{progress}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: progressWidth }]} />
      </View>

      <View style={styles.chatArea}>
        <View style={styles.assistantRow}>
          <View style={styles.avatar}><Text style={styles.avatarText}>Q</Text></View>
          <View style={styles.assistantBubble}>
            <Text style={styles.questionTitle}>{question.title}</Text>
            <Text style={styles.questionBody}>{question.body}</Text>
          </View>
        </View>

        <CurrentAnswerBubble
          step={step}
          displayName={displayName}
          phone={phone}
          gender={gender}
          age={age}
          height={height}
          school={school}
          department={department}
          year={year}
        />

        <View style={styles.responseArea}>
          {step === 'nickname' ? (
            <Field
              label="닉네임"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="예: 새벽"
              maxLength={20}
              autoFocus={!preview}
              returnKeyType="next"
              onSubmitEditing={next}
            />
          ) : null}
          {step === 'phone' ? (
            <Field
              label="휴대폰 번호"
              value={phone}
              onChangeText={setPhone}
              placeholder="010-1234-5678"
              keyboardType="phone-pad"
              maxLength={13}
              autoFocus={!preview}
              returnKeyType="next"
              onSubmitEditing={next}
            />
          ) : null}
          {step === 'gender' ? (
            <View style={styles.choiceRow}>
              {(['male', 'female'] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: gender === value }}
                  onPress={() => setGender(value)}
                  style={[styles.choice, gender === value && styles.choiceOn]}
                >
                  <Text style={[styles.choiceText, gender === value && styles.choiceTextOn]}>
                    {value === 'male' ? '남자' : '여자'}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {step === 'age' ? (
            <WheelPicker values={AGE_OPTIONS} value={age} suffix="세" onSelect={setAge} />
          ) : null}
          {step === 'height' ? (
            <>
              <WheelPicker values={HEIGHT_OPTIONS} value={height ?? 170} suffix="cm" onSelect={setHeight} />
              <Pressable onPress={() => setHeight(null)} style={[styles.skipChoice, height === null && styles.skipChoiceOn]}>
                <Text style={[styles.skipChoiceText, height === null && styles.skipChoiceTextOn]}>선택하지 않을게요</Text>
              </Pressable>
            </>
          ) : null}
          {step === 'school' ? (
            <Field
              label="학교"
              value={school}
              onChangeText={setSchool}
              placeholder="부산대학교"
              autoFocus={!preview}
              returnKeyType="next"
              onSubmitEditing={next}
            />
          ) : null}
          {step === 'department' ? (
            <>
              <DepartmentSelect
                schoolId="pnu"
                value={department}
                onChange={setDepartment}
              />
              <Text style={styles.controlLabel}>학년 (선택)</Text>
              <View style={styles.yearRow}>
                {YEAR_OPTIONS.map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setYear((current) => current === value ? null : value)}
                    style={[styles.yearChoice, year === value && styles.yearChoiceOn]}
                  >
                    <Text style={[styles.yearChoiceText, year === value && styles.yearChoiceTextOn]}>{value}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          {step === 'review' ? summary.map((item) => (
            <Pressable key={item.label} onPress={() => setStep(item.step)} style={styles.summaryRow}>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryLabel}>{item.label}</Text>
                <Text style={styles.summaryValue}>{item.value}</Text>
              </View>
              <Pencil size={17} color={colors.school} />
            </Pressable>
          )) : null}
          {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
        </View>
      </View>

      <View style={styles.actions}>
        {stepIndex > 0 ? (
          <Pressable onPress={previous} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>이전</Text>
          </Pressable>
        ) : null}
        <Pressable
          disabled={saving}
          onPress={step === 'review' ? () => void save() : next}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, saving && styles.disabled]}
        >
          {step === 'review' ? <Check size={19} color={colors.surface} /> : <ChevronRight size={19} color={colors.surface} />}
          <Text style={styles.primaryText}>{saving ? '저장 중' : step === 'review' ? '이대로 시작하기' : '답하기'}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function CurrentAnswerBubble({
  step,
  displayName,
  phone,
  gender,
  age,
  height,
  school,
  department,
  year,
}: {
  step: BasicProfileStep;
  displayName: string;
  phone: string;
  gender: 'male' | 'female' | null;
  age: number;
  height: number | null;
  school: string;
  department: string;
  year: number | null;
}) {
  const value = step === 'nickname' ? displayName.trim()
    : step === 'phone' ? phone.trim()
      : step === 'gender' ? gender === 'male' ? '남자예요' : gender === 'female' ? '여자예요' : ''
        : step === 'age' ? `${age}세예요`
          : step === 'height' ? height ? `${height}cm예요` : '선택하지 않을게요'
            : step === 'school' ? school.trim()
              : step === 'department' ? `${department.trim() || '학과 선택 안 함'}${year ? ` · ${year}학년` : ''}`
                : '';

  if (!value || step === 'review') return null;
  return <View style={styles.answerBubble}><Text style={styles.answerText}>{value}</Text></View>;
}

function WheelPicker({
  values,
  value,
  suffix,
  onSelect,
}: {
  values: number[];
  value: number;
  suffix: string;
  onSelect: (value: number) => void;
}) {
  const initialIndex = Math.max(0, values.indexOf(value));
  const wheelRef = useRef<ScrollView>(null);

  useEffect(() => {
    wheelRef.current?.scrollTo({ y: initialIndex * WHEEL_ITEM_HEIGHT, animated: false });
  }, [initialIndex]);

  function selectFromScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.max(0, Math.min(values.length - 1, Math.round(event.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT)));
    onSelect(values[index]);
  }

  return (
    <View style={styles.wheelFrame} accessibilityRole="adjustable" accessibilityLabel={`${value}${suffix}`}>
      <View style={styles.wheelSelection} />
      <ScrollView
        ref={wheelRef}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: initialIndex * WHEEL_ITEM_HEIGHT }}
        contentContainerStyle={styles.wheelContent}
        onMomentumScrollEnd={selectFromScroll}
        onScrollEndDrag={selectFromScroll}
      >
        {values.map((option, index) => (
          <Pressable
            key={option}
            onPress={() => {
              onSelect(option);
              wheelRef.current?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated: true });
            }}
            style={styles.wheelItem}
          >
            <Text style={[styles.wheelText, option === value && styles.wheelTextOn]}>{option}{suffix}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.controlLabel}>{label}</Text>
      <TextInput {...inputProps} style={styles.input} placeholderTextColor={colors.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  topRow: { minHeight: 48, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brand: { color: colors.school, fontSize: 14, fontWeight: '900' },
  progress: { minWidth: 44, textAlign: 'right', color: colors.muted, fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 4, marginHorizontal: spacing.lg, marginBottom: spacing.xl, backgroundColor: colors.line },
  progressFill: { height: 4, backgroundColor: colors.school },
  chatArea: { paddingHorizontal: spacing.lg, gap: spacing.md },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.school },
  avatarText: { color: colors.surface, fontSize: 14, fontWeight: '900' },
  assistantBubble: { flex: 1, minWidth: 0, padding: spacing.lg, borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, borderTopLeftRadius: 2, backgroundColor: colors.surface },
  questionTitle: { color: colors.ink, fontSize: 19, lineHeight: 27, fontWeight: '900' },
  questionBody: { marginTop: spacing.sm, color: colors.body, fontSize: 13, lineHeight: 20, fontWeight: '600' },
  answerBubble: { maxWidth: '82%', alignSelf: 'flex-end', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radii.card, borderTopRightRadius: 2, backgroundColor: colors.school },
  answerText: { color: colors.surface, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  responseArea: { marginTop: spacing.md, gap: spacing.md },
  field: { gap: spacing.sm },
  controlLabel: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface, paddingHorizontal: spacing.md, color: colors.ink, fontSize: 16, fontWeight: '700' },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choice: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface },
  choiceOn: { borderColor: colors.school, backgroundColor: colors.surfaceMuted },
  choiceText: { color: colors.body, fontSize: 15, fontWeight: '800' },
  choiceTextOn: { color: colors.school },
  wheelFrame: { height: WHEEL_ITEM_HEIGHT * 3, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface },
  wheelContent: { paddingVertical: WHEEL_ITEM_HEIGHT },
  wheelSelection: { pointerEvents: 'none', position: 'absolute', zIndex: 1, left: spacing.sm, right: spacing.sm, top: WHEEL_ITEM_HEIGHT, height: WHEEL_ITEM_HEIGHT, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.school, backgroundColor: 'rgba(29,92,139,0.07)' },
  wheelItem: { height: WHEEL_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  wheelText: { color: colors.muted, fontSize: 16, fontWeight: '700' },
  wheelTextOn: { color: colors.school, fontSize: 20, fontWeight: '900' },
  skipChoice: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface },
  skipChoiceOn: { borderColor: colors.school, backgroundColor: colors.surfaceMuted },
  skipChoiceText: { color: colors.body, fontSize: 13, fontWeight: '800' },
  skipChoiceTextOn: { color: colors.school },
  yearRow: { flexDirection: 'row', gap: spacing.xs },
  yearChoice: { flex: 1, minWidth: 0, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface },
  yearChoiceOn: { borderColor: colors.school, backgroundColor: colors.surfaceMuted },
  yearChoiceText: { color: colors.body, fontSize: 13, fontWeight: '800' },
  yearChoiceTextOn: { color: colors.school },
  summaryRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  summaryValue: { marginTop: 4, color: colors.ink, fontSize: 14, fontWeight: '900' },
  error: { color: colors.action, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  actions: { marginTop: 'auto', paddingTop: spacing.xl, paddingHorizontal: spacing.lg, flexDirection: 'row', gap: spacing.sm },
  secondaryButton: { minHeight: 52, minWidth: 82, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface },
  secondaryText: { color: colors.body, fontSize: 14, fontWeight: '900' },
  primaryButton: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.control, backgroundColor: colors.school },
  primaryText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.5 },
});
