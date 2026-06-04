import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '../components/AuthProvider';

// Effective auth user_metadata, read through react-query so offline edits show
// instantly and survive a restart. AuthProvider seeds ['metadata', userId] from
// the session (server truth) and reseeds it on USER_UPDATED. We never invalidate
// it (no server queryFn) — optimistic patches written by the ['updateMetadata']
// offline mutation stay until the next reseed.
export function useUserMetadata(): Record<string, any> {
  const { user } = useAuth();
  const userId = user?.id;
  const { data } = useQuery<Record<string, any>>({
    queryKey: ['metadata', userId],
    queryFn: async () => user?.user_metadata ?? {},
    enabled: !!userId,
    staleTime: Infinity,
    gcTime: Infinity,
    initialData: user?.user_metadata ?? {},
  });
  return data ?? {};
}

// Queue a shallow metadata patch (last-write-wins per top-level key). Works
// offline; flushes to supabase.auth.updateUser on reconnect.
export function useUpdateMetadata() {
  const { user } = useAuth();
  const userId = user?.id;
  const mutation = useMutation<unknown, unknown, any>({ mutationKey: ['updateMetadata'] });
  return {
    updateMetadata: (patch: Record<string, any>) => mutation.mutate({ userId, patch }),
    updateMetadataAsync: (patch: Record<string, any>) =>
      mutation.mutateAsync({ userId, patch }),
    isPending: mutation.isPending,
  };
}
