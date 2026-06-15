import { create } from "zustand";

import type { Invoice } from "@/services/blockchain/paymentTx";

// A deep link captured on launch (brisk://pay?… or brisk://claim?…), held until
// the app is ready to show the right screen. A short `code` is resolved via the
// backend; an `invoice` is self-contained (NFC-tag form); a `claim` opens the
// gift-card claim flow. Survives a sign-in detour so a cold-start link resumes
// after the user authenticates.
export type PendingPayment =
  | { kind: "code"; code: string }
  | { kind: "invoice"; invoice: Invoice }
  | { kind: "claim"; cardId: string; code?: string; secret?: string }
  | { kind: "buy"; merchantId: string; name?: string };

type PendingPaymentStore = {
  pending: PendingPayment | null;
  setPending: (pending: PendingPayment | null) => void;
  clear: () => void;
};

export const usePendingPaymentStore = create<PendingPaymentStore>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));
