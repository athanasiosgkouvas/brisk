# Brisk — Project Plan & Status

> **Brisk**: a decentralized, mobile tap-to-pay PoS on Sui. Customers pay merchants
> in USDC — charged the exact amount, **no gas, no card fees** — merchants are
> paid instantly, and idle balances earn yield in a "Save" vault.
>
> **Hackathon:** Sui Overflow 2026, **DeFi & Payments** core track. Submission
> deadline **June 21, 2026**. Prizes $30k/$15k/$10k/$7.5k; 1st/3rd sponsored by
> **OpenZeppelin / OtterSec** → judging rewards an _auditable on-chain primitive_.
>
> **Headline:** _"Feeless to the user, always — and your idle dollars earn while you spend."_

This is the living source of truth. Update the status boxes as phases land.

---

## Where we are right now

**Phase 0 is complete.** The app is a clean fork of `fathom`, stripped and rebranded,
with the Move package live on testnet, the backend sponsor relay verified, and the
iOS project built. **Next up: Phase 1 (the core gasless payment).**

Last verified: sponsored-tx round-trip returns valid Enoki bytes for
`merchant_registry::register`; iOS prebuild produced `ios/Brisk.xcworkspace`.

---

## Key coordinates (don't re-derive these)

| Thing                  | Value                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| Repo                   | `/Users/agkouvas/sui_repos/brisk` (monorepo: app root / `backend/` / `move/`)                     |
| Built on               | fork of `/Users/agkouvas/sui_repos/fathom` (auth + sponsor spine reused)                          |
| Move package (testnet) | `0x713f0b6d6251bf8bf557479ceb4a9695ed2d14eea8946d610d23c88d3c5f9934`                              |
| UpgradeCap             | `0x2f2e2985a84c8e0287ea6426944afbebe2c88854c5f3b29e052b3dcb8a739f12`                              |
| Deployments record     | `move/deployments.json`                                                                           |
| Dev Sui address        | `0x076a67589159074d5c29ccddc1c24f7c34a4c3527502e55f182e10f5bc0bd606`                              |
| Network                | testnet (gasless `send_funds` confirmed on testnet)                                               |
| Bundle id / scheme     | `com.gkouvas.brisk` / `brisk://` (OAuth deep link `brisk://oauth`)                                |
| Backend URL (ngrok)    | `https://buddy-goldsmith-bolster.ngrok-free.dev` → local `:3001`                                  |
| ngrok command          | `cd backend && npm run ngrok` (reserved domain)                                                   |
| Stablecoin             | **USDC**. ⚠️ testnet type in `.env` UNVERIFIED — confirm in Phase 1                               |
| Auth                   | zkLogin via Google + Enoki; ephemeral key in `expo-secure-store`; device biometric gate (Phase 1) |
| Monetization           | yield spread (cut of generated yield; payments always free)                                       |

Secrets live in gitignored `.env` (frontend) and `backend/.env` (Enoki private key). Templates: `.env.example`, `backend/.env.example`.

---

## How to run (dev)

Three terminals from the repo root:

```bash
# 1. Sponsor relay (Enoki) on :3001
cd backend && npm run dev

# 2. Expose it at the ngrok URL the app + Google OAuth expect
cd backend && npm run ngrok

# 3. Build + launch on the iOS simulator (first build takes a few min)
npx expo run:ios
```

Then tap **Continue with Google** → land on the **Pay** tab showing your zkLogin address.

- iOS simulator can reach the ngrok URL; a physical iPhone works the same way.
- Backend `/health` → `{"status":"ok"}`. Move build/test: `cd move && sui move build|test`.

---

## Locked decisions

| Decision     | Choice                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Contactless  | QR-first (universal) + Android NFC HCE as enhancement. **NFC is the first cut if time-tight.** (iOS has no P2P NFC.) |
| Mobile stack | Expo + RN, fork of fathom. On-device `@mysten/sui`.                                                                  |
| Backend      | Minimal sponsor relay (Enoki private key server-side).                                                               |
| Auth         | zkLogin (Google) + Enoki + device biometric gate.                                                                    |
| Stablecoin   | USDC.                                                                                                                |
| Yield vault  | Mock-lender Move module on testnet behind an adapter; real Suilend/Scallop adapter on mainnet.                       |
| Yield UX     | Two-bucket: instant-spend float + opt-in "Save".                                                                     |
| Test target  | iOS simulator (so QR is the path); Android later for the NFC demo.                                                   |

