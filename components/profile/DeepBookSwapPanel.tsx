import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { ArrowDownUp, ExternalLink } from "lucide-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { useAuth } from "@/hooks/useAuth";
import { useDeepBookSwap } from "@/hooks/useDeepBookSwap";
import { quoteSuiToDbusdc } from "@/services/blockchain/deepbookClient";
import { suiClient } from "@/services/blockchain/suiClient";
import { DEEPBOOK } from "@/utils/constants";

type Direction = "SUI_TO_DBUSDC" | "DBUSDC_TO_SUI";

/**
 * "Swap via DeepBook" panel on the Profile tab. Standalone DeepBook spot
 * usage — separate from the Smart Bet flow but demonstrating real orderbook
 * composability without Predict in the loop.
 *
 * Lazy-quote on amount change via the SUI/DBUSDC pool's `get_quote_quantity_out`
 * read function. Slippage floor: 2% (testnet liquidity is thin enough that a
 * tighter floor would frequently abort).
 */
export function DeepBookSwapPanel() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const { swapSuiToDbusdc, swapDbusdcToSui, running, lastError } = useDeepBookSwap();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("SUI_TO_DBUSDC");
  const [amountText, setAmountText] = useState("1");
  const [lastDigest, setLastDigest] = useState<string | null>(null);

  const suiBalanceQuery = useQuery({
    queryKey: ["sui-balance", session?.address],
    enabled: Boolean(session?.address),
    queryFn: async () => {
      if (!session) return 0n;
      const b = await suiClient.getBalance({
        owner: session.address,
        coinType: DEEPBOOK.suiType,
      });
      return BigInt(b.totalBalance ?? "0");
    },
    refetchInterval: 15_000,
  });
  const dbusdcBalanceQuery = useQuery({
    queryKey: ["dbusdc-balance", session?.address],
    enabled: Boolean(session?.address),
    queryFn: async () => {
      if (!session) return 0n;
      const b = await suiClient.getBalance({
        owner: session.address,
        coinType: DEEPBOOK.dbusdcType,
      });
      return BigInt(b.totalBalance ?? "0");
    },
    refetchInterval: 15_000,
  });

  const amount = useMemo(() => {
    const parsed = Number(amountText);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [amountText]);

  const [quoteState, setQuoteState] = useState<{
    quote: { quoteOutMicro: bigint; pricePerSui: number } | null;
    loading: boolean;
  }>({ quote: null, loading: false });

  // Quote refresh — only meaningful in the SUI→DBUSDC direction (DBUSDC→SUI
  // uses an inverse rate sniff inside the hook).
  useEffect(() => {
    let cancelled = false;
    if (direction !== "SUI_TO_DBUSDC" || amount <= 0) {
      void Promise.resolve().then(() => {
        if (!cancelled) setQuoteState({ quote: null, loading: false });
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.resolve().then(() => {
      if (!cancelled) setQuoteState((prev) => ({ quote: prev.quote, loading: true }));
    });
    const suiMicro = BigInt(Math.floor(amount * 10 ** DEEPBOOK.suiDecimals));
    void quoteSuiToDbusdc(suiMicro).then((q) => {
      if (cancelled) return;
      setQuoteState({
        quote: q ? { quoteOutMicro: q.quoteOutMicro, pricePerSui: q.pricePerSui } : null,
        loading: false,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [amount, direction]);

  const handleSwap = async () => {
    if (amount <= 0) return;
    try {
      const exec =
        direction === "SUI_TO_DBUSDC"
          ? await swapSuiToDbusdc(amount)
          : await swapDbusdcToSui(amount);
      setLastDigest(exec.digest);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sui-balance", session?.address] }),
        queryClient.invalidateQueries({ queryKey: ["dbusdc-balance", session?.address] }),
      ]);
    } catch {
      // Error surfaced via lastError below
    }
  };

  const suiBalanceMicro = suiBalanceQuery.data ?? 0n;
  const suiBalanceText = `${(Number(suiBalanceMicro) / 10 ** DEEPBOOK.suiDecimals).toFixed(4)} SUI`;
  const quoteSymbol = DEEPBOOK.quoteSymbol;
  const dbusdcBalanceText = `${(Number(dbusdcBalanceQuery.data ?? 0n) / 10 ** DEEPBOOK.quoteDecimals).toFixed(2)} ${quoteSymbol}`;
  const expectedDbusdc =
    direction === "SUI_TO_DBUSDC" && quoteState.quote
      ? (Number(quoteState.quote.quoteOutMicro) / 10 ** DEEPBOOK.dbusdcDecimals).toFixed(4)
      : null;
  // Empty quote = pool depth at this size can't fill on the current network.
  // Same shape on testnet (thin book) and mainnet (extreme size requested);
  // the UI surface stays neutral so it works either way.
  const quoteIsEmpty =
    direction === "SUI_TO_DBUSDC" &&
    !quoteState.loading &&
    !!quoteState.quote &&
    quoteState.quote.quoteOutMicro === 0n;
  // Pure balance check (no network assumption): is the requested amount
  // covered by the wallet? Caller controls funding (mainnet: user already
  // holds SUI; testnet demo: addresses ship pre-funded).
  const requestedSuiMicro = BigInt(Math.max(0, Math.floor(amount * 10 ** DEEPBOOK.suiDecimals)));
  const insufficientSui =
    direction === "SUI_TO_DBUSDC" && requestedSuiMicro > 0n && suiBalanceMicro < requestedSuiMicro;

  return (
    <View className="mt-4 rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-[11px] uppercase tracking-wide text-fathom-subtext">
            DeepBook swap
          </Text>
          <Text className="mt-1 text-sm text-fathom-text">
            Move SUI ↔ {quoteSymbol} through the canonical orderbook, sponsored end-to-end.
          </Text>
        </View>
      </View>
      <View className="mt-3 gap-1.5">
        <View className="flex-row justify-between">
          <Text className="text-[12px] text-fathom-subtext">SUI balance</Text>
          <Text className="text-[12px] font-semibold text-fathom-text">{suiBalanceText}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-[12px] text-fathom-subtext">{quoteSymbol} balance</Text>
          <Text className="text-[12px] font-semibold text-fathom-text">{dbusdcBalanceText}</Text>
        </View>
      </View>
      <View className="mt-4">
        <PrimaryButton label="Open swap" onPress={() => setOpen(true)} variant="secondary" />
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          className="flex-1 items-center justify-center bg-black/60 px-6"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-[400px] rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5"
          >
            <Text className="text-[11px] uppercase tracking-[2px] text-fathom-bull">
              DeepBook v3 · SUI/{quoteSymbol} pool
            </Text>
            <Text className="mt-1 text-xl font-bold text-fathom-text">Swap</Text>

            <View className="mt-4 flex-row gap-2">
              <Pressable
                onPress={() => setDirection("SUI_TO_DBUSDC")}
                className={`flex-1 rounded-xl border px-3 py-2 ${
                  direction === "SUI_TO_DBUSDC"
                    ? "border-fathom-bull bg-[#0F231E]"
                    : "border-[#2A4A66] bg-fathom-bg2"
                }`}
              >
                <Text
                  className={`text-center text-[12px] font-semibold ${
                    direction === "SUI_TO_DBUSDC" ? "text-fathom-bull" : "text-fathom-text"
                  }`}
                >
                  SUI → {quoteSymbol}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDirection("DBUSDC_TO_SUI")}
                className={`flex-1 rounded-xl border px-3 py-2 ${
                  direction === "DBUSDC_TO_SUI"
                    ? "border-fathom-bull bg-[#0F231E]"
                    : "border-[#2A4A66] bg-fathom-bg2"
                }`}
              >
                <Text
                  className={`text-center text-[12px] font-semibold ${
                    direction === "DBUSDC_TO_SUI" ? "text-fathom-bull" : "text-fathom-text"
                  }`}
                >
                  {quoteSymbol} → SUI
                </Text>
              </Pressable>
            </View>

            <Text className="mt-4 text-[10px] uppercase tracking-[2px] text-fathom-subtext">
              Amount ({direction === "SUI_TO_DBUSDC" ? "SUI" : quoteSymbol})
            </Text>
            <TextInput
              className="mt-2 rounded-xl border border-[#2A4A66] bg-fathom-bg2 px-3 py-2 text-base font-semibold text-fathom-text"
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              selectTextOnFocus
              returnKeyType="done"
            />

            {direction === "SUI_TO_DBUSDC" ? (
              <View className="mt-3 rounded-2xl border border-[#27415A] bg-fathom-bg2 p-3">
                <View className="flex-row items-center gap-2">
                  <ArrowDownUp size={14} color="#8B98A5" />
                  <Text className="text-[11px] uppercase tracking-[2px] text-fathom-subtext">
                    DeepBook quote
                  </Text>
                </View>
                <Text className="mt-1 text-sm font-semibold text-fathom-text">
                  {quoteState.loading
                    ? "Quoting…"
                    : quoteIsEmpty
                      ? "Pool depth empty"
                      : expectedDbusdc
                        ? `~${expectedDbusdc} ${quoteSymbol}`
                        : "—"}
                </Text>
                {quoteIsEmpty ? (
                  <Text className="mt-1 text-[11px] text-[#F2C66B]">
                    Pool can&apos;t quote right now (testnet without DEEP fees). The PTB will still
                    ship the DeepBook call — visible on the explorer; fill is opportunistic.
                  </Text>
                ) : quoteState.quote ? (
                  <Text className="mt-1 text-[11px] text-fathom-subtext">
                    Rate ~{quoteState.quote.pricePerSui.toFixed(4)} {quoteSymbol}/SUI · 2% slippage
                    floor
                  </Text>
                ) : null}
                {insufficientSui ? (
                  <Text className="mt-1 text-[11px] text-fathom-bear">
                    Wallet holds {suiBalanceText}. Add SUI to swap this size.
                  </Text>
                ) : null}
              </View>
            ) : (
              <View className="mt-3 rounded-2xl border border-[#27415A] bg-fathom-bg2 p-3">
                <Text className="text-[11px] uppercase tracking-[2px] text-fathom-subtext">
                  DeepBook quote
                </Text>
                <Text className="mt-1 text-sm font-semibold text-fathom-text">
                  Inverse rate · 2% slippage floor
                </Text>
                <Text className="mt-1 text-[11px] text-fathom-subtext">
                  We probe a 1-SUI forward quote and apply the inverse — accurate enough for
                  small-size swaps on testnet.
                </Text>
              </View>
            )}

            {lastError ? <Text className="mt-3 text-xs text-fathom-bear">{lastError}</Text> : null}
            {lastDigest ? (
              <View className="mt-3 flex-row items-center gap-2 rounded-2xl border border-fathom-bull/40 bg-[#0F231E] p-3">
                <ExternalLink size={14} color="#00D98B" />
                <Text className="flex-1 text-[11px] text-fathom-bull">
                  Swap confirmed · digest {lastDigest.slice(0, 10)}…{lastDigest.slice(-6)}
                </Text>
              </View>
            ) : null}

            <View className="mt-4 flex-row gap-2">
              <Pressable
                onPress={() => setOpen(false)}
                className="flex-1 rounded-xl border border-[#2A4A66] bg-fathom-bg2 px-3 py-3"
              >
                <Text className="text-center text-sm font-semibold text-fathom-text">Close</Text>
              </Pressable>
              <View className="flex-1">
                <PrimaryButton
                  label={running ? "Swapping…" : "Swap on DeepBook"}
                  loading={running}
                  // Block only when balance is the issue. Empty-book quotes
                  // are not blockers — the PTB still ships with min_out=0
                  // and the swap_* function safely no-ops, leaving the
                  // composability claim visible on the explorer digest.
                  disabled={insufficientSui}
                  onPress={() => void handleSwap()}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
