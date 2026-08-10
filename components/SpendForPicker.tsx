import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  SPEND_FOR_COLOR,
  SPEND_FOR_ICON,
  SPEND_FOR_LABEL,
  SPEND_FOR_VALUES,
  SpendFor,
} from '../lib/spendFor';

/**
 * Segmented Self / Family control. Used wherever an expense's scope is chosen
 * (dashboard form, Quick Log, History edit) so the affordance reads the same
 * everywhere. `label` renders the small caps caption above the pills.
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
      <View className="flex-row bg-app rounded-full p-1 border border-line self-start">
        {SPEND_FOR_VALUES.map((option) => {
          const selected = value === option;
          return (
            <TouchableOpacity
              key={option}
              onPress={() => onChange(option)}
              style={
                selected
                  ? { backgroundColor: SPEND_FOR_COLOR[option], borderColor: SPEND_FOR_COLOR[option] }
                  : undefined
              }
              className={`flex-row items-center rounded-full border border-transparent ${
                compact ? 'px-3 py-1' : 'px-4 py-1.5'
              }`}
            >
              <Text className={compact ? 'text-[11px] mr-1' : 'text-xs mr-1.5'}>
                {SPEND_FOR_ICON[option]}
              </Text>
              <Text
                className={`text-[11px] font-semibold uppercase tracking-wider ${
                  selected ? 'text-black' : 'text-muted'
                }`}
              >
                {SPEND_FOR_LABEL[option]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
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
