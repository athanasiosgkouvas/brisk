import { create } from "zustand";

// Brisk username state for the current account. `status` drives the mandatory
// gate: "needs" only after the backend explicitly reports no username (404);
// "has" otherwise (including the fail-open case on a backend error, so a blip
// never locks a user into the setup screen). `checkedAddress` records which
// address the status pertains to, so switching accounts re-checks.
export type UsernameStatus = "unknown" | "has" | "needs";

type UsernameStore = {
  handle: string | null;
  status: UsernameStatus;
  checkedAddress: string | null;
  setState: (s: {
    handle?: string | null;
    status?: UsernameStatus;
    checkedAddress?: string | null;
  }) => void;
  reset: () => void;
};

export const useUsernameStore = create<UsernameStore>((set) => ({
  handle: null,
  status: "unknown",
  checkedAddress: null,
  setState: (s) => set(s),
  reset: () => set({ handle: null, status: "unknown", checkedAddress: null }),
}));
