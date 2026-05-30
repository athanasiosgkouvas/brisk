import { create } from "zustand";

export type EarnMode = "deposit" | "withdraw";

type EarnStore = {
  mode: EarnMode;
  depositInput: string;
  withdrawInput: string;
  setMode: (mode: EarnMode) => void;
  setDepositInput: (value: string) => void;
  setWithdrawInput: (value: string) => void;
  reset: () => void;
};

export const useEarnStore = create<EarnStore>((set) => ({
  mode: "deposit",
  depositInput: "",
  withdrawInput: "",
  setMode: (mode) => set({ mode }),
  setDepositInput: (depositInput) => set({ depositInput }),
  setWithdrawInput: (withdrawInput) => set({ withdrawInput }),
  reset: () => set({ depositInput: "", withdrawInput: "" }),
}));
