import type { ZkLoginSignatureInputs } from "@mysten/sui/zklogin";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import * as ExpoCrypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import type { AuthSession as StoredAuthSession } from "@/types/user";
import { ENV, OAUTH } from "@/utils/constants";
import {
  buildFastGoogleAuthRequest,
  getFastGoogleSessionOptions,
  NATIVE_OAUTH_SCHEME,
} from "@/services/auth/fastSignInService";
import {
  clearAuthSession,
  loadAuthSession,
  saveAuthSession,
} from "@/services/storage/sessionStorage";

WebBrowser.maybeCompleteAuthSession();

function parseIdTokenFromUrl(url: string): string | null {
  const [base, fragment = ""] = url.split("#");
  const params = new URLSearchParams(fragment);
  const query = base.includes("?") ? base.split("?")[1] : "";
  const queryParams = new URLSearchParams(query);
  return params.get("id_token") ?? queryParams.get("id_token");
}

function parseOAuthErrorFromUrl(url: string): string | null {
  const [base, fragment = ""] = url.split("#");
  const query = base.includes("?") ? base.split("?")[1] : "";
  const fragmentParams = new URLSearchParams(fragment);
  const queryParams = new URLSearchParams(query);
  const error = fragmentParams.get("error") ?? queryParams.get("error");
  if (!error) return null;
  const description =
    fragmentParams.get("error_description") ?? queryParams.get("error_description") ?? "";
  return description ? `${error}: ${description}` : error;
}

function requireConfiguredCredentials(): void {
  if (!ENV.enokiApiKey) throw new Error("Missing EXPO_PUBLIC_ENOKI_API_KEY");
  if (!ENV.googleClientId) throw new Error("Missing EXPO_PUBLIC_GOOGLE_CLIENT_ID");
}

function ensureWalletStandardGlobals(): void {
  const g = globalThis as {
    Event?: new (type: string) => { type: string };
    CustomEvent?: new (type: string, init?: { detail?: unknown }) => { type: string };
  };

  if (typeof g.Event === "undefined") {
    g.Event = class {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    };
  }
  if (typeof g.CustomEvent === "undefined") {
    const BaseEvent = g.Event;
    g.CustomEvent = class extends BaseEvent {
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        super(type);
        this.detail = init?.detail;
      }
    };
  }
}

function ensureCryptoGlobals(): void {
  const g = globalThis as {
    crypto?: {
      getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
      randomUUID?: () => string;
    };
  };

  if (!g.crypto) {
    g.crypto = {};
  }
  if (typeof g.crypto.getRandomValues !== "function") {
    g.crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T =>
      ExpoCrypto.getRandomValues(array as never) as T;
  }
  if (typeof g.crypto.randomUUID !== "function") {
    g.crypto.randomUUID = () => ExpoCrypto.randomUUID();
  }
}

export class EnokiAuthService {
  private enokiClient: unknown | null = null;

  private async getEnokiClient(): Promise<{
    createZkLoginNonce: (input: {
      network: "mainnet" | "testnet" | "devnet";
      ephemeralPublicKey: unknown;
    }) => Promise<{
      nonce: string;
      randomness: string;
      maxEpoch: number;
      estimatedExpiration: number;
    }>;
    getZkLogin: (input: { jwt: string }) => Promise<{
      address: string;
      publicKey: string;
      salt: string;
    }>;
    createZkLoginZkp: (input: {
      network: "mainnet" | "testnet" | "devnet";
      jwt: string;
      ephemeralPublicKey: unknown;
      randomness: string;
      maxEpoch: number;
    }) => Promise<unknown>;
  }> {
    if (this.enokiClient) {
      return this.enokiClient as {
        createZkLoginNonce: (input: {
          network: "mainnet" | "testnet" | "devnet";
          ephemeralPublicKey: unknown;
        }) => Promise<{
          nonce: string;
          randomness: string;
          maxEpoch: number;
          estimatedExpiration: number;
        }>;
        getZkLogin: (input: { jwt: string }) => Promise<{
          address: string;
          publicKey: string;
          salt: string;
        }>;
        createZkLoginZkp: (input: {
          network: "mainnet" | "testnet" | "devnet";
          jwt: string;
          ephemeralPublicKey: unknown;
          randomness: string;
          maxEpoch: number;
        }) => Promise<unknown>;
      };
    }
    ensureWalletStandardGlobals();
    const { EnokiClient } = await import("@mysten/enoki");
    this.enokiClient = new EnokiClient({ apiKey: ENV.enokiApiKey });
    return this.enokiClient as {
      createZkLoginNonce: (input: {
        network: "mainnet" | "testnet" | "devnet";
        ephemeralPublicKey: unknown;
      }) => Promise<{
        nonce: string;
        randomness: string;
        maxEpoch: number;
        estimatedExpiration: number;
      }>;
      getZkLogin: (input: { jwt: string }) => Promise<{
        address: string;
        publicKey: string;
        salt: string;
      }>;
      createZkLoginZkp: (input: {
        network: "mainnet" | "testnet" | "devnet";
        jwt: string;
        ephemeralPublicKey: unknown;
        randomness: string;
        maxEpoch: number;
      }) => Promise<unknown>;
    };
  }

