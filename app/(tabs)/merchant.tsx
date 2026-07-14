import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Plus, Smartphone, Store } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { HeroAmount } from "@/components/ui/HeroAmount";
import { SuccessSheet } from "@/components/ui/SuccessSheet";
import { ShareSheet } from "@/components/ui/ShareSheet";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { PulseRing } from "@/components/ui/PulseRing";
import { useCharge } from "@/hooks/useCharge";
import { useTills } from "@/hooks/useTills";
import { isHceAvailable } from "@/services/nfc/hce";
import { openNfcSettings } from "@/services/nfc/reader";
import { formatUsd, usdToMicros } from "@/services/blockchain/paymentTx";
import { useTheme } from "@/hooks/useTheme";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";

// Merchant "Charge" tab. Two ways to get paid:
//  - Tap (Android/HCE): emulate the invoice tag, customer taps to read.
//  - Payment link (all platforms, incl. iOS): mint a shareable link, send it
//    over any channel, and the customer pays remotely with one tap.
// Both await on-chain settlement and flip to the same "paid" screen.
const EXPIRY_OPTIONS: { label: string; seconds: number }[] = [
  { label: "1 hour", seconds: 60 * 60 },
  { label: "24 hours", seconds: 24 * 60 * 60 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60 },
];

export default function ChargeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { status, invoice, linkUrl, error, startCharge, createLink, cancel } = useCharge();
  const { tills } = useTills();
  const bottomPad = useTabBarClearance();
  const [amountText, setAmountText] = useState("");
  const [expirySec, setExpirySec] = useState(EXPIRY_OPTIONS[1].seconds); // default 24h
  // One-time by default; when on, the link keeps accepting payments after the
  // first (backend leaves it "pending" for reusable links).
  const [reusable, setReusable] = useState(false);
  // Which receiving account this charge collects into (customers never see the
  // merchant's private treasury). Falls back to the first till until one is
  // explicitly picked — derived during render so there's no setState-in-effect.
  const [pickedTillId, setPickedTillId] = useState<string | null>(null);
  const selectedTillId = pickedTillId ?? tills[0]?.tillId ?? null;

  const amountMicros = usdToMicros(Number(amountText || "0"));
  const canCharge = amountMicros > 0 && !!selectedTillId;

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top"]} className="flex-1 px-5">
          {status === "idle" ? (
            // Charge form: top-aligned + scrollable so it never gets cut off on
            // short screens or when the keyboard is up (mirrors the Save tab).
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingTop: 24,
                paddingBottom: bottomPad,
                alignItems: "center",
              }}
            >
              <Animated.View
                entering={FadeIn.duration(300)}
                className="w-full max-w-[360px] items-center"
              >
                <Store color={theme.accent} size={56} />
                <Text className="mt-6 text-2xl font-inter-bold text-brisk-text">Charge</Text>
                <Text className="mt-2 text-center text-sm text-brisk-subtext">
                  {isHceAvailable
                    ? "Enter the amount — have the customer tap, or send a payment link."
                    : "Enter the amount, then send the customer a payment link to pay."}
                </Text>
                {/* Receiving account picker — funds collect here, then sweep to
                    the private treasury. Customers only ever see this till. */}
                <View className="mt-6 w-full">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs uppercase tracking-[2px] text-brisk-subtext">
                      Collect into
                    </Text>
                    <Pressable onPress={() => router.push("/tills")} hitSlop={8}>
                      <Text className="text-xs font-inter-semibold text-brisk-accent">Manage</Text>
                    </Pressable>
                  </View>
                  {tills.length === 0 ? (
                    <Pressable
                      onPress={() => router.push("/tills")}
                      className="mt-2 flex-row items-center justify-center rounded-xl border border-brisk-borderStrong bg-brisk-bg1/70 px-3 py-3"
                    >
                      <Plus color={theme.accent} size={16} />
                      <Text className="ml-2 text-sm font-inter-semibold text-brisk-accent">
                        Create a receiving account
                      </Text>
                    </Pressable>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      className="mt-2"
                      contentContainerStyle={{ gap: 8 }}
                    >
                      {tills.map((t) => {
                        const selected = t.tillId === selectedTillId;
                        return (
                          <Pressable
                            key={t.tillId}
                            onPress={() => setPickedTillId(t.tillId)}
                            className={`rounded-xl border px-3 py-2 ${
                              selected
                                ? "border-brisk-accent bg-brisk-accent/10"
                                : "border-brisk-borderStrong bg-brisk-bg1/70"
                            }`}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={`Collect into ${t.name}`}
                          >
                            <Text
                              className={`text-sm font-inter-semibold ${
                                selected ? "text-brisk-accent" : "text-brisk-subtext"
                              }`}
                            >
                              {t.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>

                <View className="mt-5 w-full flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-5 py-4">
                  <Text className="text-3xl font-inter-bold text-brisk-subtext">$</Text>
                  <TextInput
                    className="ml-2 flex-1 text-3xl font-inter-bold text-brisk-text"
                    style={{ padding: 0 }}
                    placeholder="0.00"
                    placeholderTextColor={theme.placeholder}
                    keyboardType="decimal-pad"
                    value={amountText}
                    onChangeText={setAmountText}
                    autoFocus
                    accessibilityLabel="Charge amount in US dollars"
                    accessibilityHint="Enter the amount to charge the customer"
                  />
                </View>
                {/* In-person tap (Android/HCE) — its own primary path. */}
                {isHceAvailable ? (
                  <View className="mt-8 w-full">
                    <PrimaryButton
                      label="Charge by tap"
                      onPress={() =>
                        selectedTillId && void startCharge(amountMicros, selectedTillId)
                      }
                      disabled={!canCharge}
                    />
                    <View className="mt-6 flex-row items-center">
                      <View className="h-px flex-1 bg-brisk-border" />
                      <Text className="mx-3 text-[11px] uppercase tracking-[1.5px] text-brisk-subtext">
                        or send a link
                      </Text>
                      <View className="h-px flex-1 bg-brisk-border" />
                    </View>
                  </View>
                ) : null}

                {/* Payment-link path — the expiry chooser belongs to this group. */}
                <View
                  className={`w-full rounded-2xl border border-brisk-border bg-brisk-bg1/40 p-4 ${
                    isHceAvailable ? "mt-4" : "mt-8"
                  }`}
                >
                  <Text className="text-xs uppercase tracking-[2px] text-brisk-subtext">
                    Payment link · expires in
                  </Text>
                  <View className="mt-2 flex-row gap-2">
                    {EXPIRY_OPTIONS.map((opt) => {
                      const selected = opt.seconds === expirySec;
                      return (
                        <Pressable
                          key={opt.seconds}
                          onPress={() => setExpirySec(opt.seconds)}
                          className={`flex-1 rounded-xl border px-3 py-2 ${
                            selected
                              ? "border-brisk-accent bg-brisk-accent/10"
                              : "border-brisk-borderStrong bg-brisk-bg1/70"
                          }`}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`Link expires in ${opt.label}`}
                        >
                          <Text
                            className={`text-center text-sm font-inter-semibold ${
                              selected ? "text-brisk-accent" : "text-brisk-subtext"
                            }`}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {/* Reusable toggle — off = link dies after the first payment,
                      on = it keeps accepting payments until it expires. */}
                  <Pressable
                    onPress={() => setReusable((r) => !r)}
                    className="mt-3 flex-row items-center justify-between rounded-xl border border-brisk-borderStrong bg-brisk-bg1/70 px-3 py-3"
                    accessibilityRole="switch"
                    accessibilityState={{ checked: reusable }}
                    accessibilityLabel="Reusable link"
                    accessibilityHint="Accept multiple payments on this link"
                  >
                    <View className="mr-3 flex-1">
                      <Text className="text-sm font-inter-semibold text-brisk-text">Reusable</Text>
                      <Text className="mt-0.5 text-xs text-brisk-subtext">
                        Accept multiple payments
                      </Text>
                    </View>
                    <View
                      className={`h-6 w-10 justify-center rounded-full px-0.5 ${
                        reusable ? "bg-brisk-accent" : "bg-brisk-border"
                      }`}
                    >
                      <View
                        className={`h-5 w-5 rounded-full bg-white ${
                          reusable ? "self-end" : "self-start"
                        }`}
                      />
                    </View>
                  </Pressable>
                  <View className="mt-3">
                    <PrimaryButton
                      label="Create payment link"
                      variant={isHceAvailable ? "secondary" : "primary"}
                      onPress={() =>
                        selectedTillId &&
                        void createLink(amountMicros, selectedTillId, expirySec, reusable)
                      }
                      disabled={!canCharge}
                    />
                  </View>
                </View>

                <Pressable className="mt-4 py-2" onPress={() => router.push("/links")}>
                  <Text className="text-center text-sm text-brisk-subtext">My payment links</Text>
                </Pressable>

                <Pressable className="py-2" onPress={() => router.push("/terminal")}>
                  <Text className="text-center text-sm text-brisk-subtext">
                    Connect ERP terminal
                  </Text>
                </Pressable>
              </Animated.View>
            </ScrollView>
          ) : (
            // Transient status screens are short — keep them centered.
            <View className="flex-1 items-center justify-center">
              {status === "preparing" ? (
                <Animated.View entering={FadeIn.duration(300)} className="items-center">
                  <PulseRing size={56}>
                    <Store color={theme.accent} size={56} />
                  </PulseRing>
                  <Text className="mt-6 text-sm uppercase tracking-[2px] text-brisk-subtext">
                    Preparing
                  </Text>
                  <Text className="mt-3 text-sm text-brisk-subtext">Setting up your merchant…</Text>
                </Animated.View>
              ) : null}

              {status === "awaiting" && invoice ? (
                <Animated.View entering={FadeIn.duration(300)} className="items-center">
                  <PulseRing size={56}>
                    <Smartphone color={theme.accent} size={56} />
                  </PulseRing>
                  <Text className="mt-6 text-sm uppercase tracking-[2px] text-brisk-subtext">
                    Tap to pay
                  </Text>
                  <HeroAmount
                    micros={invoice.amountMicros}
                    tier="focused"
                    countUp={false}
                    className="mt-2"
                  />
                  <Text className="mt-3 text-sm text-brisk-subtext">
                    Waiting for the customer to tap…
                  </Text>
                  <View className="mt-8 w-full max-w-[360px]">
                    <PrimaryButton
                      label="Cancel"
                      variant="secondary"
                      onPress={() => void cancel()}
                    />
                  </View>
                </Animated.View>
              ) : null}

              {status === "link" && invoice && linkUrl ? (
                <Animated.View
                  entering={FadeIn.duration(300)}
                  className="w-full max-w-[360px] items-center"
                >
                  <Text className="text-sm uppercase tracking-[2px] text-brisk-subtext">
                    Payment link
                  </Text>
                  <HeroAmount
                    micros={invoice.amountMicros}
                    tier="focused"
                    countUp={false}
                    className="mt-2 mb-5"
                  />
                  <ShareSheet
                    value={linkUrl}
                    qrSize={180}
                    shareMessage={`Pay ${formatUsd(invoice.amountMicros)} with Brisk: ${linkUrl}`}
                    qrAccessibilityLabel="Payment link QR code"
                  />

                  <Text className="mt-5 text-sm text-brisk-subtext">Waiting for payment…</Text>
                  <View className="mt-4 w-full">
                    <PrimaryButton label="Done" variant="secondary" onPress={() => void cancel()} />
                  </View>
                </Animated.View>
              ) : null}

              {status === "paid" && invoice ? (
                <SuccessSheet
                  amountMicros={invoice.amountMicros}
                  subtitle="received"
                  footer={<PrimaryButton label="New charge" onPress={() => void cancel()} />}
                />
              ) : null}

              {status === "nfc_off" ? (
                <Animated.View entering={FadeIn.duration(300)} className="items-center">
                  <Smartphone color={theme.subtext} size={56} />
                  <Text className="mt-6 text-lg font-inter-semibold text-brisk-text">
                    Turn on NFC
                  </Text>
                  <Text className="mt-1 text-center text-sm text-brisk-subtext">
                    Enable NFC to present the tap tag — or create a payment link instead.
                  </Text>
                  <View className="mt-8 w-full max-w-[360px]">
                    <PrimaryButton
                      label="Open NFC settings"
                      onPress={() => void openNfcSettings()}
                    />
                    <View className="mt-3">
                      <PrimaryButton
                        label="Back"
                        variant="secondary"
                        onPress={() => void cancel()}
                      />
                    </View>
                  </View>
                </Animated.View>
              ) : null}

              {status === "timeout" || status === "error" ? (
                <Animated.View entering={FadeIn.duration(300)} className="items-center">
                  <Text className="text-lg font-inter-semibold text-brisk-text">
                    {status === "timeout" ? "No payment yet" : "Charge didn’t complete"}
                  </Text>
                  <Text className="mt-1 text-center text-sm text-brisk-subtext">
                    {error ?? "Your customer can tap again to pay."}
                  </Text>
                  <View className="mt-8 w-full max-w-[360px]">
                    <PrimaryButton label="Try again" onPress={() => void cancel()} />
                  </View>
                </Animated.View>
              ) : null}
            </View>
          )}
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
