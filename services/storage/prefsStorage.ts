import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ExpoCrypto from "expo-crypto";

/**
 * Non-sensitive UI preferences (e.g. Personal/Pro app mode). Unlike the auth
 * session — which lives in encrypted SecureStore (see sessionStorage.ts) — these
 * are plain device-local prefs, so AsyncStorage (with an in-memory fallback for
 * environments where it throws) is the right tier.
 */

const APP_MODE_KEY = "brisk.app.mode";
const THEME_KEY = "brisk.theme.scheme";
const PRO_PROVISIONED_KEY = "brisk.pro.provisioned";
const MERCHANT_NAME_KEY = "brisk.merchant.name";
const POS_DEVICE_ID_KEY = "brisk.pos.deviceId";
const POS_TERMINAL_ID_KEY = "brisk.pos.terminalId";
const POS_TERMINAL_TOKEN_KEY = "brisk.pos.terminalToken";
const inMemoryFallback = new Map<string, string>();

async function setLocalValue(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    inMemoryFallback.set(key, value);
  }
}

async function getLocalValue(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return inMemoryFallback.get(key) ?? null;
  }
}

export type AppMode = "personal" | "pro";

export async function saveAppMode(mode: AppMode): Promise<void> {
  await setLocalValue(APP_MODE_KEY, mode);
}

export async function loadAppMode(): Promise<AppMode> {
  const value = await getLocalValue(APP_MODE_KEY);
  return value === "pro" ? "pro" : "personal";
}

export type ThemeScheme = "light" | "dark";

export async function saveThemeScheme(scheme: ThemeScheme): Promise<void> {
  await setLocalValue(THEME_KEY, scheme);
}

export async function loadThemeScheme(): Promise<ThemeScheme> {
  // Default to dark to preserve the current look for existing users.
  const value = await getLocalValue(THEME_KEY);
  return value === "light" ? "light" : "dark";
}

/**
 * Whether Pro has been provisioned (merchant + a receiving account exist). Once
 * true, switching into Pro is instant — no per-switch on-chain setup check.
 */
export async function saveProProvisioned(provisioned: boolean): Promise<void> {
  await setLocalValue(PRO_PROVISIONED_KEY, provisioned ? "1" : "0");
}

export async function loadProProvisioned(): Promise<boolean> {
  return (await getLocalValue(PRO_PROVISIONED_KEY)) === "1";
}

/** The merchant's business name, cached locally so the dashboard/charge show it
 *  instantly (the directory on the backend is the source of truth). */
export async function saveMerchantName(name: string): Promise<void> {
  await setLocalValue(MERCHANT_NAME_KEY, name);
}

export async function loadMerchantName(): Promise<string | null> {
  return getLocalValue(MERCHANT_NAME_KEY);
}

/**
 * A stable per-device key Brisk generates once and persists. It's an internal
 * routing key (not shown to anyone): the backend maps it to a short, human-
 * typeable terminal code that stays bound to this device across re-registrations.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getLocalValue(POS_DEVICE_ID_KEY);
  if (existing) return existing;
  const id = ExpoCrypto.randomUUID();
  await setLocalValue(POS_DEVICE_ID_KEY, id);
  return id;
}

/** The short terminal code the backend assigned this device (shown to the
 *  merchant to configure their ERP). Cached so it displays instantly. */
export async function saveTerminalId(terminalId: string): Promise<void> {
  await setLocalValue(POS_TERMINAL_ID_KEY, terminalId);
}

export async function loadTerminalId(): Promise<string | null> {
  return getLocalValue(POS_TERMINAL_ID_KEY);
}

/** The auth token returned by the backend when this terminal registered. Used
 *  for the terminal WebSocket + reporting sale results. */
export async function saveTerminalToken(token: string): Promise<void> {
  await setLocalValue(POS_TERMINAL_TOKEN_KEY, token);
}

export async function loadTerminalToken(): Promise<string | null> {
  return getLocalValue(POS_TERMINAL_TOKEN_KEY);
}

/**
 * Gift-card share links the user can still hand out — cards they minted (and
 * haven't shared the link for yet) or re-gifted. The claim SECRET lives ONLY
 * here on the issuer's device and in the share link, never on the backend, so
 * losing it (e.g. dismissing the buy screen before copying) would otherwise make
 * the card unrecoverable. Keyed per owner address so accounts don't see each
 * other's links on a shared device.
 */
export type IssuedGiftCard = {
  objectId: string;
  merchantId: string;
  faceValueMicros: number;
  claimCode: string;
  secretHex: string;
  url: string;
  createdAtMs: number;
};

const ISSUED_GIFTCARDS_PREFIX = "brisk.giftcards.issued.";

export async function loadIssuedGiftCards(owner: string): Promise<IssuedGiftCard[]> {
  const raw = await getLocalValue(`${ISSUED_GIFTCARDS_PREFIX}${owner}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as IssuedGiftCard[]) : [];
  } catch {
    return [];
  }
}

export async function saveIssuedGiftCards(owner: string, cards: IssuedGiftCard[]): Promise<void> {
  await setLocalValue(`${ISSUED_GIFTCARDS_PREFIX}${owner}`, JSON.stringify(cards));
}

/** Upsert one issued/re-gifted card (newest first; replaces an existing entry
 *  for the same object id, e.g. after a re-gift swaps in a new secret). */
export async function addIssuedGiftCard(owner: string, card: IssuedGiftCard): Promise<void> {
  const cards = await loadIssuedGiftCards(owner);
  const next = [card, ...cards.filter((c) => c.objectId !== card.objectId)];
  await saveIssuedGiftCards(owner, next);
}
