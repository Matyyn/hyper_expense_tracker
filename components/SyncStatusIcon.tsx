import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { onlineManager, useMutationState, useIsRestoring } from '@tanstack/react-query';
import { useTheme } from './ThemeProvider';

// Minimal, non-intrusive sync indicator (no banner, no counts):
//  - offline (with or without pending writes) → muted cloud-slash
//  - online + writes still flushing           → small spinner
//  - online + nothing pending                 → renders nothing
export function SyncStatusIcon({ size = 16 }: { size?: number }) {
  const { colors } = useTheme();
  const isRestoring = useIsRestoring();
  const [online, setOnline] = useState(onlineManager.isOnline());

  useEffect(() => onlineManager.subscribe(setOnline), []);

  // Writes that are queued offline (paused) or actively flushing on reconnect.
  const pending = useMutationState({
    filters: { predicate: (m) => m.state.isPaused || m.state.status === 'pending' },
  }).length;

  if (!online) {
    return (
      <View accessibilityLabel="Offline — changes will sync">
        <FontAwesome name="cloud" size={size} color={colors.faint} />
      </View>
    );
  }

  if (isRestoring || pending > 0) {
    return (
      <View accessibilityLabel="Syncing changes">
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  return null;
}
