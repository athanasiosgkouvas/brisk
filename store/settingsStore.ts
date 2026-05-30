import { create } from "zustand";

import { ENV } from "@/utils/constants";

type SettingsStore = {
  betAmount: number;
  pauseTrading: boolean;
  reminders: boolean;
  dailyLossLimitDusdc: number;
  /**
   * Smart Bet mode: every swipe builds a single sponsored PTB that calls
   * `predict::mint` AND a DeepBook Spot `pool::swap_exact_base_for_quote`
   * hedge leg on the user's SUI. Off by default so first-time users (who
   * may not hold SUI beyond gas) don't get a confusing failure mode.
   */
  smartBet: boolean;
  /** SUI to sell on DeepBook per bet, in human SUI (e.g. 0.05 = 0.05 SUI). */
  smartBetSuiNotional: number;
  setBetAmount: (amount: number) => void;
  setPauseTrading: (paused: boolean) => void;
  setReminders: (enabled: boolean) => void;
  setDailyLossLimitDusdc: (limit: number) => void;
  setSmartBet: (enabled: boolean) => void;
  setSmartBetSuiNotional: (sui: number) => void;
};

export const useSettingsStore = create<SettingsStore>((set) => ({
  betAmount: ENV.fixedBetAmount,
  pauseTrading: false,
  reminders: true,
  dailyLossLimitDusdc: 25,
  smartBet: false,
  // 1 SUI is the smallest size the SUI/DBUSDC DeepBook pool will fill on
  // testnet — verified via probe-deepbook.ts. Anything smaller returns
  // quote_out=0 because the orderbook depth is too thin.
  smartBetSuiNotional: 1,
  setBetAmount: (betAmount) => set({ betAmount }),
  setPauseTrading: (pauseTrading) => set({ pauseTrading }),
  setReminders: (reminders) => set({ reminders }),
  setDailyLossLimitDusdc: (dailyLossLimitDusdc) => set({ dailyLossLimitDusdc }),
  setSmartBet: (smartBet) => set({ smartBet }),
  setSmartBetSuiNotional: (smartBetSuiNotional) => set({ smartBetSuiNotional }),
}));
