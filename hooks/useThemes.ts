import { useQuery } from "@tanstack/react-query";

import { fetchActiveThemes, type ThemeBlurb } from "@/services/api/backendApi";

/**
 * Themes are curated weekly bundles served by the backend (see
 * backend/src/indexer/themes.ts). Polled every 60s; the underlying market
 * sets refresh as the indexer ingests new oracles.
 */
export function useThemes() {
  const query = useQuery({
    queryKey: ["themes-active"],
    queryFn: fetchActiveThemes,
    staleTime: 30_000,
    refetchInterval: 60_000,
    gcTime: 5 * 60_000,
  });

  return {
    themes: (query.data ?? []) as ThemeBlurb[],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
