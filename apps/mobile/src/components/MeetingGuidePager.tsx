import { useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { Check, ChevronLeft, ChevronRight, MessageCircle, ShieldCheck, TriangleAlert } from 'lucide-react-native';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
} from 'react-native';

import { colors, layout, radii, spacing } from '../theme/tokens';
import type { MeetingGuideScene } from '../domain/meeting-guide';
import {
  MEETING_GUIDE_MIN_TOUCH_TARGET,
  getGuidePosterLayout,
  getGuideProgressLabel,
} from '../domain/meeting-guide';

type MeetingGuidePagerProps = {
  scenes: readonly MeetingGuideScene[];
  activeIndex: number;
  onActiveIndexChange: (nextIndex: number) => void;
  onFinish?: () => void;
  isFinishing?: boolean;
};

const GUIDE_POSTER = require('../../assets/guides/meeting-rules.png');
const MAX_DIALOGUE_BUBBLES = 3;

export function MeetingGuidePager({ scenes, activeIndex, onActiveIndexChange, onFinish, isFinishing = false }: MeetingGuidePagerProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredContentWidth, setMeasuredContentWidth] = useState(0);
  const bubbleProgress = useRef(
    Array.from({ length: MAX_DIALOGUE_BUBBLES }, () => new Animated.Value(0)),
  ).current;
  const scene = scenes[activeIndex];
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === scenes.length - 1;
  const fallbackContentWidth = Math.min(windowWidth, layout.maxContentWidth)
    - layout.contentPadding * 2
    - spacing.lg * 2;
  const containerWidth = Math.max(1, measuredContentWidth || fallbackContentWidth);
  const { posterWidth, posterHeight, cellWidth, cellHeight } = getGuidePosterLayout(containerWidth);

  const offsetX = -scene.imageCell.column * cellWidth;
  const offsetY = -scene.imageCell.row * cellHeight;

  useEffect(() => {
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;

    bubbleProgress.forEach((progress) => progress.setValue(0));

    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotionEnabled) => {
      if (cancelled) return;

      if (reduceMotionEnabled) {
        bubbleProgress.forEach((progress, index) => {
          progress.setValue(index < scene.dialogue.length ? 1 : 0);
        });
        return;
      }

      animation = Animated.stagger(
        120,
        scene.dialogue.map((_, index) => Animated.timing(bubbleProgress[index], {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        })),
      );
      animation.start();
    });

    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [activeIndex, bubbleProgress, scene.dialogue]);

  function goPrevious() {
    if (isFirst) return;
    onActiveIndexChange(activeIndex - 1);
  }

  function goNext() {
    if (isLast) return;
    onActiveIndexChange(activeIndex + 1);
  }

  function finishGuide() {
    if (onFinish) onFinish();
  }

  return (
    <View
      style={styles.wrap}
      onLayout={(event) => setMeasuredContentWidth(Math.max(1, event.nativeEvent.layout.width))}
    >
      <Text style={styles.progress} accessibilityRole="text">
        {`${getGuideProgressLabel(activeIndex)} ${scene.title}`}
      </Text>

      <View style={styles.progressDots} accessibilityLabel={`${activeIndex + 1}번째 장면, 전체 ${scenes.length}장`}>
        {scenes.map((item, index) => (
          <View
            key={`guide-progress-${item.stepNumber}`}
            style={[styles.progressDot, index === activeIndex && styles.progressDotActive]}
          />
        ))}
      </View>

      <View style={styles.imageViewport}>
        <View
          style={[styles.imageFrame, { width: cellWidth, height: cellHeight }]}
          accessibilityRole="image"
          accessibilityLabel={`${scene.title} 장면 이미지`}
          accessible
        >
          <Image
            source={GUIDE_POSTER}
            style={[
              styles.posterImage,
              {
                width: posterWidth,
                height: posterHeight,
                transform: [{ translateX: offsetX }, { translateY: offsetY }],
              },
            ]}
            resizeMode="cover"
            accessible={false}
          />
        </View>
      </View>

      <View style={styles.dialogueStage} accessibilityLiveRegion="polite">
        <Text style={styles.dialogueEyebrow}>상황을 보고 판단해요</Text>
        {scene.dialogue.map((bubble, index) => {
          const isRight = bubble.side === 'right';
          const isWarning = bubble.tone === 'warning';
          const isQuantum = bubble.tone === 'quantum' || isWarning;

          return (
            <Animated.View
              key={bubble.id}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${bubble.speaker}: ${bubble.text}`}
              style={[
                styles.bubbleRow,
                isRight ? styles.bubbleRowRight : styles.bubbleRowLeft,
                {
                  opacity: bubbleProgress[index],
                  transform: [{
                    translateY: bubbleProgress[index].interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  }],
                },
              ]}
            >
              <View
                style={[
                  styles.speechBubble,
                  isQuantum && styles.quantumBubble,
                  isWarning && styles.warningBubble,
                ]}
              >
                <View style={styles.bubbleSpeakerRow}>
                  {isWarning ? (
                    <TriangleAlert size={15} color={colors.action} />
                  ) : isQuantum ? (
                    <ShieldCheck size={15} color={colors.safety} />
                  ) : (
                    <MessageCircle size={15} color={colors.school} />
                  )}
                  <Text style={[styles.bubbleSpeaker, isWarning && styles.warningSpeaker]}>{bubble.speaker}</Text>
                </View>
                <Text style={styles.bubbleText}>{bubble.text}</Text>
                <View
                  style={[
                    styles.bubbleTail,
                    isRight ? styles.bubbleTailRight : styles.bubbleTailLeft,
                    isQuantum && styles.quantumBubbleTail,
                    isWarning && styles.warningBubbleTail,
                  ]}
                />
              </View>
            </Animated.View>
          );
        })}
      </View>

      <Text style={styles.requiredHint}>6장을 다 봐야 참여할 수 있어요.</Text>

      <View style={styles.controls}>
        <Pressable
          disabled={isFirst}
          onPress={goPrevious}
          accessibilityRole="button"
          accessibilityLabel="이전"
          accessibilityHint="이전 장면으로 이동"
          accessibilityState={{ disabled: isFirst }}
          style={({ pressed }) => [styles.navButton, isFirst && styles.disabledButton, pressed && styles.pressed]}
        >
          <ChevronLeft size={20} color={isFirst ? colors.muted : colors.ink} />
          <Text style={navTextStyle(isFirst)}>이전</Text>
        </Pressable>
        <Pressable
          disabled={isLast}
          onPress={goNext}
          accessibilityRole="button"
          accessibilityLabel="다음"
          accessibilityHint="다음 장면으로 이동"
          accessibilityState={{ disabled: isLast }}
          style={({ pressed }) => [styles.navButton, isLast && styles.disabledButton, pressed && styles.pressed]}
        >
          <Text style={navTextStyle(isLast)}>다음</Text>
          <ChevronRight size={20} color={isLast ? colors.muted : colors.ink} />
        </Pressable>
      </View>

      {isLast ? (
        <Pressable
          disabled={isFinishing}
          onPress={finishGuide}
          accessibilityRole="button"
          accessibilityLabel="완료"
          accessibilityHint="안내를 완료하고 종료합니다."
          accessibilityState={{ disabled: isFinishing, busy: isFinishing }}
          style={({ pressed }) => [styles.finishButton, pressed && styles.pressed, isFinishing && styles.disabledButton]}
        >
          <Check size={20} color={colors.surface} />
          <Text style={styles.finishText}>{isFinishing ? '저장 중' : '완료'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function navTextStyle(disabled: boolean): TextStyle {
  return {
    color: disabled ? colors.muted : colors.ink,
    fontSize: 14,
    fontWeight: '900',
  };
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.lg,
  },
  progress: {
    color: colors.school,
    fontSize: 13,
    fontWeight: '900',
  },
  progressDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressDot: {
    width: 7,
    height: 7,
    borderRadius: radii.round,
    backgroundColor: colors.line,
  },
  progressDotActive: {
    width: 28,
    backgroundColor: colors.school,
  },
  imageViewport: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFrame: {
    overflow: 'hidden',
    borderRadius: radii.card,
    borderWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  posterImage: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  dialogueStage: {
    minHeight: 220,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  dialogueEyebrow: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  bubbleRow: {
    width: '100%',
  },
  bubbleRowLeft: {
    alignItems: 'flex-start',
  },
  bubbleRowRight: {
    alignItems: 'flex-end',
  },
  speechBubble: {
    position: 'relative',
    width: '86%',
    maxWidth: 520,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    gap: 6,
  },
  quantumBubble: {
    borderColor: '#A8D3CC',
    backgroundColor: '#EAF7F4',
  },
  warningBubble: {
    borderColor: '#F1B3AB',
    backgroundColor: '#FFF1EF',
  },
  bubbleSpeakerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bubbleSpeaker: {
    color: colors.school,
    fontSize: 12,
    fontWeight: '900',
  },
  warningSpeaker: {
    color: colors.action,
  },
  bubbleText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  bubbleTail: {
    position: 'absolute',
    bottom: -6,
    width: 12,
    height: 12,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    transform: [{ rotate: '45deg' }],
  },
  bubbleTailLeft: {
    left: 18,
  },
  bubbleTailRight: {
    right: 18,
  },
  quantumBubbleTail: {
    borderColor: '#A8D3CC',
    backgroundColor: '#EAF7F4',
  },
  warningBubbleTail: {
    borderColor: '#F1B3AB',
    backgroundColor: '#FFF1EF',
  },
  requiredHint: {
    color: colors.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontWeight: '700',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  navButton: {
    flex: 1,
    minHeight: MEETING_GUIDE_MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  disabledButton: { opacity: 0.5 },
  finishButton: {
    minHeight: MEETING_GUIDE_MIN_TOUCH_TARGET,
    borderRadius: radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.school,
  },
  finishText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '900',
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
