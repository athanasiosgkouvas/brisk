import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import type { AuthSession } from "@/types/user";

const AUTH_SESSION_KEY = "brisk.auth.session";
const AUTH_SESSION_FALLBACK_KEY = "brisk.auth.session.fallback";
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
