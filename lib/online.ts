import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

// Bridge NetInfo -> react-query's onlineManager so queries/mutations pause when
// offline and auto-resume on reconnect (with networkMode 'online', the default).
//
// `isInternetReachable` is laggy and can be null on boot or behind captive
// portals; treat null as ONLINE so we never falsely block writes at startup.
// A genuine offline state reports isConnected === false.
export function startOnlineManager() {
  onlineManager.setEventListener((setOnline) => {
    return NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
  });
}

// Synchronous read of the current online state, for gating side effects
// (e.g. skip invalidation/refetch while offline, block strictly-online actions).
export function isOnline(): boolean {
  return onlineManager.isOnline();
}
