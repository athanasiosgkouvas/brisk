import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Check, ChevronDown, MoreVertical, Plus, Smartphone, Store } from "lucide-react-native";

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
import { ICON } from "@/theme/scale";
import { useTheme } from "@/hooks/useTheme";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";

// Merchant "Charge" tab. Amount is the hero and there is ONE obvious primary
// action (Charge by tap on Android/HCE, otherwise Create payment link); the
// alternate rail and its options (expiry, reusable) are progressively disclosed.
// The receiving account is a compact pill that opens a picker. ERP terminal
// lives in the header overflow. Both rails await on-chain settlement and flip to
// the same "paid" screen.
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
  // On HCE devices the tap rail is primary and the link rail is disclosed; on
  // iOS (no HCE) the link rail is the only rail, so it's open from the start.
  const [showLinkOptions, setShowLinkOptions] = useState(!isHceAvailable);
  const [tillPickerOpen, setTillPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Which receiving account this charge collects into (customers never see the
  // merchant's private treasury). Falls back to the first till until one is
  // explicitly picked — derived during render so there's no setState-in-effect.
  const [pickedTillId, setPickedTillId] = useState<string | null>(null);
  const selectedTillId = pickedTillId ?? tills[0]?.tillId ?? null;
  const selectedTill = tills.find((t) => t.tillId === selectedTillId) ?? null;

  const amountMicros = usdToMicros(Number(amountText || "0"));
  const canCharge = amountMicros > 0 && !!selectedTillId;

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top"]} className="flex-1 px-5">
          {status === "idle" ? (
            <>
              {/* Header: overflow menu (ERP terminal lives here, out of the way). */}
              <View className="flex-row items-center justify-end pb-1 pt-2">
                <Pressable
                  onPress={() => setMenuOpen(true)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="More options"
                >
                  <MoreVertical color={theme.subtext} size={ICON.header} />
                </Pressable>
              </View>

              {/* Charge form: top-aligned + scrollable so it never gets cut off on
                  short screens or when the keyboard is up (mirrors the Save tab). */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                  paddingTop: 12,
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

                  {/* Amount — the hero. */}
                  <View className="mt-6 w-full flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-5 py-4">
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

                  {/* Collect into — a single compact pill that opens a picker.
                      Funds collect here, then sweep to the private treasury. */}
                  {tills.length === 0 ? (
                    <Pressable
                      onPress={() => router.push("/tills")}
                      className="mt-3 w-full flex-row items-center justify-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3"
                    >
                      <Plus color={theme.accent} size={16} />
                      <Text className="ml-2 text-sm font-inter-semibold text-brisk-accent">
                        Create a receiving account
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => setTillPickerOpen(true)}
                      className="mt-3 w-full flex-row items-center justify-between rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3"
                      accessibilityRole="button"
                      accessibilityLabel={`Collect into ${selectedTill?.name ?? "account"}`}
                    >
                      <View>
                        <Text className="text-xs uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium">
                          Collect into
                        </Text>
                        <Text className="mt-0.5 text-sm font-inter-semibold text-brisk-text">
                          {selectedTill?.name ?? "Select account"}
                        </Text>
                      </View>
                      <ChevronDown color={theme.subtext} size={18} />
                    </Pressable>
                  )}

                  {/* Primary action — one obvious button per device capability. */}
                  {isHceAvailable ? (
                    <View className="mt-8 w-full">
                      <PrimaryButton
                        label="Charge by tap"
                        onPress={() =>
                          selectedTillId && void startCharge(amountMicros, selectedTillId)
                        }
                        disabled={!canCharge}
                      />
                      <Pressable
                        className="mt-3 py-2"
                        onPress={() => setShowLinkOptions((v) => !v)}
                        accessibilityRole="button"
                      >
                        <Text className="text-center text-sm font-inter-semibold text-brisk-accent">
                          {showLinkOptions ? "Hide payment link" : "Send a payment link instead"}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {/* Link rail — disclosed on HCE, always open on iOS. */}
                  {showLinkOptions ? (
                    <View className="mt-2 w-full rounded-2xl border border-brisk-border bg-brisk-bg1/40 p-4">
                      <Text className="text-xs uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium">
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
                          <Text className="text-sm font-inter-semibold text-brisk-text">
                            Reusable
                          </Text>
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
                  ) : null}
                </Animated.View>
              </ScrollView>

              {/* Receiving-account picker. */}
              <Modal
                visible={tillPickerOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setTillPickerOpen(false)}
              >
                <Pressable
                  className="flex-1 justify-end bg-black/60"
                  onPress={() => setTillPickerOpen(false)}
                >
                  <Pressable
                    className="rounded-t-3xl border-t border-brisk-border bg-brisk-bg0 px-5 pb-10 pt-6"
                    onPress={(e) => e.stopPropagation()}
                  >
                    <Text className="mb-2 text-xs uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium">
                      Collect into
                    </Text>
                    {tills.map((t) => {
                      const selected = t.tillId === selectedTillId;
                      return (
                        <Pressable
                          key={t.tillId}
                          onPress={() => {
                            setPickedTillId(t.tillId);
                            setTillPickerOpen(false);
                          }}
                          className="flex-row items-center justify-between py-3"
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                        >
                          <Text
                            className={`text-base ${
                              selected ? "font-inter-semibold text-brisk-accent" : "text-brisk-text"
                            }`}
                          >
                            {t.name}
                          </Text>
                          {selected ? <Check color={theme.accent} size={18} /> : null}
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => {
                        setTillPickerOpen(false);
                        router.push("/tills");
                      }}
                      className="mt-2 flex-row items-center border-t border-brisk-border pt-4"
                    >
                      <Plus color={theme.accent} size={16} />
                      <Text className="ml-2 text-sm font-inter-semibold text-brisk-accent">
                        Manage receiving accounts
                      </Text>
                    </Pressable>
                  </Pressable>
                </Pressable>
              </Modal>

              {/* Header overflow menu. */}
              <Modal
                visible={menuOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuOpen(false)}
              >
                <Pressable
                  className="flex-1 justify-end bg-black/60"
                  onPress={() => setMenuOpen(false)}
                >
                  <Pressable
                    className="rounded-t-3xl border-t border-brisk-border bg-brisk-bg0 px-5 pb-10 pt-6"
                    onPress={(e) => e.stopPropagation()}
                  >
                    <Pressable
                      onPress={() => {
                        setMenuOpen(false);
                        router.push("/terminal");
                      }}
                      className="flex-row items-center py-3"
                    >
                      <Smartphone color={theme.accent} size={18} />
                      <Text className="ml-3 text-base text-brisk-text">Connect ERP terminal</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setMenuOpen(false);
                        router.push("/links");
                      }}
                      className="flex-row items-center py-3"
                    >
                      <Store color={theme.accent} size={18} />
                      <Text className="ml-3 text-base text-brisk-text">My payment links</Text>
                    </Pressable>
                  </Pressable>
                </Pressable>
              </Modal>
            </>
          ) : (
            // Transient status screens are short — keep them centered.
            <View className="flex-1 items-center justify-center">
              {status === "preparing" ? (
                <Animated.View entering={FadeIn.duration(300)} className="items-center">
                  <PulseRing size={56}>
                    <Store color={theme.accent} size={56} />
                  </PulseRing>
                  <Text className="mt-6 text-sm uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium">
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
                  <Text className="mt-6 text-sm uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium">
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
                  <Text className="text-sm uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium">
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

                  {/* Reusable links keep accepting payments — the live repeat-payment
                      tally (N payments · $X received) lands here (parked follow-up). */}
                  {reusable ? (
                    <Text className="mt-5 text-center text-sm text-brisk-subtext">
                      Reusable link — share it to accept multiple payments.
                    </Text>
                  ) : (
                    <Text className="mt-5 text-sm text-brisk-subtext">Waiting for payment…</Text>
                  )}
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
