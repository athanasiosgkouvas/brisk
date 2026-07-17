import { EnokiClient, EnokiKeypair } from "@mysten/enoki";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import type { ZkLoginSignatureInputs } from "@mysten/sui/zklogin";

import { assertConfigured, CONFIG, GOOGLE_AUTH_ENDPOINT } from "./config";

// A zkLogin session — the browser analogue of the app's AuthSession
// (services/storage/sessionStorage.ts). Held in localStorage; the ephemeral
// secret is short-lived (until maxEpoch) and cleared after a payment.
export type WebSession = {
  address: string;
  publicKey: string;
  salt: string;
  jwt: string;
  maxEpoch: number;
  randomness: string;
  expiresAt: number;
  ephemeralSecretKey: string;
  proof: ZkLoginSignatureInputs;
};

// Stashed across the Google redirect (we leave the page and come back).
type Pending = {
  code: string;
  ephemeralSecretKey: string;
  randomness: string;
  maxEpoch: number;
  expiresAt: number;
};

const SESSION_KEY = "brisk.web.session";
const PENDING_KEY = "brisk.web.pending";

let enoki: EnokiClient | null = null;
function client(): EnokiClient {
  if (!enoki) enoki = new EnokiClient({ apiKey: CONFIG.enokiApiKey });
  return enoki;
}

function isExpired(s: { expiresAt: number }): boolean {
  return Date.now() >= s.expiresAt - 60_000;
}

export function loadSession(): WebSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as WebSession;
    if (isExpired(s)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Begin Google zkLogin: mint an ephemeral key + Enoki nonce, stash what we need
 * to finish after the redirect, then hand off to Google (implicit id_token flow).
 * This navigates away; `completeLoginFromRedirect` picks up on return.
 */
export async function startLogin(code: string): Promise<never> {
  assertConfigured();
  const ephemeral = new Ed25519Keypair();
  const nonce = await client().createZkLoginNonce({
    network: CONFIG.suiNetwork,
    ephemeralPublicKey: ephemeral.getPublicKey(),
  });

  const pending: Pending = {
    code,
    ephemeralSecretKey: toBase64(decodeSuiPrivateKey(ephemeral.getSecretKey()).secretKey),
    randomness: nonce.randomness,
    maxEpoch: nonce.maxEpoch,
    expiresAt: nonce.estimatedExpiration,
  };
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));

  const query = new URLSearchParams({
    client_id: CONFIG.googleClientId,
    response_type: "id_token",
    redirect_uri: CONFIG.redirectUri,
    scope: "openid email profile",
    nonce: nonce.nonce,
  });
  window.location.href = `${GOOGLE_AUTH_ENDPOINT}?${query.toString()}`;
  return new Promise<never>(() => {}); // navigation in progress
}

function readHashParam(name: string): string | null {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash).get(name);
}

/**
 * If we've just returned from Google (id_token in the URL fragment), finish
 * zkLogin: fetch the address+salt, create the zk proof, persist the session, and
 * return it with the code we were paying. Returns null on a normal (non-callback)
 * load. Clears the fragment so a refresh doesn't re-run it.
 */
export async function completeLoginFromRedirect(): Promise<{
  session: WebSession;
  code: string;
} | null> {
  const error = readHashParam("error");
  if (error) {
    localStorage.removeItem(PENDING_KEY);
    history.replaceState(null, "", window.location.pathname);
    throw new Error(`Google sign-in failed: ${error}`);
  }
  const jwt = readHashParam("id_token");
  if (!jwt) return null;

  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) throw new Error("Sign-in state was lost — please try again.");
  const pending = JSON.parse(raw) as Pending;
  localStorage.removeItem(PENDING_KEY);
  history.replaceState(null, "", window.location.pathname);

  const ephemeral = Ed25519Keypair.fromSecretKey(fromBase64(pending.ephemeralSecretKey));
  const zk = await client().getZkLogin({ jwt });
  const proof = (await client().createZkLoginZkp({
    network: CONFIG.suiNetwork,
    jwt,
    ephemeralPublicKey: ephemeral.getPublicKey(),
    randomness: pending.randomness,
    maxEpoch: pending.maxEpoch,
  })) as ZkLoginSignatureInputs;

  const session: WebSession = {
    address: zk.address,
    publicKey: zk.publicKey,
    salt: zk.salt,
    jwt,
    maxEpoch: pending.maxEpoch,
    randomness: pending.randomness,
    expiresAt: pending.expiresAt,
    ephemeralSecretKey: pending.ephemeralSecretKey,
    proof,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { session, code: pending.code };
}

/** Reconstruct the zkLogin signer for a session (signs the gasless transfer). */
export function getSigner(session: WebSession): EnokiKeypair {
  if (isExpired(session)) throw new Error("Your sign-in has expired — please sign in again.");
  const ephemeralKeypair = Ed25519Keypair.fromSecretKey(fromBase64(session.ephemeralSecretKey));
  return new EnokiKeypair({
    address: session.address,
    proof: session.proof,
    maxEpoch: session.maxEpoch,
    ephemeralKeypair,
  });
}
