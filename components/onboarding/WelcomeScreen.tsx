import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { ArrowRight, Lock, Sparkles, Zap } from "lucide-react-native";

import { ErrorBanner } from "@/components/common/ErrorBanner";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { hapticButtonPress, hapticSwipeReleaseYes } from "@/utils/haptics";

type Props = {
  loading: boolean;
  onPress: () => void;
  errorMessage?: string | null;
};

type Slide = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  Visual: React.FC;
};

const slides: Slide[] = [
  {
    id: "swipe",
    eyebrow: "Live markets, one gesture",
    title: "Swipe to bet.",
    subtitle:
      "Real DeepBook Predict markets on Sui. Right for YES, left for NO. Settled on-chain, paid out in dUSDC.",
    Visual: SwipeVisual,
  },
  {
    id: "wallet-free",
    eyebrow: "No wallet popups, no gas",
    title: "Sign in once.",
    subtitle:
      "zkLogin keeps helps you sing-on with your email - no private key management on your side. We sponsor every transaction. You stay in self-custody — nothing else feels like this.",
    Visual: WalletFreeVisual,
  },
  {
    id: "composability",
    eyebrow: "DeepBook composability",
    title: "Smart Bet, one PTB.",
    subtitle:
      "Every Smart Bet swipe ships a single sponsored transaction that calls Predict AND DeepBook Spot. Two protocols, one digest, atomic.",
    Visual: ComposabilityVisual,
  },
];

