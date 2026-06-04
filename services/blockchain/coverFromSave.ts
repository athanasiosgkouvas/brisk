import { Alert } from "react-native";

import type { AuthSession } from "@/types/user";
import { getSpendableUsdcMicros } from "@/services/blockchain/wallet";
import { getSaveState, withdrawFromSave } from "@/services/blockchain/saveAccount";
import { formatUsd } from "@/services/blockchain/paymentTx";

/**
 * "Cover from Save" — the manual-buckets superpower. Before a payment, if the
 * Wallet's spendable balance is short, offer to top it up from the yield-bearing
 * Save vault in one gasless step, then let the payment proceed. Save earns yield
 * AND stays instantly spendable.
 */

type CoverPlan =
  | { needed: false }
  | {
      needed: true;
      canCover: boolean;
      shortfallMicros: number;
      saveValueMicros: number;
      vaultId: string | null;
    };

/** Decide whether a payment of `amountMicros` needs (and can get) a Save top-up. */
export async function planCover(session: AuthSession, amountMicros: number): Promise<CoverPlan> {
  const spendable = await getSpendableUsdcMicros(session.address);
  if (spendable >= amountMicros) return { needed: false };
  const shortfallMicros = amountMicros - spendable;
  const save = await getSaveState(session.address);
  return {
    needed: true,
    canCover: !!save.vaultId && save.valueMicros >= shortfallMicros,
    shortfallMicros,
    saveValueMicros: save.valueMicros,
    vaultId: save.vaultId,
  };
}

function confirmCover(shortfallMicros: number, saveValueMicros: number): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Cover from Save?",
      `Your Wallet is ${formatUsd(shortfallMicros)} short. Move it from Save (${formatUsd(saveValueMicros)}) to complete this payment?`,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Cover & Pay", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Withdraw `shortfallMicros` from Save, then wait until the funds are spendable. */
async function coverFromSave(
  session: AuthSession,
  vaultId: string,
  shortfallMicros: number,
  targetSpendableMicros: number,
): Promise<void> {
  await withdrawFromSave(session, vaultId, shortfallMicros);
  // The withdrawn coin lands in the wallet; poll until it's spendable so the
  // gasless pay leg doesn't race indexing.
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if ((await getSpendableUsdcMicros(session.address)) >= targetSpendableMicros) return;
    await new Promise((r) => setTimeout(r, 1_500));
  }
}

/**
 * Pre-flight a payment: if the Wallet covers it, proceed; if not, prompt to cover
 * the shortfall from Save and do it. Returns "proceed" to continue or "cancelled"
 * if the user declined. Throws if neither Wallet nor Save can cover the amount.
 */
export async function ensureSpendable(
  session: AuthSession,
  amountMicros: number,
): Promise<"proceed" | "cancelled"> {
  const plan = await planCover(session, amountMicros);
  if (!plan.needed) return "proceed";
  if (!plan.canCover || !plan.vaultId) {
    throw new Error("Not enough in your Wallet or Save to cover this payment.");
  }
  const ok = await confirmCover(plan.shortfallMicros, plan.saveValueMicros);
  if (!ok) return "cancelled";
  await coverFromSave(session, plan.vaultId, plan.shortfallMicros, amountMicros);
  return "proceed";
}
