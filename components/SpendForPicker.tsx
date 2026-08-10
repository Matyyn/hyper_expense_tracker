import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import Animated, {
  SharedValue,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from './ThemeProvider';
import {
  SPEND_FOR_COLOR,
  SPEND_FOR_ICON,
  SPEND_FOR_LABEL,
  SPEND_FOR_VALUES,
  SpendFor,
} from '../lib/spendFor';

const PAD = 4;
// Snappy but settled — no visible overshoot wobble on a two-option control.
const SPRING = { damping: 20, stiffness: 240, mass: 0.7 } as const;

export interface SegmentOption<T extends string> {
  key: T;
  label: string;
  icon?: string;
  /** Fill colour of the sliding pill when this option is active. */
  color: string;
}

/**
 * Segmented control with a pill that slides between options instead of
 * snapping. The pill is a single absolutely-positioned view animated on
 * translateX, and its fill cross-fades between the active options' colours, so
 * switching reads as one continuous movement rather than two separate repaints.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  fullWidth = false,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  compact?: boolean;
  fullWidth?: boolean;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex(o => o.key === value));
  const progress = useSharedValue(index);

  useEffect(() => {
    progress.value = withSpring(index, SPRING);
  }, [index]);

  const segWidth = width > 0 ? (width - PAD * 2) / options.length : 0;
  // interpolateColor needs >= 2 stops; a single-option control never animates.
  const stops = options.map((_, i) => i);
  const fills = options.map(o => o.color);

  const pillStyle = useAnimatedStyle(() => ({
    width: segWidth,
    transform: [{ translateX: PAD + progress.value * segWidth }],
    backgroundColor:
      options.length > 1 ? interpolateColor(progress.value, stops, fills) : fills[0],
  }), [segWidth, width, options.length]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      className={`flex-row bg-app rounded-full border border-line ${fullWidth ? '' : 'self-start'}`}
      style={{ padding: PAD }}
    >
      {segWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', top: PAD, bottom: PAD, left: 0, borderRadius: 999 },
            pillStyle,
          ]}
        />
      )}
      {options.map((option, i) => (
        <SegmentLabel
          key={option.key}
          option={option}
          index={i}
          progress={progress}
          mutedColor={colors.muted}
          compact={compact}
          onPress={() => onChange(option.key)}
        />
      ))}
    </View>
  );
}

function SegmentLabel<T extends string>({
  option,
  index,
  progress,
  mutedColor,
  compact,
  onPress,
}: {
  option: SegmentOption<T>;
  index: number;
  progress: SharedValue<number>;
  mutedColor: string;
  compact: boolean;
  onPress: () => void;
}) {
  // Text darkens to near-black as the pill arrives under it and fades back to
  // muted as it leaves, keeping the label legible mid-slide.
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      Math.abs(progress.value - index) > 1 ? 1 : Math.abs(progress.value - index),
      [0, 1],
      ['#0c0a09', mutedColor]
    ),
  }), [index, mutedColor]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.45 * Math.max(0, 1 - Math.abs(progress.value - index)),
  }), [index]);

  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 flex-row items-center justify-center rounded-full ${
        compact ? 'px-3 py-1' : 'px-4 py-1.5'
      }`}
    >
      {option.icon ? (
        <Animated.Text style={[iconStyle, { fontSize: compact ? 11 : 12, marginRight: 5 }]}>
          {option.icon}
        </Animated.Text>
      ) : null}
      <Animated.Text
        numberOfLines={1}
        style={[
          textStyle,
          { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
        ]}
      >
        {option.label}
      </Animated.Text>
    </Pressable>
  );
}

const SPEND_FOR_OPTIONS: SegmentOption<SpendFor>[] = SPEND_FOR_VALUES.map(s => ({
  key: s,
  label: SPEND_FOR_LABEL[s],
  icon: SPEND_FOR_ICON[s],
  color: SPEND_FOR_COLOR[s],
}));

/**
 * Self / Family picker. Used wherever an expense's scope is chosen (dashboard
 * form, Quick Log, History edit) so the affordance reads the same everywhere.
 */
export function SpendForPicker({
  value,
  onChange,
  label,
  compact = false,
}: {
  value: SpendFor;
  onChange: (next: SpendFor) => void;
  label?: string;
  compact?: boolean;
}) {
  return (
    <View className={compact ? '' : 'mb-3'}>
      {label ? (
        <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
          {label}
        </Text>
      ) : null}
      <Segmented options={SPEND_FOR_OPTIONS} value={value} onChange={onChange} compact={compact} />
    </View>
  );
}

/**
 * All / Self / Family filter used by History and Analytics. `allLabel` and
 * `allColor` differ per screen ("All" vs "Everything").
 */
export function ScopeSwitch<T extends string>({
  value,
  onChange,
  allLabel = 'All',
  allColor = '#34d399',
}: {
  value: T;
  onChange: (next: T) => void;
  allLabel?: string;
  allColor?: string;
}) {
  const options = [
    { key: 'all' as T, label: allLabel, color: allColor },
    ...SPEND_FOR_OPTIONS.map(o => ({ ...o, key: o.key as unknown as T })),
  ];
  return <Segmented options={options} value={value} onChange={onChange} fullWidth />;
}

/** Small read-only chip for list rows. Renders nothing for self-scoped rows. */
export function SpendForBadge({ value }: { value: SpendFor }) {
  if (value !== 'family') return null;
  return (
    <View
      className="rounded-full px-1.5 py-0.5 border"
      style={{ borderColor: `${SPEND_FOR_COLOR.family}55`, backgroundColor: `${SPEND_FOR_COLOR.family}1a` }}
    >
      <Text
        className="text-[9px] font-semibold uppercase tracking-wider"
        style={{ color: SPEND_FOR_COLOR.family }}
      >
        {SPEND_FOR_ICON.family} {SPEND_FOR_LABEL.family}
      </Text>
    </View>
  );
}
