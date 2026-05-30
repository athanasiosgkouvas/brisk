import { usePortfolioStore } from "@/store/portfolioStore";

export function usePortfolio() {
  const { history, getStats } = usePortfolioStore();

  return {
    history,
    stats: getStats(),
  };
}
