import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Zap } from "lucide-react-native";

import { quoteSuiToDbusdc } from "@/services/blockchain/deepbookClient";
import { useSettingsStore } from "@/store/settingsStore";
import { DEEPBOOK } from "@/utils/constants";

// SUI/DBUSDC testnet pool needs ≥ ~1 SUI to fill (book depth on smaller
// sizes is empty). Anything below the floor returns quote_out=0, which
// reads to users as a broken quote — so the presets stay above it.
const NOTIONAL_PRESETS = [1, 2, 5, 10];

/**
 * Smart Bet status chip + opt-in sheet on the Swipe screen.
 *
 * When ON and the DeepBook book can fill, every swipe builds a single
 * sponsored PTB that calls `predict::mint`, swaps a slice of SUI on
 * `deepbook::pool::swap_exact_base_for_quote<SUI, DBUSDC>`, and runs
 * `fathom_router::assert_and_record` — Fathom's own Move package that ASSERTS
 * the orderbook cleared a real slippage floor (reverting the whole PTB
 * otherwise) and emits a linking event. One digest, an enforced spot leg.
 *
 * When the book can't fill the size or the wallet lacks DEEP for the fill fee,
 * the swipe honestly falls back to a plain Predict mint and the swipe screen
 * shows why (no silent no-op). When OFF, the flow is Predict-only.
 *
 * The live DeepBook quote is fetched via devInspect (see hooks/usePredict.ts
 * for the gate that decides whether the spot leg is included).
 */
