import { useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";

/**
 * Re-run `refresh` every time the screen regains focus (e.g. switching tabs).
 * Tab screens stay mounted under the navigator, so a plain mount effect fires
 * only once — this is what keeps balances/activity live when you come back to a
 * tab (e.g. the Wallet's Save figure after a withdraw on the Save tab).
 */
export function useRefreshOnFocus(refresh: () => void | Promise<void>): void {
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
}
