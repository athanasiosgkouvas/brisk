import type { ZkLoginSignatureInputs } from "@mysten/sui/zklogin";

export type AuthSession = {
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

export type AuthUser = {
  address: string;
  provider: "google";
};
