import { isOnline } from './online';

interface Mutationish {
  mutate: (vars: any) => void;
  mutateAsync: (vars: any) => Promise<any>;
}

// Offline-first write dispatch for handlers that `await` a mutation.
//
// With networkMode 'online', mutateAsync() stays *pending* until reconnect when
// offline — which would hang an `await`ing handler (stuck spinner, modal never
// closes). So: when offline we fire-and-forget (the onMutate optimistic update
// already updated the cache) and resolve immediately with the optimistic result;
// when online we await the real server round-trip so genuine errors still surface.
export function runWrite<T>(mutation: Mutationish, vars: any, optimisticResult?: T): Promise<T> {
  if (isOnline()) {
    return mutation.mutateAsync(vars).then(() => optimisticResult as T);
  }
  mutation.mutate(vars);
  return Promise.resolve(optimisticResult as T);
}
