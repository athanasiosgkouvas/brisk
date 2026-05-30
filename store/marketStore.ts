import { create } from "zustand";

import type { MarketCard } from "@/types/market";

type MarketStore = {
  markets: MarketCard[];
  setMarkets: (markets: MarketCard[]) => void;
  removeTopMarket: (marketId?: string) => void;
};

export const useMarketStore = create<MarketStore>((set) => ({
  markets: [],
  setMarkets: (markets) => set({ markets }),
  removeTopMarket: (marketId) =>
    set((state) => ({
      markets: marketId
        ? state.markets.filter((market) => market.id !== marketId)
        : state.markets.slice(1),
    })),
}));
