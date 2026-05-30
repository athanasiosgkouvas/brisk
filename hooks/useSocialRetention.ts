import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import {
  fetchSocialRetentionSummary,
  type SocialRetentionSummary,
} from "@/services/api/backendApi";

export function useSocialRetention(bucket: "day" | "week" | "month" | "all" = "week") {
  const { session } = useAuth();

  const query = useQuery({
    queryKey: ["social-retention", session?.address, bucket],
    enabled: Boolean(session?.address),
    queryFn: () => fetchSocialRetentionSummary(session!.address, bucket),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  return {
    summary: (query.data ?? null) as SocialRetentionSummary | null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