---

## Architecture

### Gasless vs sponsored (load-bearing)

Native gasless (`0x2::balance::send_funds<USDC>`, SDK auto-sets gas=0) only applies to
PTBs of _solely_ allowlisted stablecoin ops. Anything richer (receipt, cashback, vault
move) → **single Enoki-sponsored PTB**. Either way the user pays **$0 gas**.

- Plain P2P transfer → native gasless (showcases the protocol feature).
- Merchant payment (transfer + receipt + optional cashback/vault pull) → sponsored.

### Move package (`move/sources/`)

- `merchant_registry.move` — `Merchant` profile + `MerchantCap`. **(real, minimal)**
- `payment_receipt.move` — `Receipt` object + `PaymentMade` event; `issue<T>(...)`. **(real, minimal)**
- `spending_vault.move` — Save bucket; deposit/withdraw/`withdraw_and_pay`; value-conservation invariant. **(stub → Phase 3)**
- `lender_adapter.move` — adapter interface (testnet↔mainnet seam). **(stub → Phase 3)**
- `mock_lender.move` — deterministic, fast-forwardable yield on testnet. **(stub → Phase 3)**
- `loyalty.move` — Closed-Loop cashback token. **(stub → Phase 4)**

Security posture (OZ/OtterSec): capability-gated admin, checked arithmetic, pause flag,
explicit adapter trust boundary, full `sui move test`, Move Prover spec on vault value
conservation. (Winners get audit credits — mention in the pitch.)

### App (Expo, root)

Tabs: **Pay** (`app/(tabs)/index.tsx`, customer) · **Charge** (`merchant.tsx`) · **Save** (`save.tsx`).
Reused spine (see below). New per phase: QR, NFC, biometric gate, payment/vault PTB builders + hooks.

### Backend (`backend/src/server.ts`)

Clean sponsor relay: `/api/sponsor` + `/api/execute` (Enoki), `/api/faucet/request`,
`/api/user/:address/sponsorship` (in-memory daily limit), `/api/analytics/track`,
`/api/errors/report`, `/auth/callback` + `/auth/relay` (→ `brisk://oauth`).

---

## Reused from the fathom fork (don't rebuild)

- `services/auth/enokiAuth.ts` — zkLogin login/restore/sign.
- `services/blockchain/suiClient.ts` — **keep `patchIntlPluralRules()`** (RPC silently fails on Hermes without it).
- `services/blockchain/sponsoredExec.ts` + `services/api/backendApi.ts` — `executeSponsored()`.
- `store/authStore.ts`, `hooks/useAuth.ts`, `services/storage/sessionStorage.ts`, `types/user.ts`.
- Config in `utils/constants.ts`: `ENV`, `BRISK_ALLOWED_TARGETS`, `BRISK_REVENUE`.

Gotcha: `@mysten/enoki` misbehaves in RN → call the Enoki HTTP API. Enoki rejects sponsored
PTBs whose move targets aren't in the allowlist (`BRISK_ALLOWED_TARGETS`). `@mysten/sui` v2.16:
client is `SuiJsonRpcClient` from `@mysten/sui/jsonRpc` (not `SuiClient`).

Reference templates (in fathom, not copied): `earnTransactions.ts` (→ vault deposit/withdraw),
`useSendDusdc.ts` (→ plain transfer), `move/fathom_router/sources/router.move` `assert_and_record`
(atomic same-PTB assert+event → link `withdraw_and_pay` ↔ receipt).

---

## Phased roadmap

Timeline May 31 → June 21. Treat **June 13 = demo-ready**, **June 18 = feature freeze**.
Cut order if time-tight: **NFC → cashback → vault**.

### ✅ Phase 0 — Foundations (DONE)

