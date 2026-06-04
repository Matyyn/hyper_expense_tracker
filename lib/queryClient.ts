import { QueryClient } from '@tanstack/react-query';

// Shared QueryClient instance.
// Lives in its own module (not inline in _layout) so the offline mutation
// registry (lib/offlineMutations.ts) and the persistence provider operate on
// the exact same client — required for setMutationDefaults + resumePausedMutations
// to find the paused writes restored from disk.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 3,
      gcTime: 1000 * 60 * 10,
      retry: 2,
    },
    mutations: {
      // Reconnect can flap; retry a few times before surfacing an error.
      retry: 3,
    },
  },
});

// Query-key roots that are safe + useful to persist to disk for offline reads.
// Anything not listed is kept in-memory only (keeps the AsyncStorage blob small —
// Android's AsyncStorage is ~6 MB total).
export const PERSISTED_QUERY_ROOTS = new Set<string>([
  'expenses',
  'expenses-history',
  'profile',
  'categories',
  'quick_templates',
  'loans',
  'loans_raw',
  'loan_payments_all',
  'loan_payments',
  'metadata',
]);
