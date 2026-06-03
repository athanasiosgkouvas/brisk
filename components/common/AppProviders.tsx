import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { useEffect, useMemo } from "react";
import { Text, TextInput } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppErrorBoundary } from "@/components/common/AppErrorBoundary";
import { initAnalytics, trackEvent } from "@/services/analytics/analyticsService";
import { initErrorTracking } from "@/services/monitoring/errorService";

// Make Inter the default for every Text/TextInput. RN won't synthesize Inter
// from a fontWeight utility, so body text inherits Inter_400Regular here and
// heavier text opts in via the font-inter-* family classes (see tailwind.config).
const TextWithDefault = Text as unknown as { defaultProps?: { style?: unknown } };
TextWithDefault.defaultProps = {
  ...TextWithDefault.defaultProps,
  style: [{ fontFamily: "Inter_400Regular" }, TextWithDefault.defaultProps?.style],
};
const InputWithDefault = TextInput as unknown as { defaultProps?: { style?: unknown } };
InputWithDefault.defaultProps = {
  ...InputWithDefault.defaultProps,
  style: [{ fontFamily: "Inter_400Regular" }, InputWithDefault.defaultProps?.style],
};

function BootstrapStores() {
  useEffect(() => {
    initAnalytics();
    initErrorTracking();
    void trackEvent("app_open");
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
