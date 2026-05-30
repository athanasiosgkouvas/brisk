import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { Activity } from "lucide-react-native";

import { fetchDeepbookTicker } from "@/services/api/backendApi";
import { DEEPBOOK, ENV } from "@/utils/constants";

/**
 * Live DeepBook SUI/DBUSDC ticker — the real orderbook the Smart Bet spot leg
 * trades against. This is honest live market data straight from the CLOB; it
 * is NOT used to price the prediction markets (those are BTC-only on testnet
 * and the DBTC book is empty). Hidden in demo mode and when the feed has no
 * fresh sample.
 */
const STALE_MS = 90_000;

export function DeepBookTicker() {
  const { data } = useQuery({
    queryKey: ["deepbook-ticker"],
    queryFn: fetchDeepbookTicker,
    refetchInterval: 15_000,
    staleTime: 10_000,
    enabled: !ENV.demoMode,
  });

  const ticker = data?.ticker;
  if (!ticker || ticker.midMicro <= 0) return null;

  const usd = ticker.midMicro / ticker.microPerUsd;
  const fresh = ticker.ageMs <= STALE_MS && data?.feedRunning;
  const spread = ticker.spreadBps != null ? `${ticker.spreadBps}bp spread` : "spread n/a";

  return (
    <View className="mb-3 flex-row items-center gap-2 rounded-2xl border border-[#27415A] bg-fathom-bg1 px-3 py-2">
      <Activity size={14} color={fresh ? "#3FB950" : "#8B98A5"} />
      <Text className="text-[10px] uppercase tracking-[2px] text-fathom-subtext">
        DeepBook SUI/{DEEPBOOK.quoteSymbol}
      </Text>
      <Text className="flex-1 text-right text-[12px] font-semibold text-fathom-text">
        ${usd.toFixed(4)}
      </Text>
      <Text className="text-[10px] text-fathom-subtext">
        {spread} · {fresh ? "live" : "stale"}
      </Text>
    </View>
  );
}
