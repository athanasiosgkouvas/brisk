import { create } from "zustand";

import type { AuthSession } from "@/types/user";

type AuthStore = {
  session: AuthSession | null;
  status: "idle" | "loading" | "authenticated" | "error";
  errorMessage: string | null;
  hydrated: boolean;
  setSession: (session: AuthSession | null) => void;
  setStatus: (status: AuthStore["status"]) => void;
  setErrorMessage: (message: string | null) => void;
  setHydrated: (hydrated: boolean) => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  status: "idle",
  errorMessage: null,
  hydrated: false,
  setSession: (session) => set({ session, status: session ? "authenticated" : "idle" }),
  setStatus: (status) => set({ status }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setHydrated: (hydrated) => set({ hydrated }),
}));