export function SmartBetBar() {
  const { smartBet, smartBetSuiNotional, setSmartBet, setSmartBetSuiNotional } = useSettingsStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [quoteState, setQuoteState] = useState<{
    quote: { pricePerSui: number; dbusdcOutMicro: bigint } | null;
    loading: boolean;
  }>({ quote: null, loading: false });

  const hedgeSuiMicro = useMemo(
    () => BigInt(Math.max(0, Math.floor(smartBetSuiNotional * 10 ** DEEPBOOK.suiDecimals))),
    [smartBetSuiNotional],
  );

  useEffect(() => {
    let cancelled = false;
    if (!smartBet || hedgeSuiMicro === 0n) {
      // Idle state — no quote fetched. We deliberately don't call setState
      // synchronously here (react-hooks/set-state-in-effect): we update only
      // *after* the async work or via the loading flag transition below.
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
    void quoteSuiToDbusdc(hedgeSuiMicro).then((q) => {
      if (cancelled) return;
      setQuoteState({
        quote: q ? { pricePerSui: q.pricePerSui, dbusdcOutMicro: q.quoteOutMicro } : null,
        loading: false,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [smartBet, hedgeSuiMicro]);

  const quote = quoteState.quote;
  const quoteLoading = quoteState.loading;
  const quoteSymbol = DEEPBOOK.quoteSymbol;

  // Treat a zero quote as "no fill" — the orderbook can't cover this size
  // right now. Surface as a neutral notice instead of showing 0.00.
  const quoteHasFill = !!quote && quote.dbusdcOutMicro > 0n;
  const expectedQuote = quoteHasFill
    ? (Number(quote!.dbusdcOutMicro) / 10 ** DEEPBOOK.quoteDecimals).toFixed(2)
    : null;
  const quoteEmpty = !!quote && quote.dbusdcOutMicro === 0n;

  return (
    <View
      className={`mb-3 flex-row items-center gap-2 rounded-2xl border px-3 py-2 ${
        smartBet ? "border-fathom-bull bg-[#0F231E]" : "border-[#27415A] bg-fathom-bg1"
      }`}
    >
      <View
        className={`h-7 w-7 items-center justify-center rounded-full ${
          smartBet ? "bg-fathom-bull" : "bg-fathom-bg2"
        }`}
      >
        <Zap size={14} color={smartBet ? "#07111A" : "#8B98A5"} />
      </View>
      <View className="flex-1">
        <Text className="text-[10px] uppercase tracking-[2px] text-fathom-subtext">
          DeepBook Smart Bet
        </Text>
        <Text className="mt-0.5 text-[12px] font-semibold text-fathom-text">
          {smartBet
            ? quoteLoading
              ? `Pricing ${smartBetSuiNotional} SUI DeepBook leg…`
              : quoteHasFill
                ? `Predict mint + ${smartBetSuiNotional} SUI → ~${expectedQuote} ${quoteSymbol}, enforced atomically`
                : `Spot leg unavailable at ${smartBetSuiNotional} SUI — swipe mints plain`
            : "Off — tap to add an enforced DeepBook spot leg to each swipe"}
        </Text>
      </View>
      <Pressable
        onPress={() => setSheetOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Configure Smart Bet"
        className="rounded-xl border border-[#2A4A66] bg-fathom-bg2 px-3 py-2"
      >
        <Text className="text-[10px] uppercase tracking-[2px] text-fathom-subtext">
          {smartBet ? "Settings" : "Setup"}
        </Text>
      </Pressable>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable
          onPress={() => setSheetOpen(false)}
          className="flex-1 items-center justify-center bg-black/60 px-6"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-[400px] rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5"
          >
            <Text className="text-[11px] uppercase tracking-[2px] text-fathom-bull">
              DeepBook composability
            </Text>
            <Text className="mt-1 text-xl font-bold text-fathom-text">Smart Bet</Text>
            <Text className="mt-2 text-[12px] leading-5 text-fathom-subtext">
              When on, a swipe builds one sponsored transaction that mints your Predict position AND
              swaps a slice of your SUI into {quoteSymbol} on DeepBook Spot. Fathom&apos;s own
              `router::assert_and_record` then enforces the orderbook cleared a 2% slippage floor —
              if it can&apos;t fill (or you don&apos;t hold DEEP for the fee), the swipe mints a
              plain Predict position instead and tells you why.
            </Text>

            <View className="mt-4 flex-row gap-2">
              <Pressable
                onPress={() => setSmartBet(false)}
                className={`flex-1 rounded-xl border px-3 py-3 ${
                  !smartBet ? "border-[#2A4A66] bg-fathom-bg2" : "border-[#27415A] bg-fathom-bg2"
                }`}
              >
                <Text
                  className={`text-center text-sm font-semibold ${
                    !smartBet ? "text-fathom-text" : "text-fathom-subtext"
                  }`}
                >
                  Off
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSmartBet(true)}
                className={`flex-1 rounded-xl px-3 py-3 ${
                  smartBet ? "bg-fathom-bull" : "border border-[#2A4A66] bg-fathom-bg2"
                }`}
              >
                <Text
                  className={`text-center text-sm font-semibold ${
                    smartBet ? "text-[#07111A]" : "text-fathom-text"
                  }`}
                >
                  On
                </Text>
              </Pressable>
            </View>

            <Text className="mt-5 text-[10px] uppercase tracking-[2px] text-fathom-subtext">
              SUI sold to DeepBook per swipe
            </Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {NOTIONAL_PRESETS.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setSmartBetSuiNotional(p)}
                  className={`rounded-xl border px-3 py-2 ${
                    Math.abs(smartBetSuiNotional - p) < 1e-9
                      ? "border-fathom-bull bg-[#0F231E]"
                      : "border-[#2A4A66] bg-fathom-bg2"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      Math.abs(smartBetSuiNotional - p) < 1e-9
                        ? "text-fathom-bull"
                        : "text-fathom-text"
                    }`}
                  >
                    {p} SUI
                  </Text>
                </Pressable>
              ))}
            </View>

            {smartBet && quoteHasFill ? (
              <View className="mt-4 rounded-2xl border border-[#27415A] bg-fathom-bg2 p-3">
                <Text className="text-[10px] uppercase tracking-[2px] text-fathom-subtext">
                  Latest DeepBook quote
                </Text>
                <Text className="mt-1 text-sm font-semibold text-fathom-text">
                  {smartBetSuiNotional} SUI → ~{expectedQuote} {quoteSymbol}
                </Text>
                <Text className="mt-1 text-[11px] text-fathom-subtext">
                  Quote refreshed live via devInspect on the SUI/{quoteSymbol} pool. Slippage floor:
                  2%.
                </Text>
              </View>
            ) : smartBet && quoteEmpty ? (
              <View className="mt-4 rounded-2xl border border-[#3F2E11] bg-[#1F1809] p-3">
                <Text className="text-[10px] uppercase tracking-[2px] text-[#F2C66B]">
                  Spot leg unavailable right now
                </Text>
                <Text className="mt-1 text-sm font-semibold text-fathom-text">
                  Swipe will mint a plain Predict position
                </Text>
                <Text className="mt-1 text-[11px] text-fathom-subtext">
                  The SUI/{quoteSymbol} book can&apos;t fill {smartBetSuiNotional} SUI right now (it
                  needs ≥ ~1 SUI of depth and DEEP for the fill fee). Rather than ship a no-op, the
                  swipe honestly mints a plain Predict position — Smart Bet re-engages the moment the
                  book can fill. The DeepBook leg is only included when it&apos;s enforceable.
                </Text>
              </View>
            ) : null}

            <Text className="mt-4 text-[11px] leading-4 text-fathom-subtext">
              Smart Bet includes the DeepBook leg only when `router::assert_and_record` can enforce a
              real fill (book has depth + wallet holds DEEP + enough SUI for the size). Otherwise the
              swipe mints a plain Predict position and the Swipe screen shows the reason — never a
              silent no-op.
            </Text>

            <Pressable
              onPress={() => setSheetOpen(false)}
              className="mt-5 rounded-xl bg-fathom-bull px-3 py-3"
            >
              <Text className="text-center text-sm font-semibold text-[#07111A]">Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