export function WelcomeScreen({ loading, onPress, errorMessage }: Props) {
  const { width } = Dimensions.get("window");
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === slides.length - 1;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) {
      setIndex(next);
      void hapticSwipeReleaseYes();
    }
  };

  const advance = () => {
    void hapticButtonPress();
    if (isLast) {
      onPress();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  const skip = () => {
    void hapticButtonPress();
    listRef.current?.scrollToIndex({ index: slides.length - 1, animated: true });
  };

  // While the browser OAuth round-trip is in flight (and during the brief
  // window between session-set and the router redirecting away), render a
  // full-screen "finishing sign-in" state instead of the carousel underneath.
  // The auth state machine only flips `loading=true` once `login()` starts,
  // so this is exclusively the sign-in completion moment — no risk of
  // hiding the carousel on cold boot (the splash holds for that).
  if (loading && !errorMessage) {
    return <SignInCompleting />;
  }

  return (
    <SafeAreaView className="flex-1 bg-fathom-bg0">
      <View className="flex-row items-center justify-between px-5 pt-3">
        <Animated.View entering={FadeInDown.duration(300)} className="flex-row items-center gap-2">
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: "#0F231E",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "#1F4538",
            }}
          >
            <Text style={{ color: "#00D98B", fontWeight: "800", fontSize: 16 }}>F</Text>
          </View>
          <Text className="text-[11px] uppercase tracking-[2px] text-fathom-subtext">Fathom</Text>
        </Animated.View>
        {!isLast ? (
          <Pressable
            onPress={skip}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            hitSlop={12}
          >
            <Text className="text-[12px] font-semibold uppercase tracking-[1.5px] text-fathom-subtext">
              Skip
            </Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        renderItem={({ item }) => (
          <View style={{ width }} className="px-5">
            <SlideContent slide={item} />
          </View>
        )}
        style={{ flex: 1 }}
      />

      <View className="px-5 pb-5">
        <View className="mb-4 flex-row items-center justify-center gap-1.5">
          {slides.map((s, i) => (
            <View
              key={s.id}
              style={{
                width: i === index ? 22 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === index ? "#00D98B" : "#1F3145",
              }}
            />
          ))}
        </View>
        <PrimaryButton
          label={loading ? "Setting up your wallet…" : isLast ? "Continue with Google" : "Next"}
          loading={loading}
          onPress={advance}
        />
        {errorMessage ? (
          <View className="mt-3">
            <ErrorBanner message={errorMessage} />
          </View>
        ) : null}
        <Text className="mt-3 text-center text-[10px] leading-4 text-fathom-subtext">
          By continuing you accept that Fathom uses sponsored execution on Sui testnet. No seed
          phrases. Self-custody preserved via zkLogin.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function SlideContent({ slide }: { slide: Slide }) {
  const { Visual } = slide;
  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      className="flex-1 items-center justify-center gap-8"
    >
      <View className="h-[280px] w-full items-center justify-center">
        <Visual />
      </View>
      <View className="w-full">
        <Animated.Text
          entering={FadeInUp.duration(360).delay(80)}
          className="text-[11px] uppercase tracking-[2px] text-fathom-bull"
        >
          {slide.eyebrow}
        </Animated.Text>
        <Animated.Text
          entering={FadeInUp.duration(420).delay(140)}
          className="mt-3 text-[34px] font-bold leading-[40px] tracking-tight text-fathom-text"
        >
          {slide.title}
        </Animated.Text>
        <Animated.Text
          entering={FadeInUp.duration(420).delay(220)}
          className="mt-3 text-[15px] leading-6 text-fathom-subtext"
        >
          {slide.subtitle}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

// ─── Sign-in completion state ────────────────────────────────────────────

/**
 * Bridges the OAuth round-trip + redirect lag. The Welcome route stays
 * mounted while:
 *   1. The browser custom-tab is open (loading=true).
 *   2. zkLogin proof is being fetched + persisted (still loading=true).
 *   3. status flips to "authenticated" and the router redirect to "/" runs
 *      on the next render tick.
 *
 * Without this screen the user sees the onboarding carousel for the entire
 * window — feels broken. With it, the experience is: tap Continue → splash-
 * style brand mark with a breathing pulse → home tab.
 */
function SignInCompleting() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.4,
    transform: [{ scale: 0.92 + pulse.value * 0.18 }],
  }));

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.98 + pulse.value * 0.04 }],
  }));

  return (
    <SafeAreaView className="flex-1 bg-fathom-bg0 items-center justify-center px-8">
      <View className="items-center">
        <Animated.View
          style={[
            ringStyle,
            {
              position: "absolute",
              width: 180,
              height: 180,
              borderRadius: 90,
              borderWidth: 2,
              borderColor: "#00D98B",
              opacity: 0.5,
            },
          ]}
        />
        <Animated.View
          style={[
            markStyle,
            {
              width: 96,
              height: 96,
              borderRadius: 24,
              backgroundColor: "#0F231E",
              borderWidth: 1,
              borderColor: "#1F4538",
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
        >
          <Text style={{ color: "#00D98B", fontSize: 52, fontWeight: "800" }}>F</Text>
        </Animated.View>
      </View>
      <Animated.Text
        entering={FadeInUp.duration(280).delay(120)}
        className="mt-10 text-[11px] uppercase tracking-[2px] text-fathom-bull"
      >
        Finishing sign-in
      </Animated.Text>
      <Animated.Text
        entering={FadeInUp.duration(360).delay(200)}
        className="mt-3 text-center text-xl font-bold text-fathom-text"
      >
        Verifying your zkLogin proof
      </Animated.Text>
      <Animated.Text
        entering={FadeInUp.duration(360).delay(320)}
        className="mt-3 text-center text-[13px] leading-5 text-fathom-subtext"
      >
        We&apos;re wrapping your Google sign-in into a zkLogin signature on-device. No keys leave
        your phone. Almost there…
      </Animated.Text>
    </SafeAreaView>
  );
}

// ─── Visuals ──────────────────────────────────────────────────────────────

function SwipeVisual() {
  const offset = useSharedValue(-12);
  useEffect(() => {
    offset.value = withRepeat(
      withTiming(12, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(offset);
  }, [offset]);

  const animatedTop = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }, { rotate: `${offset.value / 4}deg` }],
  }));

  return (
    <View className="h-[240px] w-[260px] items-center justify-center">
      {/* Back card */}
      <View
        className="absolute h-[220px] w-[210px] rounded-3xl border border-[#1F3145] bg-fathom-bg1"
        style={{ transform: [{ translateX: -28 }, { translateY: 16 }, { rotate: "-6deg" }] }}
      />
      {/* Front card */}
      <Animated.View
        style={animatedTop}
        className="h-[230px] w-[220px] rounded-3xl border border-[#27415A] bg-fathom-bg2 p-5"
      >
        <View className="self-start rounded-full border border-[#1F4538] bg-[#0F231E] px-3 py-1">
          <Text className="text-[10px] uppercase tracking-wide text-fathom-bull">SUI · Crypto</Text>
        </View>
        <Text className="mt-4 text-base font-bold leading-5 text-fathom-text">
          SUI &gt; $3.50 by close?
        </Text>
        <Text className="mt-1 text-[11px] text-fathom-subtext">Expiry in 14h</Text>
        <View className="mt-auto flex-row items-center justify-between">
          <View className="h-12 w-12 items-center justify-center rounded-full border border-fathom-bear bg-[#2A151F]">
            <Text className="text-xs font-bold text-fathom-bear">NO</Text>
          </View>
          <View className="h-12 w-12 items-center justify-center rounded-full border border-fathom-bull bg-[#0F231E]">
            <Text className="text-xs font-bold text-fathom-bull">YES</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

function WalletFreeVisual() {
  return (
    <View className="h-[240px] w-[260px] items-center justify-center">
      <Animated.View
        entering={FadeIn.duration(280).delay(120)}
        className="rounded-[28px] border border-[#27415A] bg-fathom-bg1 px-7 py-8"
      >
        <View className="flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white">
            <Text style={{ color: "#4285F4", fontWeight: "800", fontSize: 22 }}>G</Text>
          </View>
          <View>
            <Text className="text-[10px] uppercase tracking-[2px] text-fathom-subtext">
              Sign-in
            </Text>
            <Text className="mt-0.5 text-sm font-semibold text-fathom-text">
              Continue with Google
            </Text>
          </View>
        </View>
        <View className="mt-5 flex-row items-center gap-2 rounded-2xl border border-[#1F3145] bg-fathom-bg2 px-3 py-2">
          <Lock size={14} color="#00D98B" />
          <Text className="flex-1 text-[11px] text-fathom-text">
            frictionless sing-in with zkLogin
          </Text>
        </View>
        <View className="mt-2 flex-row items-center gap-2 rounded-2xl border border-[#1F3145] bg-fathom-bg2 px-3 py-2">
          <Sparkles size={14} color="#56C2FF" />
          <Text className="flex-1 text-[11px] text-fathom-text">
            With sponsored transactions — you sign, we pay
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

function ComposabilityVisual() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + pulse.value * 0.4,
    transform: [{ scale: 0.95 + pulse.value * 0.1 }],
  }));

  return (
    <View className="h-[240px] w-[260px] items-center justify-center">
      <View className="flex-row items-center" style={{ gap: -36 }}>
        <Animated.View
          style={[
            ringStyle,
            {
              height: 110,
              width: 110,
              borderRadius: 60,
              borderWidth: 2,
              borderColor: "#00D98B",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#0F231E",
            },
          ]}
        >
          <Text className="text-[10px] font-bold uppercase tracking-[1.5px] text-fathom-bull">
            Predict
          </Text>
          <Text className="mt-1 text-[10px] text-fathom-subtext">mint</Text>
        </Animated.View>
        <Animated.View
          style={[
            ringStyle,
            {
              height: 110,
              width: 110,
              borderRadius: 60,
              borderWidth: 2,
              borderColor: "#4DA2FF",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#0F1B2A",
            },
          ]}
        >
          <Text
            className="text-[10px] font-bold uppercase tracking-[1.5px]"
            style={{ color: "#4DA2FF" }}
          >
            DeepBook
          </Text>
          <Text className="mt-1 text-[10px] text-fathom-subtext">swap</Text>
        </Animated.View>
      </View>
      <View className="mt-5 flex-row items-center gap-2 rounded-2xl border border-[#27415A] bg-fathom-bg1 px-3 py-2">
        <Zap size={12} color="#00D98B" />
        <Text className="text-[11px] font-semibold text-fathom-text">One sponsored PTB</Text>
        <ArrowRight size={12} color="#8B98A5" />
        <Text className="text-[11px] text-fathom-subtext">on-chain digest</Text>
      </View>
    </View>
  );
}