- [x] Fork fathom → brisk; strip Predict/DeepBook/Earn; Pay/Charge/Save shell; typechecks clean.
- [x] Move package scaffolded + published to testnet (`0x713f0b…9934`).
- [x] Backend stripped to a clean sponsor relay; boots; OAuth → `brisk://oauth`.
- [x] Env wired (`.env`, `backend/.env`); Google client + Enoki public/private keys.
- [x] **Sponsor round-trip verified** (Enoki returns sponsored bytes for `register`).
- [x] iOS prebuild → `ios/Brisk.xcworkspace` (bundle `com.gkouvas.brisk`, `brisk://`).
- [ ] _Manual confirm:_ run on simulator, Google login lands on Pay tab. ← do this anytime.

### ⏭️ Phase 1 — Core payment (PoC) — _most important_

- [ ] **Verify testnet USDC type + that `send_funds` is gasless for it** (de-risk foundation).
- [ ] Add biometric gate (`expo-local-authentication`) on the sign action.
- [ ] `services/blockchain/paymentTx.ts`: native-gasless `send_funds<USDC>` + sponsored transfer-with-receipt PTB.
- [ ] Merchant **Charge**: amount entry → QR (`Invoice` payload = payee + amount + invoiceId).
- [ ] Customer **Pay**: scan QR (`expo-camera`) → review → Face ID → submit → settlement.
- [ ] **Exit:** end-to-end gasless QR tap-to-pay on two sessions; charged exact amount; merchant sees funds instantly.

### Phase 2 — On-chain receipts + merchant registry

- [ ] Finish `merchant_registry` + `payment_receipt` (+ tests); merchant onboarding flow.
- [ ] Merchant payment uses sponsored "rich" PTB (transfer + `Receipt`); receipt history from `PaymentMade` events.
- [ ] **Exit:** every merchant payment yields an on-chain `Receipt`; refund path demoable.

### Phase 3 — Yield vault + Save bucket

- [ ] `spending_vault` + `lender_adapter` + `mock_lender` (+ tests, Prover value-conservation spec).
- [ ] Save tab: deposit/withdraw, accruing yield (fast-forwardable), `withdraw_and_pay`.
- [ ] **Exit:** deposit → yield accrues → spend pulls from Save instantly; invariant test passes.

### Phase 4 — NFC tap + cashback (demo-ready target)

- [ ] Android HCE card ↔ reader-mode APDU exchange of the invoice payload (`react-native-hce`).
- [ ] `loyalty` Closed-Loop cashback minted on payment; redemption UX.
- [ ] **Exit:** Android tap-to-pay demo; cashback appears post-payment. _(NFC cut first if behind.)_

### Phase 5 — Harden, pitch, submit

- [ ] Security pass (capability review, arithmetic, pause, adapter boundary); expand tests.
- [ ] README + architecture diagram + 3-min demo video + submission writeup.
- [ ] **Feature freeze Jun 18**, buffer to Jun 21.

### Post-submission / v2 (roadmap, not built now)

- [ ] Swap `mock_lender` → real Suilend/Scallop adapter on mainnet → real yield.
- [ ] Fiat on/off-ramp (Apple Pay / Google Pay via Stripe crypto / Transak).
- [ ] iOS NFC (Apple HCE payment entitlement); merchant analytics; enable yield-spread fee.

---

## Testnet → Mainnet

The adapter interface is the only seam. Promotion = swap `mock_lender` → real adapter,
point config at mainnet USDC + Enoki gas pool, re-publish, use won audit credits, enable fee.
No app-logic changes.

## Open items / risks

- ⚠️ **Testnet USDC type unverified** — first task of Phase 1.
- iOS NFC impossible in time → QR primary, NFC Android-only (mitigated).
- Real lenders mainnet-only → mock-lender + adapter (mitigated).
- Custody/regulatory (pooled yield) → non-custodial per-user vault, opt-in Save; flag MTL/securities for mainnet.

## Commit history (Phase 0)

`Initial fork` → `Strip + rebrand` → `Move scaffold + publish + constants` → `Env templates` → `Backend sponsor relay`.
