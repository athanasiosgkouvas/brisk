import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { Check, Copy, Nfc, QrCode, Radio, Smartphone, Store } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { GlassCard } from "@/components/ui/GlassCard";
import { HeroAmount } from "@/components/ui/HeroAmount";
import { AnimatedCheck } from "@/components/ui/AnimatedCheck";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { Segmented, type SegmentedOption } from "@/components/ui/Segmented";
import { ShareSheet } from "@/components/ui/ShareSheet";
import { useTills } from "@/hooks/useTills";
import { useMerchantProfile } from "@/hooks/useMerchantProfile";
import { usePosTerminal } from "@/hooks/usePosTerminal";
import { isHceAvailable } from "@/services/nfc/hce";
import { formatUsd } from "@/services/blockchain/paymentTx";
import { useTheme } from "@/hooks/useTheme";
import { hapticSwipeSuccess } from "@/utils/haptics";

type ChargeMode = "tap" | "qr";
const MODE_OPTIONS: SegmentedOption<ChargeMode>[] = [
  { value: "tap", label: "Tap", Icon: Nfc },
  { value: "qr", label: "QR", Icon: QrCode },
];

// Pro: ERP terminal mode. This device holds a socket open to the backend; when
// the ERP initiates a sale, the sale is pushed here and the NFC charge starts
// automatically. The on-chain digest is reported back so the ERP's poll succeeds.
export default function TerminalScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { tills } = useTills();
  const { name: merchantName, merchantId, complete } = useMerchantProfile();

  const [pickedTillId, setPickedTillId] = useState<string | null>(null);
  const selectedTillId = pickedTillId ?? tills[0]?.tillId ?? null;
  const [copied, setCopied] = useState(false);
  // How incoming sales are collected: NFC tap or a scannable QR (default tap
  // where HCE exists, else QR — e.g. an iOS terminal).
  const [mode, setMode] = useState<ChargeMode>(isHceAvailable ? "tap" : "qr");

  const {
    terminalId,
    connection,
    currentSale,
    chargeStatus,
    chargeInvoice,
    chargeLinkUrl,
    lastResult,
    cancelSale,
  } = usePosTerminal({
    enabled: true,
    tillId: selectedTillId,
    merchantId,
    merchantName: merchantName ?? "Brisk terminal",
    mode,
  });

  const copyTerminalId = async () => {
    if (!terminalId) return;
    await Clipboard.setStringAsync(terminalId);
    setCopied(true);
    void hapticSwipeSuccess();
    setTimeout(() => setCopied(false), 1500);
  };

  // The terminal ID (and ERP wiring) is only meaningful once the business is
  // fully set up — gate it behind finishing setup.
  if (!complete) {
    return (
      <Screen title="ERP terminal" onClose={() => router.back()}>
        <View className="flex-1 items-center justify-center px-4">
          <Store color={theme.subtext} size={48} />
          <Text className="mt-5 text-center text-lg font-inter-bold text-brisk-text">
            Finish setting up your business
          </Text>
          <Text className="mt-2 text-center text-sm text-brisk-subtext">
            Add your business name and VAT/Tax ID to get your terminal ID and connect your ERP.
          </Text>
          <View className="mt-7 w-full max-w-[360px]">
            <PrimaryButton label="Finish setup" onPress={() => router.push("/pro-setup")} />
          </View>
        </View>
      </Screen>
    );
  }

  const dot =
    connection === "connected"
      ? theme.accent
      : connection === "connecting"
        ? theme.warning
        : theme.subtext;
  const connShort =
    connection === "connected"
      ? "Connected"
      : connection === "connecting"
        ? "Connecting…"
        : "Disconnected";

  return (
    <Screen title="ERP terminal" onClose={() => router.back()} scroll>
      {/* Terminal ID + live connection — compact: it's a set-once code the ERP
          reuses, so it stays out of the way and the live sale below is the focus. */}
      <GlassCard className="mt-2 flex-row items-center justify-between px-4 py-3.5">
        <View className="flex-1">
          <View className="flex-row items-center">
            <StatusDot color={dot} pulse={connection === "connecting"} />
            <Text className="ml-2 text-[11px] uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium">
              Terminal ID · {connShort}
            </Text>
          </View>
          {terminalId ? (
            <Text
              className="mt-1 text-2xl font-inter-bold text-brisk-text"
              style={{ letterSpacing: 3 }}
              selectable
              accessibilityLabel={`Terminal ID ${terminalId.split("").join(" ")}`}
            >
              {`${terminalId.slice(0, 4)} ${terminalId.slice(4)}`}
            </Text>
          ) : (
            <Text className="mt-1 text-sm text-brisk-subtext">Generating…</Text>
          )}
        </View>
        <Pressable
          onPress={copyTerminalId}
          hitSlop={8}
          disabled={!terminalId}
          className="ml-3 flex-row items-center rounded-lg border border-brisk-borderStrong px-3 py-2"
          accessibilityRole="button"
          accessibilityLabel="Copy terminal ID"
        >
          {copied ? (
            <Check color={theme.accent} size={14} />
          ) : (
            <Copy color={theme.accent} size={14} />
          )}
          <Text className="ml-1.5 text-xs font-inter-semibold text-brisk-accent">
            {copied ? "Copied" : "Copy"}
          </Text>
        </Pressable>
      </GlassCard>
      <Text className="mt-2 text-xs text-brisk-subtext">
        Enter this code in your ERP once to link this terminal — sales then appear below and charge
        automatically.
      </Text>

      {/* Receiving account (till) this terminal collects into. */}
      <View className="mt-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium">
            Collect into
          </Text>
          <Pressable onPress={() => router.push("/tills")} hitSlop={8}>
            <Text className="text-xs font-inter-semibold text-brisk-accent">Manage</Text>
          </Pressable>
        </View>
        {tills.length === 0 ? (
          <Text className="mt-2 text-sm text-brisk-subtext">
            Create a receiving account first (Manage) to accept sales.
          </Text>
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

      {/* How to collect an incoming sale — tap vs QR. Only meaningful where HCE
          exists; without it QR is the only rail. */}
      {isHceAvailable ? (
        <View className="mt-5">
          <Text className="mb-2 text-xs uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium">
            Collect by
          </Text>
          <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
        </View>
      ) : null}

      {/* Live sale status. */}
      <GlassCard className="mt-6 items-center py-8">
        {chargeStatus === "awaiting" && chargeInvoice ? (
          <>
            <Smartphone color={theme.accent} size={48} />
            <Text className="mt-4 text-xs uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium">
              Incoming sale · tap to pay
            </Text>
            <HeroAmount
              micros={chargeInvoice.amountMicros}
              tier="focused"
              countUp={false}
              className="mt-2"
            />
            <Text className="mt-3 text-sm text-brisk-subtext">
              Waiting for the customer to tap…
            </Text>
            <Pressable className="mt-5 py-2" onPress={() => void cancelSale()}>
              <Text className="text-sm font-inter-semibold text-brisk-subtext">Cancel</Text>
            </Pressable>
          </>
        ) : chargeStatus === "link" && chargeInvoice && chargeLinkUrl ? (
          <>
            <Text className="mb-3 text-xs uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium">
              Incoming sale · scan to pay
            </Text>
            <HeroAmount
              micros={chargeInvoice.amountMicros}
              tier="focused"
              countUp={false}
              className="mb-4"
            />
            <ShareSheet
              value={chargeLinkUrl}
              qrSize={180}
              shareMessage={`Pay ${formatUsd(chargeInvoice.amountMicros)} with Brisk: ${chargeLinkUrl}`}
              qrAccessibilityLabel="Payment QR code"
            />
            <Text className="mt-4 text-center text-xs text-brisk-subtext">
              Customer scans with any phone camera — pays in the app or the browser.
            </Text>
            <Pressable className="mt-4 py-2" onPress={() => void cancelSale()}>
              <Text className="text-sm font-inter-semibold text-brisk-subtext">Cancel</Text>
            </Pressable>
          </>
        ) : chargeStatus === "preparing" ? (
          <Text className="text-sm text-brisk-subtext">Preparing charge…</Text>
        ) : chargeStatus === "paid" ? (
          <>
            <AnimatedCheck size={56} />
            <Text className="mt-4 text-lg font-inter-bold text-brisk-accent">Paid</Text>
            {lastResult?.digest ? (
              <Text className="mt-2 text-center text-xs text-brisk-subtext" numberOfLines={1}>
                {lastResult.digest}
              </Text>
            ) : null}
          </>
        ) : chargeStatus === "timeout" || chargeStatus === "error" || chargeStatus === "nfc_off" ? (
          <Text className="text-sm font-inter-semibold text-brisk-text">
            {chargeStatus === "nfc_off" ? "Turn on NFC to accept taps" : "Sale didn’t complete"}
          </Text>
        ) : lastResult ? (
          <>
            <View className="flex-row items-center">
              {lastResult.ok ? <Check color={theme.accent} size={18} /> : null}
              <Text
                className={`text-lg font-inter-bold ${lastResult.ok ? "ml-1.5 text-brisk-accent" : "text-brisk-text"}`}
              >
                {lastResult.ok ? "Last sale paid" : "Last sale failed"}
              </Text>
            </View>
            <Text className="mt-3 text-sm text-brisk-subtext">Waiting for the next sale…</Text>
          </>
        ) : (
          <>
            <Radio color={theme.subtext} size={48} />
            <Text className="mt-4 text-sm text-brisk-subtext">
              Waiting for a sale from your ERP…
            </Text>
          </>
        )}
      </GlassCard>

      {currentSale ? (
        <Text className="mt-3 text-center text-[11px] text-brisk-subtext">
          Session {currentSale.sessionId}
        </Text>
      ) : null}
    </Screen>
  );
}

/** The connection indicator dot — breathes while `pulse` (connecting), static
 *  otherwise. Keeps the 8px footprint so the row layout never shifts. */
function StatusDot({ color, pulse }: { color: string; pulse: boolean }) {
  const v = useSharedValue(1);
  useEffect(() => {
    v.value = pulse
      ? withRepeat(withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true)
      : withTiming(1, { duration: 150 });
  }, [pulse, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value }));
  return (
    <Animated.View
      style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, style]}
    />
  );
}
