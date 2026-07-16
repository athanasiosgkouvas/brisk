import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { Copy, Radio, Smartphone, Store } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { GlassCard } from "@/components/ui/GlassCard";
import { HeroAmount } from "@/components/ui/HeroAmount";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { useTills } from "@/hooks/useTills";
import { useMerchantProfile } from "@/hooks/useMerchantProfile";
import { usePosTerminal } from "@/hooks/usePosTerminal";
import { useTheme } from "@/hooks/useTheme";

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

  const {
    terminalId,
    connection,
    currentSale,
    chargeStatus,
    chargeInvoice,
    lastResult,
    cancelSale,
  } = usePosTerminal({
    enabled: true,
    tillId: selectedTillId,
    merchantId,
    merchantName: merchantName ?? "Brisk terminal",
  });

  const copyTerminalId = async () => {
    if (!terminalId) return;
    await Clipboard.setStringAsync(terminalId);
    setCopied(true);
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
        ? "#F0B400"
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
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
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
          <Copy color={theme.accent} size={14} />
          <Text className="ml-1.5 text-xs font-inter-semibold text-brisk-accent">
            {copied ? "Copied" : "Copy"}
          </Text>
        </Pressable>
      </GlassCard>
      <Text className="mt-2 text-xs text-brisk-subtext">
        Enter this code in your ERP once to link this terminal — sales then appear below and charge
        automatically over tap.
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
        ) : chargeStatus === "preparing" ? (
          <Text className="text-sm text-brisk-subtext">Preparing charge…</Text>
        ) : chargeStatus === "paid" ? (
          <>
            <Text className="text-lg font-inter-bold text-brisk-accent">✓ Paid</Text>
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
            <Text
              className={`text-lg font-inter-bold ${lastResult.ok ? "text-brisk-accent" : "text-brisk-text"}`}
            >
              {lastResult.ok ? "✓ Last sale paid" : "Last sale failed"}
            </Text>
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
