import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

// Disk persister for the react-query cache (offline reads) + paused mutations
// (offline writes that must survive an app restart). Exported so AuthProvider
// can purge it on sign-out — all query keys already include userId, but we wipe
// the blob anyway so a second account on the same device can't read stale data.
export const asyncPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'hyper-rq-cache',
});

// Bump when query shapes change in an incompatible way to discard old caches.
export const PERSIST_BUSTER = 'v1';
