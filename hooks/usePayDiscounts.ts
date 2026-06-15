import { useCallback, useState } from "react";

import { useGiftCards, type GiftCardView } from "@/hooks/useGiftCards";

export type DiscountPlan = {
  card: GiftCardView | null;
  giftAppliedMicros: number;
  payableMicros: number;
};

/**
 * Pay-time gift-card credit for a merchant: the customer's claimed card at that
 * merchant (if any), the toggle, and the recomputed total. `hasAnyDiscount` is
 * false (pay UI unchanged) when there's no card to apply.
 */
export function usePayDiscounts(merchantId: string | undefined, saleMicros: number) {
  const { cardForMerchant } = useGiftCards();
  const [applyGift, setApplyGift] = useState(true);

  const card = merchantId ? cardForMerchant(merchantId) : null;
  const giftAvailable = card?.balanceMicros ?? 0;
  const giftAppliedMicros = applyGift ? Math.min(giftAvailable, saleMicros) : 0;
  const payableMicros = Math.max(0, saleMicros - giftAppliedMicros);
  const hasAnyDiscount = giftAvailable > 0;

  const buildDiscountPlan = useCallback(
    (): DiscountPlan => ({
      card: applyGift ? card : null,
      giftAppliedMicros,
      payableMicros,
    }),
    [card, applyGift, giftAppliedMicros, payableMicros],
  );

  return {
    hasAnyDiscount,
    giftAvailable,
    giftAppliedMicros,
    payableMicros,
    applyGift,
    setApplyGift,
    buildDiscountPlan,
  };
}
