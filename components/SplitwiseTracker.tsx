import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useCurrency } from './CurrencyProvider';
import { useNotification } from './NotificationProvider';
import { Segmented, SegmentOption } from './SpendForPicker';
import { newId } from '../lib/ids';
import {
  DEFAULT_SPLITWISE_DIRECTION,
  MAX_SPLITWISE_ENTRIES,
  SPLITWISE_COLOR,
  SPLITWISE_ICON,
  SPLITWISE_LABEL,
  SPLITWISE_DIRECTIONS,
  SplitwiseDirection,
  SplitwiseEntry,
  sumByDirection,
} from '../lib/splitwise';

const DIRECTION_OPTIONS: SegmentOption<SplitwiseDirection>[] = SPLITWISE_DIRECTIONS.map(d => ({
  key: d,
  label: SPLITWISE_LABEL[d],
  color: SPLITWISE_COLOR[d],
}));

type Draft = {
  /** Set when editing an existing entry; absent when adding a new one. */
  id?: string;
  name: string;
  amount: string;
  direction: SplitwiseDirection;
};

const EMPTY_DRAFT: Draft = {
  name: '',
  amount: '',
  direction: DEFAULT_SPLITWISE_DIRECTION,
};

/**
 * Standalone "who owes whom" ledger. Rendered inside the dashboard's Add Entry
 * card when the Split mode is selected.
 *
 * Imports nothing from the money layer on purpose: no useExpenseSync, no
 * addExpense, no budget metrics. `entries` is the live metadata read and
 * `onPersist` writes the whole array back through the ['updateMetadata']
 * offline mutation, so every handler below rebuilds `next` from the prop.
 */
