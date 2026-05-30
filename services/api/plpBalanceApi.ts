import { suiClient } from "@/services/blockchain/suiClient";
import { PLP_TYPE } from "@/utils/constants";

export interface PlpCoin {
  coinObjectId: string;
  balance: number;
}

export interface PlpBalance {
  coins: PlpCoin[];
  totalMicro: number;
}

/**
 * Demo-mode synthetic PLP balance derived from local Earn history. One
 * pseudo coin object exposes the full aggregate so the withdraw PTB
 * (which merges coins before splitting) still has a valid shape — though
 * in demo mode withdraw never actually executes.
 */
export function getMockPlpBalance(totalMicro: number): PlpBalance {
  const safe = Math.max(0, Math.floor(totalMicro));
  if (safe === 0) return { coins: [], totalMicro: 0 };
  return {
    coins: [{ coinObjectId: "0xdemo-plp", balance: safe }],
    totalMicro: safe,
  };
}

/** Fetch every PLP coin object owned by `address`, plus the aggregate. */
export async function fetchPlpBalance(address: string): Promise<PlpBalance> {
  const result = await suiClient.getCoins({ owner: address, coinType: PLP_TYPE, limit: 50 });
  const coins = result.data.map((c) => ({
    coinObjectId: c.coinObjectId,
    balance: Number(c.balance ?? "0"),
  }));
  const totalMicro = coins.reduce((sum, c) => sum + c.balance, 0);
  return { coins, totalMicro };
}
