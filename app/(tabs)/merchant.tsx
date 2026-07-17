import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Check, ChevronDown, MoreVertical, Plus, Smartphone, Store } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { HeroAmount } from "@/components/ui/HeroAmount";
import { SuccessSheet } from "@/components/ui/SuccessSheet";
import { ShareSheet } from "@/components/ui/ShareSheet";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { AmountField } from "@/components/ui/AmountField";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { GlassCard } from "@/components/ui/GlassCard";
import { Segmented, type SegmentedOption } from "@/components/ui/Segmented";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatusView } from "@/components/ui/StatusView";
import { ToggleRow } from "@/components/ui/Toggle";
import { useCharge } from "@/hooks/useCharge";
import { useTills } from "@/hooks/useTills";
import { isHceAvailable } from "@/services/nfc/hce";
import { openNfcSettings } from "@/services/nfc/reader";
import { formatUsd, usdToMicros } from "@/services/blockchain/paymentTx";
import { CONTENT_MAX, DURATION, HERO_EYEBROW, ICON } from "@/theme/scale";
import { useTheme } from "@/hooks/useTheme";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";

// Merchant "Charge" tab. The amount is the hero and there is ONE obvious primary
// action (Charge by tap on Android/HCE, otherwise Create payment link); the
// alternate rail and its options (expiry, reusable) are progressively disclosed
// inside a single card. The receiving account is a compact pill that opens a
// picker. ERP terminal lives in the header overflow. Both rails await on-chain
// settlement and flip to the same "paid" screen.
type ExpiryKey = "1h" | "24h" | "7d";
const EXPIRY_OPTIONS: (SegmentedOption<ExpiryKey> & { seconds: number })[] = [
  { value: "1h", label: "1 hour", seconds: 60 * 60 },
  { value: "24h", label: "24 hours", seconds: 24 * 60 * 60 },
  { value: "7d", label: "7 days", seconds: 7 * 24 * 60 * 60 },
];

export default function ChargeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { status, invoice, linkUrl, error, startCharge, createLink, cancel } = useCharge();
  const { tills } = useTills();
  const bottomPad = useTabBarClearance();
  const [amountText, setAmountText] = useState("");
  const [expiryKey, setExpiryKey] = useState<ExpiryKey>("24h");
  const expirySec = EXPIRY_OPTIONS.find((o) => o.value === expiryKey)!.seconds;
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
              {/* Header: title + overflow menu (ERP terminal lives here). */}
              <View className="flex-row items-center justify-between pb-1 pt-2">
                <Text className="text-lg font-inter-bold text-brisk-text">Charge</Text>
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
                  paddingTop: 20,
                  paddingBottom: bottomPad,
                  alignItems: "center",
                }}
              >
                <Animated.View
                  entering={FadeIn.duration(DURATION.fast)}
                  style={{ maxWidth: CONTENT_MAX }}
                  className="w-full items-center"
                >
                  {/* Amount — the hero. */}
                  <Text className={HERO_EYEBROW}>Amount</Text>
                  <View className="mt-3">
                    <AmountField
                      value={amountText}
                      onChangeText={setAmountText}
                      tier="hero"
                      autoFocus
                    />
                  </View>

                  {/* Collect into — a compact pill that opens a picker. Funds
                      collect here, then sweep to the private treasury. */}
                  {tills.length === 0 ? (
                    <Pressable
                      onPress={() => router.push("/tills")}
                      className="mt-8 w-full flex-row items-center justify-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3"
                    >
                      <Plus color={theme.accent} size={16} />
                      <Text className="ml-2 text-sm font-inter-semibold text-brisk-accent">
                        Create a receiving account
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => setTillPickerOpen(true)}
                      className="mt-8 w-full flex-row items-center justify-between rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3"
                      accessibilityRole="button"
                      accessibilityLabel={`Collect into ${selectedTill?.name ?? "account"}`}
                    >
                      <Text className="text-sm text-brisk-subtext">
                        Collect into{" "}
                        <Text className="font-inter-semibold text-brisk-text">
                          {selectedTill?.name ?? "Select account"}
                        </Text>
                      </Text>
                      <ChevronDown color={theme.subtext} size={18} />
                    </Pressable>
                  )}

                  {/* Primary action — one obvious button per device capability. */}
                  {isHceAvailable ? (
                    <View className="mt-6 w-full">
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
                    <GlassCard className="mt-2 w-full p-4" glow>
                      <SectionLabel>Payment link</SectionLabel>
                      <Text className="mb-2 mt-3 text-sm text-brisk-subtext">Expires in</Text>
                      <Segmented
                        options={EXPIRY_OPTIONS.map(({ value, label }) => ({ value, label }))}
                        value={expiryKey}
                        onChange={setExpiryKey}
                      />
                      <View className="mt-3">
                        <ToggleRow
                          label="Reusable"
                          description="Accept multiple payments"
                          value={reusable}
                          onValueChange={setReusable}
                        />
                      </View>
                      <View className="mt-4">
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
                    </GlassCard>
                  ) : null}
                </Animated.View>
              </ScrollView>

              {/* Receiving-account picker. */}
              <BottomSheet visible={tillPickerOpen} onClose={() => setTillPickerOpen(false)}>
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
              </BottomSheet>

              {/* Header overflow menu. */}
              <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
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
              </BottomSheet>
            </>
          ) : status === "preparing" ? (
            <StatusView
              variant="pulse"
              Icon={Store}
              eyebrow="Preparing"
              message="Setting up your merchant…"
            />
          ) : status === "awaiting" && invoice ? (
            <StatusView
              variant="pulse"
              Icon={Smartphone}
              eyebrow="Tap to pay"
              amountMicros={invoice.amountMicros}
              message="Waiting for the customer to tap…"
              actions={
                <PrimaryButton label="Cancel" variant="secondary" onPress={() => void cancel()} />
              }
            />
          ) : status === "link" && invoice && linkUrl ? (
            <View className="flex-1 items-center justify-center">
              <Animated.View
                entering={FadeIn.duration(DURATION.fast)}
                style={{ maxWidth: CONTENT_MAX }}
                className="w-full items-center"
              >
                <Text className={HERO_EYEBROW}>Payment link</Text>
                <HeroAmount
                  micros={invoice.amountMicros}
                  tier="focused"
                  countUp={false}
                  className="mb-5 mt-2"
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
            </View>
          ) : status === "paid" && invoice ? (
            <View className="flex-1 items-center justify-center">
              <SuccessSheet
                amountMicros={invoice.amountMicros}
                subtitle="received"
                footer={<PrimaryButton label="New charge" onPress={() => void cancel()} />}
              />
            </View>
          ) : status === "nfc_off" ? (
            <StatusView
              variant="neutral"
              Icon={Smartphone}
              glyphTone="subtext"
              title="Turn on NFC"
              message="Enable NFC to present the tap tag — or create a payment link instead."
              actions={
                <>
                  <PrimaryButton label="Open NFC settings" onPress={() => void openNfcSettings()} />
                  <PrimaryButton label="Back" variant="secondary" onPress={() => void cancel()} />
                </>
              }
            />
          ) : status === "timeout" || status === "error" ? (
            <StatusView
              variant="error"
              title={status === "timeout" ? "No payment yet" : "Charge didn’t complete"}
              message={error ?? "Your customer can tap again to pay."}
              actions={<PrimaryButton label="Try again" onPress={() => void cancel()} />}
            />
          ) : null}
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
