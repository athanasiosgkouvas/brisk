import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchMarketCards } from "@/services/api/predictApi";
import { getDeterministicMockMarkets } from "@/services/api/mockMarkets";
import { useMarketStore } from "@/store/marketStore";
import { ENV, REFRESH_INTERVALS } from "@/utils/constants";

export function useMarkets() {
  const { markets, setMarkets, removeTopMarket } = useMarketStore();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["markets", ENV.demoMode],
    queryFn: async () => {
      // Demo mode is the *only* place we serve mock cards. In live mode a
      // backend / Predict-server outage should surface as an empty deck + error
      // banner — never as fake markets that the user might accidentally bet on.
      if (ENV.demoMode) return getDeterministicMockMarkets();
      return fetchMarketCards();
    },
    refetchInterval: (query) =>
      (query.state.data?.length ?? 0) === 0
        ? REFRESH_INTERVALS.noMarketsMs
        : REFRESH_INTERVALS.marketRefetchMs,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  useEffect(() => {
    if (query.data) setMarkets(query.data);
  }, [query.data, setMarkets]);

  useEffect(() => {
    const nextFive = (query.data ?? markets).slice(0, 5);
    nextFive.forEach((market) => {
      queryClient.setQueryData(["market-preview", market.id], market);
    });
  }, [markets, query.data, queryClient]);

  return {
    markets: query.data ?? markets,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    removeTopMarket,
  };
}
