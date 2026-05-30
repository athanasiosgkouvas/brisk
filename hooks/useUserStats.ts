import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { fetchUserStats, type UserStats } from "@/services/api/backendApi";

/**
 * Indexer-derived stats for the signed-in user. Returns null until the user
 * has signed in. Polls every 30s and stays warm for 60s.
 */
export function useUserStats() {
  const { session } = useAuth();

  const query = useQuery({
    queryKey: ["user-stats", session?.address],
    enabled: Boolean(session?.address),
    queryFn: () => fetchUserStats(session!.address),
    staleTime: 30_000,
    refetchInterval: 30_000,
    gcTime: 5 * 60_000,
  });

  return {
    stats: (query.data ?? null) as UserStats | null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
