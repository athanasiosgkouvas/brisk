import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import type { AuthSession } from "@/types/user";

const AUTH_SESSION_KEY = "fathom.auth.session";
const POSITIONS_KEY = "fathom.positions.history";
const AUTH_SESSION_FALLBACK_KEY = "fathom.auth.session.fallback";
const BET_AMOUNT_KEY = "fathom.settings.betAmount";
const EARN_HISTORY_KEY = "fathom.earn.history";
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

async function removeLocalValue(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    inMemoryFallback.delete(key);
  }
}

async function setSecureValue(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    await setLocalValue(AUTH_SESSION_FALLBACK_KEY, value);
  }
}

async function getSecureValue(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return getLocalValue(AUTH_SESSION_FALLBACK_KEY);
  }
}

async function deleteSecureValue(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Ignore native secure storage delete failures and clear fallback storage below.
  } finally {
    await removeLocalValue(AUTH_SESSION_FALLBACK_KEY);
  }
}

export async function saveAuthSession(session: AuthSession): Promise<void> {
  await setSecureValue(AUTH_SESSION_KEY, JSON.stringify(session));
}

export async function loadAuthSession(): Promise<AuthSession | null> {
  const value = await getSecureValue(AUTH_SESSION_KEY);
  if (!value) return null;
  return JSON.parse(value) as AuthSession;
}

export async function clearAuthSession(): Promise<void> {
  await deleteSecureValue(AUTH_SESSION_KEY);
}

export async function savePositionHistory(raw: string): Promise<void> {
  await setLocalValue(POSITIONS_KEY, raw);
}

export async function loadPositionHistory(): Promise<string | null> {
  return getLocalValue(POSITIONS_KEY);
}

export async function saveBetAmount(amount: number): Promise<void> {
  await setLocalValue(BET_AMOUNT_KEY, String(amount));
}

export async function loadBetAmount(): Promise<number | null> {
  const raw = await getLocalValue(BET_AMOUNT_KEY);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0.1 ? parsed : null;
}

export async function saveEarnHistory(raw: string): Promise<void> {
  await setLocalValue(EARN_HISTORY_KEY, raw);
}

export async function loadEarnHistory(): Promise<string | null> {
  return getLocalValue(EARN_HISTORY_KEY);
}

const EARN_VAULT_CACHE_KEY = "fathom.earn.vault.cache";

export async function saveEarnVaultCache(raw: string): Promise<void> {
  await setLocalValue(EARN_VAULT_CACHE_KEY, raw);
}

export async function loadEarnVaultCache(): Promise<string | null> {
  return getLocalValue(EARN_VAULT_CACHE_KEY);
}

const RESPONSIBLE_SETTINGS_KEY = "fathom.settings.responsible";

export async function saveResponsibleSettings(raw: string): Promise<void> {
  await setLocalValue(RESPONSIBLE_SETTINGS_KEY, raw);
}

export async function loadResponsibleSettings(): Promise<string | null> {
  return getLocalValue(RESPONSIBLE_SETTINGS_KEY);
}
