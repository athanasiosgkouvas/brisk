import { create } from "zustand";

import type { Invoice } from "@/services/blockchain/paymentTx";

// A payment captured from an incoming deep link (brisk://pay?…), held until the
// app is ready to show the confirm screen. A short `code` is resolved via the
// backend; an `invoice` is self-contained (NFC-tag form). Survives a sign-in
// detour so a cold-start link resumes after the user authenticates.
export type PendingPayment = { kind: "code"; code: string } | { kind: "invoice"; invoice: Invoice };

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
