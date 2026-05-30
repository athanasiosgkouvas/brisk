import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { useEffect, useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppErrorBoundary } from "@/components/common/AppErrorBoundary";
import { useEarnHistoryPersistence } from "@/hooks/useEarnHistoryPersistence";
import { usePortfolioPersistence } from "@/hooks/usePortfolioPersistence";
import { useSettingsPersistence } from "@/hooks/useSettingsPersistence";
import { initAnalytics, trackEvent } from "@/services/analytics/analyticsService";
import { initErrorTracking } from "@/services/monitoring/errorService";
import { hydrateEarnVaultCache } from "@/services/storage/earnVaultCache";

function BootstrapStores() {
  usePortfolioPersistence();
  useSettingsPersistence();
  useEarnHistoryPersistence();
  useEffect(() => {
    initAnalytics();
    initErrorTracking();
    void trackEvent("app_open");
    void hydrateEarnVaultCache();
  }, []);
  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 1,
          },
        },
      }),
    [],
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <BootstrapStores />
            {children}
          </QueryClientProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
