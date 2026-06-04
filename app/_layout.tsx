import { Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import "../global.css";

import { AppProviders } from "@/components/common/AppProviders";
import { useAuth } from "@/hooks/useAuth";
import { usePaymentLinkRouting } from "@/hooks/usePaymentLinkRouting";
import { BRISK } from "@/theme/tokens";

// Hold the native splash until auth + fonts are both ready. We deliberately
// don't hide on font-load alone — letting the splash linger through auth
// restore (≈100-400 ms after fonts) avoids the "Welcome screen flashes for
// 200ms before the home tab takes over" jank on warm starts.
SplashScreen.preventAutoHideAsync().catch(() => {
  // already prevented or unsupported on web — non-fatal
});

function RootNavigator({ readyToReveal }: { readyToReveal: () => void }) {
  const { session, hydrated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Route incoming payment-link deep links to the one-tap confirm screen.
  usePaymentLinkRouting();

  useEffect(() => {
    if (!hydrated) return;
    readyToReveal();

    if (!session && pathname !== "/welcome") {
      router.replace("/welcome");
      return;
    }

    if (session && pathname === "/welcome") {
      router.replace("/");
    }
  }, [hydrated, pathname, readyToReveal, router, session]);

  if (!hydrated) return null;

  return (
    <>
      <StatusBar style="light" backgroundColor={BRISK.bg0} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: { backgroundColor: BRISK.bg0 },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="receive" options={{ presentation: "modal" }} />
        <Stack.Screen name="send" options={{ presentation: "modal" }} />
        <Stack.Screen name="pay-link" options={{ presentation: "modal" }} />
        <Stack.Screen name="links" options={{ presentation: "modal" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  const hideSplash = () => {
    void SplashScreen.hideAsync().catch(() => {
      // already hidden or unsupported — ignore
    });
  };

  // Safety: if auth somehow never hydrates (rare; storage error), drop the
  // splash after 2.5s so the user isn't stuck on it.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(hideSplash, 2_500);
    return () => clearTimeout(t);
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AppProviders>
      <RootNavigator readyToReveal={hideSplash} />
    </AppProviders>
  );
}
