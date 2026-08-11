import { useRef } from 'react';
import {
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { ChevronLeft, ChevronRight, Clock3, MapPin, UsersRound } from 'lucide-react-native';

import { type TonightEvent, type TonightEventKind } from '../domain/events';
import { formatEventMeetingTime } from '../domain/event-display';
import { colors, layout, radii, spacing } from '../theme/tokens';

const eventImages: Record<TonightEventKind, ImageSourcePropType> = {
  dinner: require('../../assets/events/dinner.webp'),
  jogging: require('../../assets/events/jogging.webp'),
  'board-game': require('../../assets/events/board-game.webp'),
  drinks: require('../../assets/events/drinks.webp'),
};

type TonightEventCarouselProps = {
  events: readonly TonightEvent[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  accessibilityLabel?: string;
};

export function TonightEventCarousel({
  events,
  activeIndex,
  onActiveIndexChange,
  accessibilityLabel = '활동 선택',
}: TonightEventCarouselProps) {
  const { width: windowWidth } = useWindowDimensions();
  const viewportWidth = Math.min(windowWidth, layout.maxContentWidth);
  const itemWidth = Math.min(350, Math.max(270, viewportWidth * 0.78));
  const itemGap = 12;
  const snap = itemWidth + itemGap;
  const sidePadding = Math.max(16, (viewportWidth - itemWidth) / 2);
  const scrollX = useRef(new Animated.Value(activeIndex * snap)).current;
  const listRef = useRef<Animated.FlatList<TonightEvent>>(null);

  function move(direction: -1 | 1) {
    const next = Math.max(0, Math.min(events.length - 1, activeIndex + direction));
    listRef.current?.scrollToOffset({ offset: next * snap, animated: true });
    onActiveIndexChange(next);
  }

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.max(0, Math.min(events.length - 1, Math.round(event.nativeEvent.contentOffset.x / snap)));
    onActiveIndexChange(next);
  }

  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.wrap}>
      <Animated.FlatList
        ref={listRef}
        horizontal
        data={events as TonightEvent[]}
        keyExtractor={(event) => event.id}
        decelerationRate="fast"
        snapToInterval={snap}
        snapToAlignment="start"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: sidePadding }}
        ItemSeparatorComponent={() => <View style={{ width: itemGap }} />}
        onMomentumScrollEnd={handleScrollEnd}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: Platform.OS !== 'web' },
        )}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => {
          const inputRange = [(index - 1) * snap, index * snap, (index + 1) * snap];
          const rotateY = scrollX.interpolate({
            inputRange,
            outputRange: ['16deg', '0deg', '-16deg'],
            extrapolate: 'clamp',
          });
          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.9, 1, 0.9],
            extrapolate: 'clamp',
          });
          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.58, 1, 0.58],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View style={{ width: itemWidth, opacity, transform: [{ perspective: 1000 }, { rotateY }, { scale }] }}>
              <View style={styles.card}>
                <View style={styles.photoStage}>
                  <Image source={eventImages[item.imageKey]} style={styles.photo} resizeMode="cover" />
                  <View style={styles.scrim} />
                  <View style={styles.cardTop}>
                    <Text style={styles.eyebrow}>{item.eyebrow}</Text>
                    <View style={styles.remainingPill}>
                      <UsersRound size={13} color={colors.nightText} />
                      <Text style={styles.remainingText}>{item.remaining === null ? '모집 중' : `${item.remaining}자리`}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.cardBottom}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.description}>{item.description}</Text>
                  <View style={styles.metaRow}>
                    <Clock3 size={14} color="#F3B95F" />
                    <Text style={styles.metaText}>{formatEventMeetingTime(item.meetingTime)}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <MapPin size={14} color="#F3B95F" />
                    <Text style={styles.metaText}>{item.venue}</Text>
                  </View>
                </View>
              </View>
            </Animated.View>
          );
        }}
      />

      <View style={styles.controls}>
        <Pressable
          accessibilityLabel="이전 활동"
          disabled={activeIndex === 0}
          onPress={() => move(-1)}
          style={({ pressed }) => [styles.controlButton, pressed && styles.pressed, activeIndex === 0 && styles.disabled]}
        >
          <ChevronLeft size={22} color={colors.nightText} />
        </Pressable>
        <View style={styles.dots}>
          {events.map((event, index) => (
            <View key={event.id} style={[styles.dot, index === activeIndex && styles.dotActive]} />
          ))}
        </View>
        <Pressable
          accessibilityLabel="다음 활동"
          disabled={activeIndex === events.length - 1}
          onPress={() => move(1)}
          style={({ pressed }) => [styles.controlButton, pressed && styles.pressed, activeIndex === events.length - 1 && styles.disabled]}
        >
          <ChevronRight size={22} color={colors.nightText} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg },
  card: {
    height: 410,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.card,
    backgroundColor: colors.nightSurface,
  },
  photoStage: { height: 220, overflow: 'hidden', backgroundColor: '#24303A' },
  photo: { width: '100%', height: '100%' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(6,11,16,0.18)' },
  cardTop: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  eyebrow: { color: '#F3B95F', fontSize: 12, fontWeight: '900' },
  remainingPill: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radii.round,
    backgroundColor: 'rgba(17,24,32,0.7)',
    paddingHorizontal: 10,
  },
  remainingText: { color: colors.nightText, fontSize: 11, fontWeight: '800' },
  cardBottom: { flex: 1, padding: spacing.lg },
  title: { color: colors.nightText, fontSize: 23, lineHeight: 29, fontWeight: '900' },
  description: { marginTop: 8, color: 'rgba(249,251,250,0.78)', fontSize: 13, lineHeight: 20, fontWeight: '600' },
  metaRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  metaText: { color: colors.nightText, fontSize: 12, fontWeight: '800' },
  controls: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  controlButton: {
    width: layout.minimumTouchTarget,
    height: layout.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: colors.nightSurface,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.3 },
  dots: { minWidth: 64, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)' },
  dotActive: { width: 18, backgroundColor: '#F3B95F' },
});
