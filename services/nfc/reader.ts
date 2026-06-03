import NfcManager, { NfcTech, Ndef } from "react-native-nfc-manager";

/**
 * Customer-side NFC reader (iOS + Android). Reads the NDEF Text record the
 * Android Brisk Terminal emulates and returns the raw invoice string
 * (`brisk://pay?...`). On iOS this triggers the system "Ready to Scan" sheet;
 * on Android it uses reader mode. Caller parses with parseInvoice().
 */

let started = false;

async function ensureStarted(): Promise<void> {
  if (started) return;
  await NfcManager.start();
  started = true;
}

export async function isNfcSupported(): Promise<boolean> {
  try {
    await ensureStarted();
    return await NfcManager.isSupported();
  } catch {
    return false;
  }
}

/** Whether the NFC radio is turned on (Android can have it toggled off). */
export async function isNfcEnabled(): Promise<boolean> {
  try {
    await ensureStarted();
    return await NfcManager.isEnabled();
  } catch {
    return false;
  }
}

/** Open the OS NFC settings (Android). Best-effort, no-op elsewhere. */
export async function openNfcSettings(): Promise<void> {
  try {
    await NfcManager.goToNfcSetting();
  } catch {
    // best-effort
  }
}

/** Read one NDEF tag and return the decoded text payload, or null. */
export async function readInvoiceTag(): Promise<string | null> {
  await ensureStarted();
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, {
      alertMessage: "Hold your phone near the Brisk Terminal to pay",
    });
    const tag = await NfcManager.getTag();
    const record = tag?.ndefMessage?.[0];
    if (!record?.payload?.length) return null;
    return Ndef.text.decodePayload(Uint8Array.from(record.payload));
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export function cancelRead(): void {
  NfcManager.cancelTechnologyRequest().catch(() => {});
}
