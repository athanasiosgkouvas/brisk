import { create } from "zustand";

import type { RecentRecipient } from "@/services/storage/prefsStorage";

// Recent P2P recipients for the current account (one-tap re-send). `loadedFor`
// records which owner address the list belongs to, so switching accounts reloads.
type RecentsStore = {
  recents: RecentRecipient[];
  loadedFor: string | null;
  setRecents: (owner: string, recents: RecentRecipient[]) => void;
  reset: () => void;
};

export const useRecentsStore = create<RecentsStore>((set) => ({
  recents: [],
  loadedFor: null,
  setRecents: (owner, recents) => set({ recents, loadedFor: owner }),
  reset: () => set({ recents: [], loadedFor: null }),
}));
