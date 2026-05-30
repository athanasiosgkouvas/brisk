import { useMemo, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { ExternalLink, ListOrdered } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { useDeepBookLimitOrders, type PlacedOrder } from "@/hooks/useDeepBookLimitOrders";
import { fetchDeepbookTicker } from "@/services/api/backendApi";
import { DEEPBOOK, ENV } from "@/utils/constants";

type Side = "ASK" | "BID";

/**
 * Genuine DeepBook maker orders from the Profile tab — create a shared
 * BalanceManager once, then rest / cancel real limit orders on the SUI/DBUSDC
 * book (sponsored). This is true CLOB participation, distinct from the
 * market-taking "DeepBook swap" panel. Min size ~1 SUI (book lot size).
 */
export function DeepBookMakerPanel() {
  const { placeLimitOrder, cancelOrder, balanceManagerId, running, lastError } =
    useDeepBookLimitOrders();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<Side>("ASK");
  const [priceText, setPriceText] = useState("");
  const [sizeText, setSizeText] = useState("1");
  const [lastOrder, setLastOrder] = useState<PlacedOrder | null>(null);
  const [canceled, setCanceled] = useState(false);

  const { data: tickerResp } = useQuery({
    queryKey: ["deepbook-ticker"],
    queryFn: fetchDeepbookTicker,
    refetchInterval: 15_000,
    enabled: !ENV.demoMode,
  });
  const midUsd = tickerResp?.ticker ? tickerResp.ticker.midMicro / tickerResp.ticker.microPerUsd : null;
  const quoteSymbol = DEEPBOOK.quoteSymbol;

  // Default price parks the order off the mid (won't fill → rests): asks above,
  // bids below.
  const defaultPriceFor = (s: Side) =>
    midUsd ? (s === "ASK" ? midUsd * 1.1 : midUsd * 0.9).toFixed(4) : "";

  const price = useMemo(() => {
    const p = Number(priceText);
    return Number.isFinite(p) && p > 0 ? p : 0;
  }, [priceText]);
  const size = useMemo(() => {
    const s = Number(sizeText);
    return Number.isFinite(s) && s > 0 ? s : 0;
  }, [sizeText]);

  const openModal = () => {
    setPriceText(defaultPriceFor(side));
    setCanceled(false);
    setOpen(true);
  };

  const handlePlace = async () => {
    if (price <= 0 || size <= 0) return;
    try {
      const placed = await placeLimitOrder({ priceUsd: price, sizeSui: size, isBid: side === "BID" });
      setLastOrder(placed);
      setCanceled(false);
    } catch {
      // surfaced via lastError
    }
  };

  const handleCancel = async () => {
    if (!lastOrder?.orderId) return;
    try {
      await cancelOrder(lastOrder.orderId);
      setCanceled(true);
    } catch {
      // surfaced via lastError
    }
  };

  return (
    <View className="mt-4 rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
      <View className="flex-row items-center gap-2">
        <ListOrdered size={16} color="#8B98A5" />
        <Text className="text-[11px] uppercase tracking-wide text-fathom-subtext">
          DeepBook maker order
        </Text>
      </View>
      <Text className="mt-1 text-sm text-fathom-text">
        Rest a real limit order on the SUI/{quoteSymbol} orderbook via your own BalanceManager —
        genuine CLOB liquidity, sponsored end-to-end.
      </Text>
      {balanceManagerId ? (
        <Text className="mt-2 text-[11px] text-fathom-subtext">
          BalanceManager {balanceManagerId.slice(0, 8)}…{balanceManagerId.slice(-4)}
        </Text>
      ) : (
        <Text className="mt-2 text-[11px] text-fathom-subtext">
          First order creates your shared BalanceManager automatically.
        </Text>
      )}
      <View className="mt-4">
        <PrimaryButton label="Open order ticket" onPress={openModal} variant="secondary" />
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
              DeepBook v3 · limit order
            </Text>
            <Text className="mt-1 text-xl font-bold text-fathom-text">Maker order</Text>
            {midUsd ? (
              <Text className="mt-1 text-[11px] text-fathom-subtext">
                Live mid ~${midUsd.toFixed(4)} {quoteSymbol}/SUI
              </Text>
            ) : null}

            <View className="mt-4 flex-row gap-2">
              {(["ASK", "BID"] as Side[]).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => {
                    setSide(s);
                    setPriceText(defaultPriceFor(s));
                  }}
                  className={`flex-1 rounded-xl border px-3 py-2 ${
                    side === s ? "border-fathom-bull bg-[#0F231E]" : "border-[#2A4A66] bg-fathom-bg2"
                  }`}
                >
                  <Text
                    className={`text-center text-[12px] font-semibold ${
                      side === s ? "text-fathom-bull" : "text-fathom-text"
                    }`}
                  >
                    {s === "ASK" ? `Sell SUI (ask)` : `Buy SUI (bid)`}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text className="mt-4 text-[10px] uppercase tracking-[2px] text-fathom-subtext">
              Price ({quoteSymbol}/SUI)
            </Text>
            <TextInput
              className="mt-2 rounded-xl border border-[#2A4A66] bg-fathom-bg2 px-3 py-2 text-base font-semibold text-fathom-text"
              value={priceText}
              onChangeText={setPriceText}
              keyboardType="decimal-pad"
              selectTextOnFocus
              returnKeyType="done"
            />
            <Text className="mt-3 text-[10px] uppercase tracking-[2px] text-fathom-subtext">
              Size (SUI · min ~1)
            </Text>
            <TextInput
              className="mt-2 rounded-xl border border-[#2A4A66] bg-fathom-bg2 px-3 py-2 text-base font-semibold text-fathom-text"
              value={sizeText}
              onChangeText={setSizeText}
              keyboardType="decimal-pad"
              selectTextOnFocus
              returnKeyType="done"
            />
            <Text className="mt-2 text-[11px] text-fathom-subtext">
              We deposit a little above notional into your BalanceManager to cover the maker lock;
              the surplus stays withdrawable.
            </Text>

            {lastError ? <Text className="mt-3 text-xs text-fathom-bear">{lastError}</Text> : null}
            {lastOrder ? (
              <View className="mt-3 rounded-2xl border border-fathom-bull/40 bg-[#0F231E] p-3">
                <View className="flex-row items-center gap-2">
                  <ExternalLink size={14} color="#00D98B" />
                  <Text className="flex-1 text-[11px] text-fathom-bull">
                    {canceled ? "Order canceled" : "Order resting on the book"} · digest{" "}
                    {lastOrder.digest.slice(0, 8)}…{lastOrder.digest.slice(-6)}
                  </Text>
                </View>
                {lastOrder.orderId ? (
                  <Text className="mt-1 text-[10px] text-fathom-subtext">
                    order id {lastOrder.orderId.slice(0, 14)}…
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View className="mt-4 flex-row gap-2">
              <Pressable
                onPress={() => setOpen(false)}
                className="flex-1 rounded-xl border border-[#2A4A66] bg-fathom-bg2 px-3 py-3"
              >
                <Text className="text-center text-sm font-semibold text-fathom-text">Close</Text>
              </Pressable>
              {lastOrder && !canceled ? (
                <View className="flex-1">
                  <PrimaryButton
                    label={running ? "Canceling…" : "Cancel order"}
                    loading={running}
                    disabled={!lastOrder.orderId}
                    onPress={() => void handleCancel()}
                  />
                </View>
              ) : (
                <View className="flex-1">
                  <PrimaryButton
                    label={running ? "Placing…" : "Place order"}
                    loading={running}
                    disabled={price <= 0 || size <= 0}
                    onPress={() => void handlePlace()}
                  />
                </View>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
