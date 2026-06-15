import { Platform } from "react-native";

import { ENV } from "@/utils/constants";

// The native deep-link scheme that expo-web-browser listens for to detect OAuth completion.
// The backend /auth/callback endpoint redirects to this scheme after receiving Google's response.
export const NATIVE_OAUTH_SCHEME = "brisk://oauth";

type BuildFastGoogleAuthRequestArgs = {
  nonce: string;
};

export function getGoogleRedirectUri(): string {
  if (Platform.OS === "web") {
    if (ENV.googleRedirectUri.trim()) return ENV.googleRedirectUri.trim();
    if (typeof window !== "undefined") return window.location.origin;
  }

  // Native: point to the backend proxy endpoint.
  // Google's web client ID only accepts https:// redirect URIs, not custom schemes.
  // The backend will bounce the response to brisk://oauth so expo-web-browser can intercept it.
  return `${ENV.backendUrl}/auth/callback`;
}

export function buildFastGoogleAuthRequest({ nonce }: BuildFastGoogleAuthRequestArgs) {
  const redirectUri = getGoogleRedirectUri();
  const query = new URLSearchParams({
    client_id: ENV.googleClientId,
    response_type: "id_token",
    redirect_uri: redirectUri,
    scope: "openid email profile",
    nonce,
  });

  return { redirectUri, query };
}

export function getFastGoogleSessionOptions() {
  return Platform.OS === "ios" ? { preferEphemeralSession: false } : undefined;
}
