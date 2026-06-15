import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import {
  purchaseGiftCard,
  claimGiftCard,
  regiftGiftCard,
  readGiftCard,
} from "@/services/blockchain/giftCard";
import { listMyGiftCards } from "@/services/api/backendApi";
import {
  loadIssuedGiftCards,
  addIssuedGiftCard,
  saveIssuedGiftCards,
  type IssuedGiftCard,
} from "@/services/storage/prefsStorage";

export type GiftCardView = {
  objectId: string;
  merchantId: string;
  claimCode: string;
  faceValueMicros: number;
  balanceMicros: number;
};

/** A gift-card share link the user can still hand out (unclaimed). */
export type ShareableGiftCard = {
  objectId: string;
  merchantId: string;
  faceValueMicros: number;
  url: string;
};

/**
 * The customer's gift cards. Two buckets:
 *  - `cards` — cards they HOLD (claimed to their address) with value left, read
 *    on-chain; redeemable at the issuing merchant and re-giftable.
 *  - `shareable` — links they ISSUED or RE-GIFTED that nobody has claimed yet,
 *    persisted locally (the claim secret lives only on-device + in the link).
 * The backend indexes which cards are theirs; on-chain is the source of truth
 * for balance + current recipient.
 */
export function useGiftCards() {
  const { session } = useAuth();
  const [cards, setCards] = useState<GiftCardView[]>([]);
  const [shareable, setShareable] = useState<ShareableGiftCard[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const addr = session?.address;
    if (!addr) {
      setLoading(false);
      return;
    }
    try {
      // Held cards: backend lists the ids; on-chain decides if still mine + funded.
      const rows = await listMyGiftCards(addr);
      const held = await Promise.all(
        rows.map(async (r) => {
          const live = await readGiftCard(r.objectId).catch(() => null);
          return {
            objectId: r.objectId,
            merchantId: r.merchantId,
            claimCode: r.claimCode,
            faceValueMicros: r.faceValueMicros,
            balanceMicros: live?.balanceMicros ?? 0,
            recipient: live?.recipient ?? null,
          };
        }),
      );
      setCards(
        held
          .filter((c) => c.recipient === addr && c.balanceMicros > 0)
          .map((c) => ({
            objectId: c.objectId,
            merchantId: c.merchantId,
            claimCode: c.claimCode,
            faceValueMicros: c.faceValueMicros,
            balanceMicros: c.balanceMicros,
          })),
      );

      // Shareable links: locally-stored issued/re-gifted cards still unclaimed.
      const issued = await loadIssuedGiftCards(addr);
      const live = await Promise.all(
        issued.map(async (c) => ({
          card: c,
          chain: await readGiftCard(c.objectId).catch(() => null),
        })),
      );
      // Prune cards fully spent or now claimed by someone else; keep unclaimed +
      // still-mine. Persist the pruned set so the list self-cleans over time.
      const kept: IssuedGiftCard[] = live
        .filter(({ chain }) => chain != null && chain.balanceMicros > 0)
        .filter(({ chain }) => chain!.recipient === null || chain!.recipient === addr)
        .map(({ card }) => card);
      if (kept.length !== issued.length) await saveIssuedGiftCards(addr, kept);
      setShareable(
        live
          .filter(
            ({ chain }) => chain != null && chain.balanceMicros > 0 && chain.recipient === null,
          )
          .map(({ card, chain }) => ({
            objectId: card.objectId,
            merchantId: card.merchantId,
            faceValueMicros: chain!.balanceMicros,
            url: card.url,
          })),
      );
    } catch {
      // keep last known
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useRefreshOnFocus(refresh);

  const buy = useCallback(
    async (input: { merchantId: string; amountMicros: number }) => {
      if (!session) throw new Error("Not signed in");
      const result = await purchaseGiftCard(session, {
        merchantId: input.merchantId,
        faceValueMicros: input.amountMicros,
      });
      // Persist immediately so the link survives even if the user dismisses the
      // share screen before copying it.
      await addIssuedGiftCard(session.address, {
        objectId: result.objectId,
        merchantId: input.merchantId,
        faceValueMicros: result.faceValueMicros,
        claimCode: result.claimCode,
        secretHex: result.secretHex,
        url: result.url,
        createdAtMs: Date.now(),
      });
      void refresh();
      return result;
    },
    [session, refresh],
  );

  const claim = useCallback(
    async (input: { cardId: string; code?: string; secretHex: string }) => {
      if (!session) throw new Error("Not signed in");
      await claimGiftCard(session, input);
      await refresh();
    },
    [session, refresh],
  );

  /** Re-gift a held card onward: reset it on-chain with a fresh secret and return
   *  the new shareable link (also persisted locally so it isn't lost). */
  const regift = useCallback(
    async (input: {
      objectId: string;
      merchantId: string;
      claimCode: string;
      faceValueMicros: number;
    }) => {
      if (!session) throw new Error("Not signed in");
      const { url, secretHex } = await regiftGiftCard(session, {
        cardId: input.objectId,
        claimCode: input.claimCode,
      });
      await addIssuedGiftCard(session.address, {
        objectId: input.objectId,
        merchantId: input.merchantId,
        faceValueMicros: input.faceValueMicros,
        claimCode: input.claimCode,
        secretHex,
        url,
        createdAtMs: Date.now(),
      });
      void refresh();
      return { url };
    },
    [session, refresh],
  );

  /** The customer's spendable card at a merchant (largest balance), or null. */
  const cardForMerchant = useCallback(
    (merchantId: string): GiftCardView | null =>
      cards
        .filter((c) => c.merchantId === merchantId && c.balanceMicros > 0)
        .sort((a, b) => b.balanceMicros - a.balanceMicros)[0] ?? null,
    [cards],
  );

  return { cards, shareable, loading, refresh, buy, claim, regift, cardForMerchant };
}
