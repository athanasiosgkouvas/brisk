import { create } from "zustand";

export type EarnHistoryEntry = {
  timestamp: number;
  kind: "deposit" | "withdraw";
  dusdcMicro: number;
  plpMicro: number;
  digest: string;
};

type EarnHistoryStore = {
  entries: EarnHistoryEntry[];
  addEntry: (entry: EarnHistoryEntry) => void;
  setEntries: (entries: EarnHistoryEntry[]) => void;
  reset: () => void;
};

export const useEarnHistoryStore = create<EarnHistoryStore>((set) => ({
  entries: [],
  addEntry: (entry) =>
    set((state) => ({
      entries: [entry, ...state.entries].slice(0, 200),
    })),
  setEntries: (entries) => set({ entries }),
  reset: () => set({ entries: [] }),
}));

/**
 * Cost basis (in dUSDC micros) for the user's current PLP balance.
 * Deposits add to cost; withdrawals subtract proportionally based on the
 * net PLP balance at the time of withdrawal. We use a simple FIFO model:
 * each withdrawal is treated as a redemption of cost basis equal to
 * (plp_withdrawn / plp_balance_at_withdraw) * cost_basis_before.
 *
 * Returned as a sum over all events; callers pair this with the live PLP
 * value to compute unrealized PnL.
 */
export function costBasisFromHistory(entries: EarnHistoryEntry[]): {
  costBasisMicro: number;
  plpHeldMicro: number;
} {
  let costBasis = 0;
  let plpHeld = 0;
  // Walk forward chronologically.
  const chronological = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  for (const entry of chronological) {
    if (entry.kind === "deposit") {
      costBasis += entry.dusdcMicro;
      plpHeld += entry.plpMicro;
    } else {
      if (plpHeld <= 0) continue;
      const burnRatio = Math.min(entry.plpMicro / plpHeld, 1);
      costBasis -= Math.floor(costBasis * burnRatio);
      plpHeld -= entry.plpMicro;
      if (plpHeld < 0) plpHeld = 0;
    }
  }
  return { costBasisMicro: Math.max(costBasis, 0), plpHeldMicro: Math.max(plpHeld, 0) };
}