  async restoreSession(): Promise<StoredAuthSession | null> {
    return loadAuthSession();
  }

  async logout(): Promise<void> {
    await clearAuthSession();
  }

  async loginWithGoogle(): Promise<StoredAuthSession> {
    requireConfiguredCredentials();
    ensureCryptoGlobals();

    const enokiClient = await this.getEnokiClient();
    const ephemeral = new Ed25519Keypair();
    const nonceResult = await enokiClient.createZkLoginNonce({
      network: ENV.suiNetwork,
      ephemeralPublicKey: ephemeral.getPublicKey(),
    });

    const { redirectUri, query } = buildFastGoogleAuthRequest({ nonce: nonceResult.nonce });
    const authUrl = `${OAUTH.googleAuthEndpoint}?${query.toString()}`;

    const authResult = await WebBrowser.openAuthSessionAsync(
      authUrl,
      // On native, listen for brisk://oauth (the backend proxy bounces here).
      // On web, the redirect_uri IS the destination so pass it directly.
      Platform.OS === "web" ? redirectUri : NATIVE_OAUTH_SCHEME,
      getFastGoogleSessionOptions(),
    );
    if (authResult.type !== "success") {
      throw new Error(
        `Google login failed (${authResult.type}). Check OAuth client type and redirect URI for this flow.`,
      );
    }

    const oauthError = parseOAuthErrorFromUrl(authResult.url);
    if (oauthError) {
      throw new Error(`Google OAuth error: ${oauthError}`);
    }

    const jwt = parseIdTokenFromUrl(authResult.url);
    if (!jwt) {
      throw new Error("Missing id_token in OAuth callback");
    }

    const zkLogin = await enokiClient.getZkLogin({ jwt });
    const proof = await enokiClient.createZkLoginZkp({
      network: ENV.suiNetwork,
      jwt,
      ephemeralPublicKey: ephemeral.getPublicKey(),
      randomness: nonceResult.randomness,
      maxEpoch: nonceResult.maxEpoch,
    });

    const ephemeralSecretKey = toBase64(decodeSuiPrivateKey(ephemeral.getSecretKey()).secretKey);

    const session: StoredAuthSession = {
      address: zkLogin.address,
      publicKey: zkLogin.publicKey,
      salt: zkLogin.salt,
      jwt,
      maxEpoch: nonceResult.maxEpoch,
      randomness: nonceResult.randomness,
      expiresAt: nonceResult.estimatedExpiration,
      ephemeralSecretKey,
      proof: proof as ZkLoginSignatureInputs,
    };

    await saveAuthSession(session);
    return session;
  }

  private async createSigner(session: StoredAuthSession): Promise<{
    signTransaction: (bytes: Uint8Array) => Promise<{ signature: string }>;
  }> {
    ensureWalletStandardGlobals();
    ensureCryptoGlobals();
    const { EnokiKeypair } = await import("@mysten/enoki");
    const ephemeralKeypair = Ed25519Keypair.fromSecretKey(fromBase64(session.ephemeralSecretKey));
    return new EnokiKeypair({
      address: session.address,
      proof: session.proof,
      maxEpoch: session.maxEpoch,
      ephemeralKeypair,
    });
  }

  async signSponsoredTransaction(
    sponsoredBytesBase64: string,
    session: StoredAuthSession,
  ): Promise<string> {
    const signer = await this.createSigner(session);
    const bytes = fromBase64(sponsoredBytesBase64);
    const { signature } = await signer.signTransaction(bytes);
    return signature;
  }
}

export const enokiAuthService = new EnokiAuthService();
