import { NativeModules, Platform } from "react-native";
import { Ndef } from "react-native-nfc-manager";
import { toBase64 } from "@mysten/sui/utils";

/**
 * Merchant-side HCE (Android only — the "Brisk Terminal"). Drives our custom
 * native module (BriskHce, see plugins/hce-android): it emulates an NFC Forum
 * Type-4 tag carrying the invoice as an NDEF Text record. The customer taps to
 * read it. iOS can't present a tag (no entitlement-free HCE), so the Charge
 * screen gates this to Android and offers QR as the fallback.
 */

type BriskHceNative = {
  setNdefMessage: (base64: string) => Promise<boolean>;
  stop: () => Promise<boolean>;
};

const BriskHce = NativeModules.BriskHce as BriskHceNative | undefined;

export const isHceAvailable = Platform.OS === "android" && !!BriskHce;

/** Start emulating a tag carrying `invoiceUri` (a brisk://pay?... string). */
export async function startEmulatingInvoice(invoiceUri: string): Promise<void> {
  if (!BriskHce) throw new Error("HCE (Brisk Terminal) is only available on Android.");
  const bytes = Uint8Array.from(Ndef.encodeMessage([Ndef.textRecord(invoiceUri)]));
  await BriskHce.setNdefMessage(toBase64(bytes));
}

/** Stop emulating (call when the charge is settled or cancelled). */
export async function stopEmulating(): Promise<void> {
  if (!BriskHce) return;
  try {
    await BriskHce.stop();
  } catch {
    // best-effort
  }
}
