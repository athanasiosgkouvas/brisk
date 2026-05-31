import { useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Nfc, Coins, PiggyBank, ShieldCheck } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { useAuth } from "@/hooks/useAuth";

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

export default function WelcomeRoute() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { status, errorMessage, login, session } = useAuth();
  const [page, setPage] = useState(0);
  const loading = status === "loading" || !!session;

  const onPress = async () => {
    try {
      await login();
      router.replace("/");
    } catch {
      // surfaced via errorMessage
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-brisk-bg0">
      <Text className="mt-6 text-center text-xl font-bold tracking-[2px] text-brisk-accent">
        BRISK
      </Text>

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        className="flex-1"
      >
        {SLIDES.map(({ Icon, title, body }) => (
          <View key={title} style={{ width }} className="flex-1 items-center justify-center px-10">
            <Icon color="#00D98B" size={88} strokeWidth={1.5} />
            <Text className="mt-10 text-center text-3xl font-bold text-brisk-text">{title}</Text>
            <Text className="mt-3 text-center text-base leading-6 text-brisk-subtext">{body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View className="mb-6 flex-row justify-center gap-2">
        {SLIDES.map((s, i) => (
          <View
            key={s.title}
            className={`h-2 rounded-full ${i === page ? "w-6 bg-brisk-accent" : "w-2 bg-[#2C3E55]"}`}
          />
        ))}
      </View>

      <View className="px-6 pb-4">
        <PrimaryButton
          label={loading ? "Connecting…" : "Continue with Google"}
          onPress={onPress}
          loading={loading}
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
    </SafeAreaView>
  );
}