export function SplitwiseTracker({
  entries,
  onPersist,
}: {
  entries: SplitwiseEntry[];
  onPersist: (next: SplitwiseEntry[]) => void;
}) {
  const { format, symbol } = useCurrency();
  const { showNotification } = useNotification();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const totals = sumByDirection(entries);
  const isEditing = !!draft.id;

  const handleSave = () => {
    const name = draft.name.trim();
    const amount = Number(draft.amount);
    if (!name) {
      showNotification('Add a name first', 'error');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showNotification('Enter an amount greater than zero', 'error');
      return;
    }

    if (isEditing) {
      onPersist(
        entries.map(e =>
          e.id === draft.id
            ? { ...e, name, amount, direction: draft.direction }
            : e,
        ),
      );
      showNotification('Splitwise entry updated', 'success');
    } else {
      if (entries.length >= MAX_SPLITWISE_ENTRIES) {
        showNotification(
          `Splitwise holds up to ${MAX_SPLITWISE_ENTRIES} entries — settle a few first`,
          'error',
        );
        return;
      }
      // Newest first. id/created_at are minted here, never inside a mutation fn,
      // so an offline replay reuses the same values.
      onPersist([
        {
          id: newId(),
          name,
          direction: draft.direction,
          amount,
          created_at: new Date().toISOString(),
        },
        ...entries,
      ]);
      showNotification(
        `${SPLITWISE_LABEL[draft.direction]} · ${format(amount)} — ${name}`,
        'success',
        true,
      );
    }
    setDraft({ ...EMPTY_DRAFT, direction: draft.direction });
  };

  const handleDelete = (id: string) => {
    onPersist(entries.filter(e => e.id !== id));
    if (draft.id === id) setDraft(EMPTY_DRAFT);
    showNotification('Splitwise entry removed', 'info');
  };

  return (
    <View>
      <View className="mb-3">
        <Segmented
          options={DIRECTION_OPTIONS}
          value={draft.direction}
          onChange={next => setDraft(prev => ({ ...prev, direction: next }))}
          fullWidth
        />
      </View>

      <TextInput
        placeholder="Who? e.g. Ali"
        placeholderTextColor="#78716c"
        value={draft.name}
        onChangeText={text => setDraft(prev => ({ ...prev, name: text }))}
        className="bg-app text-ink text-sm px-4 py-3.5 rounded-2xl mb-3 border border-line"
      />

      <View className="flex-row items-center bg-app rounded-2xl px-4 py-3 border border-line mb-3">
        <Text className="text-muted text-base font-semibold mr-2">{symbol}</Text>
        <TextInput
          placeholder="0"
          placeholderTextColor="#78716c"
          keyboardType="numeric"
          value={draft.amount}
          onChangeText={text => setDraft(prev => ({ ...prev, amount: text }))}
          className="flex-1 text-ink font-bold text-lg"
        />
      </View>

      <View className="flex-row gap-3">
        {isEditing && (
          <TouchableOpacity
            onPress={() => setDraft(EMPTY_DRAFT)}
            className="flex-1 py-3.5 rounded-2xl items-center bg-elevated active:bg-faint"
          >
            <Text className="text-ink text-sm font-bold uppercase tracking-wider">
              Cancel
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleSave}
          className="flex-1 py-3.5 rounded-2xl items-center"
          style={{ backgroundColor: SPLITWISE_COLOR[draft.direction] }}
          activeOpacity={0.85}
        >
          <Text className="text-white text-sm font-bold uppercase tracking-wider">
            {isEditing ? 'Update Entry' : 'Add Entry'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Deliberately styled unlike the budget cards — these are debts, not
          money you can spend, and the caption says so. */}
      <View
        className="bg-app rounded-2xl p-4 border mt-4 mb-3"
        style={{ borderColor: `${SPLITWISE_COLOR.owes_you}33` }}
      >
        <View className="flex-row">
          <View className="flex-1">
            <Text className="text-muted text-[10px] font-semibold uppercase tracking-widest mb-1">
              Owed to you
            </Text>
            <Text
              className="text-base font-bold tracking-tight"
              style={{ color: SPLITWISE_COLOR.owes_you }}
            >
              {format(totals.owes_you)}
            </Text>
          </View>
          <View className="flex-1 items-end">
            <Text className="text-muted text-[10px] font-semibold uppercase tracking-widest mb-1">
              You owe
            </Text>
            <Text
              className="text-base font-bold tracking-tight"
              style={{ color: SPLITWISE_COLOR.you_owe }}
            >
              {format(totals.you_owe)}
            </Text>
          </View>
        </View>
        <View className="h-px bg-line my-2.5" />
        <View className="flex-row items-center justify-between">
          <Text className="text-muted text-[10px] font-semibold uppercase tracking-widest">
            {totals.net >= 0 ? 'Net in your favour' : 'Net you owe'}
          </Text>
          <Text className="text-ink text-sm font-bold tracking-tight">
            {format(Math.abs(totals.net))}
          </Text>
        </View>
        <Text className="text-muted text-[10px] font-semibold uppercase tracking-widest mt-2.5">
          Tracked separately — not part of your budget
        </Text>
      </View>

      {entries.length === 0 ? (
        <Text className="text-muted text-xs text-center py-3">
          No splits yet. Add who owes you or what you owe.
        </Text>
      ) : (
        entries.map(entry => (
          <View
            key={entry.id}
            className={`flex-row items-center bg-app rounded-2xl px-3 py-2.5 border mb-2 ${
              draft.id === entry.id ? '' : 'border-line'
            }`}
            style={
              draft.id === entry.id
                ? { borderColor: SPLITWISE_COLOR[entry.direction] }
                : undefined
            }
          >
            <Text className="text-xs mr-2">{SPLITWISE_ICON[entry.direction]}</Text>
            <View className="flex-1 mr-2">
              <Text className="text-ink text-sm font-semibold" numberOfLines={1}>
                {entry.name}
              </Text>
              <Text
                className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: SPLITWISE_COLOR[entry.direction] }}
              >
                {SPLITWISE_LABEL[entry.direction]}
              </Text>
            </View>
            <Text
              className="text-sm font-bold tracking-tight mr-3"
              style={{ color: SPLITWISE_COLOR[entry.direction] }}
            >
              {format(entry.amount)}
            </Text>
            <TouchableOpacity
              onPress={() =>
                setDraft({
                  id: entry.id,
                  name: entry.name,
                  amount: String(entry.amount),
                  direction: entry.direction,
                })
              }
              className="w-7 h-7 rounded-full bg-elevated items-center justify-center mr-1.5 active:bg-faint"
            >
              <FontAwesome name="pencil" size={10} color="#a8a29e" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(entry.id)}
              className="w-7 h-7 rounded-full bg-elevated items-center justify-center active:bg-faint"
            >
              <FontAwesome name="times" size={10} color="#f87171" />
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
}
