import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { Nfc, Coins, PiggyBank, ShieldCheck, type LucideIcon } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { AuroraText } from "@/components/ui/AuroraText";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { useAuth } from "@/hooks/useAuth";
import { BRISK } from "@/theme/tokens";

const SLIDES = [
  {
    Icon: Nfc,
    title: "Tap to pay",
    body: "Tap your phone to pay in stablecoins — as easy as Apple Pay, on open rails.",
  },
  {
    Icon: Coins,
    title: "No gas. No fees.",
    body: "You're charged the exact amount. Brisk never takes a cut of your payments.",
  },
  {
    Icon: PiggyBank,
    title: "Idle dollars earn",
    body: "Move spare USDC to Save and earn yield — and spend straight from it anytime.",
  },
  {
    Icon: ShieldCheck,
    title: "Your keys, your money",
    body: "Self-custodial from a Google sign-in. No seed phrase, no bank, no middleman.",
  },
];

// A lucide icon filled with the aurora gradient (mask = the icon's strokes).
function AuroraIcon({ Icon }: { Icon: LucideIcon }) {
  return (
    <MaskedView
      style={{ width: 88, height: 88 }}
      maskElement={
        <View style={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
          <Icon color="#000" size={88} strokeWidth={1.5} />
        </View>
      }
    >
      <LinearGradient
        colors={BRISK.aurora}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      />
    </MaskedView>
  );
}

export default function WelcomeRoute() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { status, errorMessage, login, session } = useAuth();
  const [page, setPage] = useState(0);
  // Drive the overlay from GLOBAL auth state, not local state: the Welcome
  // screen remounts when the OAuth webview returns, which would reset any local
  // flag. `status === "loading"` is set by login() and lives in the store, so it
  // survives the remount and covers the whole post-redirect zkLogin window. No
  // cold-start flash: Welcome only renders after auth has hydrated (see _layout).
  const busy = status === "loading" || !!session;

  const onPress = async () => {
    try {
      await login();
      router.replace("/");
    } catch {
      // surfaced via errorMessage
    }
  };

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top", "bottom"]} className="flex-1">
          <View className="mt-6 flex-row items-center justify-center gap-2">
            <Image
              source={require("../assets/images/icon.png")}
              style={{ width: 26, height: 26, borderRadius: 6 }}
            />
            <AuroraText className="text-center text-xl font-inter-extrabold tracking-[2px]">
              BRISK
            </AuroraText>
          </View>

          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            className="flex-1"
          >
            {SLIDES.map(({ Icon, title, body }) => (
              <View
                key={title}
                style={{ width }}
                className="flex-1 items-center justify-center px-10"
              >
                <AuroraIcon Icon={Icon} />
                <Text className="mt-10 text-center text-3xl font-inter-extrabold text-brisk-text">
                  {title}
                </Text>
                <Text className="mt-3 text-center text-base leading-6 text-brisk-subtext">
                  {body}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Dots */}
          <View className="mb-6 flex-row items-center justify-center gap-2">
            {SLIDES.map((s, i) =>
              i === page ? (
                <LinearGradient
                  key={s.title}
                  colors={BRISK.aurora}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={{ width: 24, height: 8, borderRadius: 4 }}
                />
              ) : (
                <View key={s.title} className="h-2 w-2 rounded-full bg-brisk-borderStrong" />
              ),
            )}
          </View>

          <View className="px-6 pb-4">
            <PrimaryButton
              label={busy ? "Connecting…" : "Continue with Google"}
              onPress={onPress}
              loading={busy}
            />
            {errorMessage ? (
              <View className="mt-3">
                <ErrorBanner message={errorMessage} />
              </View>
            ) : null}
            <Text className="mt-3 text-center text-xs text-brisk-subtext">
              No seed phrase. No gas. Just pay.
            </Text>
          </View>

          {/* Full-screen overlay while signing in — covers the post-redirect zkLogin
              work so the user knows to wait, not that the app is stuck. */}
          {busy ? (
            <View
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
              className="bg-brisk-bg0"
            >
              <AuroraBackground>
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator color={BRISK.accent} size="large" />
                  <Text className="mt-5 text-lg font-inter-semibold text-brisk-text">
                    Signing you in…
                  </Text>
                  <Text className="mt-1 text-sm text-brisk-subtext">
                    Creating your self-custodial wallet
                  </Text>
                </View>
              </AuroraBackground>
            </View>
          ) : null}
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
