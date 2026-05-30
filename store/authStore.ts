import { create } from "zustand";

import type { AuthSession } from "@/types/user";

type AuthStore = {
  session: AuthSession | null;
  managerId: string | null;
  /** The user's shared DeepBook BalanceManager id (for maker/limit orders). */
  deepbookManagerId: string | null;
  status: "idle" | "loading" | "authenticated" | "error";
  errorMessage: string | null;
  hydrated: boolean;
  setSession: (session: AuthSession | null) => void;
  setManagerId: (managerId: string | null) => void;
  setDeepbookManagerId: (id: string | null) => void;
  setStatus: (status: AuthStore["status"]) => void;
  setErrorMessage: (message: string | null) => void;
  setHydrated: (hydrated: boolean) => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  managerId: null,
  deepbookManagerId: null,
  status: "idle",
  errorMessage: null,
  hydrated: false,
  setSession: (session) => set({ session, status: session ? "authenticated" : "idle" }),
  setManagerId: (managerId) => set({ managerId }),
  setDeepbookManagerId: (deepbookManagerId) => set({ deepbookManagerId }),
  setStatus: (status) => set({ status }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setHydrated: (hydrated) => set({ hydrated }),
}));
