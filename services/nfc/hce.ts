import { Platform } from "react-native";

/**
 * Merchant-side HCE (Android only — the "Brisk Terminal"). Emulates an NFC
 * Forum Type-4 tag carrying the invoice as an NDEF Text record. The customer
 * taps to read it. iOS cannot present a tag (no HCE without an EEA entitlement),
 * so the Charge screen gates this to Android and offers QR as the fallback.
 *
 * Lazily imported so the iOS bundle never touches the Android-only native module.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HceSession = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let hceModule: any = null;
let session: HceSession = null;

export const isHceAvailable = Platform.OS === "android";

async function loadHce() {
  if (!isHceAvailable) throw new Error("HCE (Brisk Terminal) is only available on Android.");
  if (!hceModule) hceModule = await import("react-native-hce");
  return hceModule;
}

/** Start emulating a tag carrying `invoiceUri`. Returns once HCE is enabled. */
export async function startEmulatingInvoice(invoiceUri: string): Promise<void> {
  const { HCESession, NFCTagType4, NFCTagType4NDEFContentType } = await loadHce();
  const tag = new NFCTagType4({
    type: NFCTagType4NDEFContentType.Text,
    content: invoiceUri,
    writable: false,
  });
  session = await HCESession.getInstance();
  await session.setApplication(tag);
  await session.setEnabled(true);
}

/** Stop emulating (call when the charge is settled or cancelled). */
export async function stopEmulating(): Promise<void> {
  if (!session) return;
  try {
    await session.setEnabled(false);
  } catch {
    // best-effort
  } finally {
    session = null;
  }
}
