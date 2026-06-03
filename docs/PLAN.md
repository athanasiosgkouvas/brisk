# Brisk — Project Plan & Status

> ⚠️ **Historical planning log.** This file captures the original phased plan and
> may lag the shipped code. For the authoritative current architecture and run
> instructions, see the [README](../README.md). Notably: NFC uses a **custom
> native Kotlin HCE module** (`plugins/withBriskHce.js`), **not** `react-native-hce`
> (which is unusable on RN 0.81 / AGP 8); and merchant payments settle via a
> native-gasless transfer + a separate sponsored receipt leg.

> **Brisk**: a decentralized **tap-to-pay** PoS on Sui. A customer taps their phone
> (iPhone **or** Android) to a merchant's **Brisk Terminal** and pays in USDC —
> charged the exact amount, **no gas, no card fees** — merchant paid instantly.
> Idle balances earn yield in a "Save" vault.
>
> **The whole point is the tap.** QR is a fallback, not the experience. No existing
> Sui wallet (Slush included) does NFC tap-to-pay.
>
> **Hackathon:** Sui Overflow 2026, **DeFi & Payments** core track. Submission
> deadline **June 21, 2026**. Prizes $30k/$15k/$10k/$7.5k; 1st/3rd sponsored by
> **OpenZeppelin / OtterSec** → judging rewards an _auditable on-chain primitive_.
>
> **Headline:** _"Tap to pay in stablecoins — feeless to the user, and your idle dollars earn while you spend."_

This is the living source of truth. Update the status boxes as phases land.

---

## The tap, and why it works cross-platform (read this first)

True iPhone↔iPhone P2P NFC is **not** available to us (iOS 26.3's third-party HCE +
device-to-device NFC is EEA-only and needs a regulatory-approved entitlement — weeks,
region-locked). The entitlement-free, **verified** path:

- **Merchant = the thing being tapped.** The Android **Brisk Terminal** uses **HCE**
  to emulate an **NFC Forum Type-4 tag** (AID `D2760000850101`) exposing the invoice as
  an **NDEF** record (a `brisk://pay?...` URI).
- **Customer = the reader.** Tapping reads that NDEF — and reading works on **both**
  **iOS** (Core NFC `NFCNDEFReaderSession`, standard "NFC Tag Reading" capability — _not_
  the hard payment entitlement) **and Android** (reader mode).
- Settlement is **on-chain and instant** (sub-second Sui). NFC only carries the invoice.

So: **customer taps on iPhone or Android ✅. Merchant runs on Android** (HCE is Android-only;
an iPhone merchant falls back to QR). This mirrors real PoS (Square/SoftPOS are Android).

Proven by open-source demos (iPhone reading Android HCE NDEF) + libraries that exist today:
**`react-native-hce`** (Android Type-4 tag emulation, Text/URI) and **`react-native-nfc-manager`**
(NDEF read, iOS + Android).

⚠️ **NFC has no iOS-simulator support** — the tap must be built/tested on **real devices**
(Android terminal + iPhone/Android customer).

---

## Where we are right now

**Phases 0–4 are code-complete** (Move + app integration; all 4 Move test suites pass; app typechecks),
**plus the wallet fundamentals + onboarding**: a Wallet/Home tab (balance via `core.getBalance` incl.
Address Balances, activity feed), **Receive** (address QR + copy), **Send** (paste → Face ID → feeless),
and a 4-slide onboarding carousel. Tabs are now Wallet / Pay / Charge / Save. Fiat on/off-ramp is v2,
analyzed in [`ONRAMP_OFFRAMP.md`](ONRAMP_OFFRAMP.md).
The app **builds + runs on the Pixel** (Wallet build verified: svg autolinked, JS running), zkLogin
sign-in works, the custom HCE module loads, and Save activation creates the vault on-chain.
**Remaining: end-to-end on-device tap test** (needs a 2nd NFC device — iPhone NFC requires a
**paid Apple Developer account**), **fund the LendingPool reserve** with testnet USDC (to pay
withdrawal yield), then polish + submission (Phase 5).

Test devices available: **Android phone + iPhone** (Android = Brisk Terminal, iPhone = customer).
⚠️ iPhone can't run the NFC build on a free Apple team — needs the paid program, or use a 2nd Android.

---

## Key coordinates (don't re-derive these)

| Thing                  | Value                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Repo                   | `/Users/agkouvas/sui_repos/brisk` (monorepo: app root / `backend/` / `move/`)                                        |
| Built on               | a prior RN project's zkLogin + Enoki sponsor spine (reused)                                                          |
| Move package (testnet) | `0xc7073f8c1f54ece01d81e4b4cd9a16931ddacc43875bf80bf4780112fb72204a` (all 6 modules; supersedes 0x713f… scaffold)    |
| LendingPool<USDC>      | `0x2e3c89fa3b757dcbe0ea8242e1368d8662ed6ed0eda2c412cafe0b1380f16457` (10% APY; reserve UNFUNDED — fund to pay yield) |
| mock_lender AdminCap   | `0xaa2304057a21eb0689b3d2e6000a82e4e2c183565713cb317be1411d82930e37`                                                 |
| UpgradeCap             | `0x09d162f6c9688c14fe85bf75df2342aa6ac352591f11d994d5c533d20ba9dc8a`                                                 |
| Deployments record     | `move/deployments.json`                                                                                              |
| Dev Sui address        | `0x076a67589159074d5c29ccddc1c24f7c34a4c3527502e55f182e10f5bc0bd606`                                                 |
| Network                | testnet (gasless `send_funds` confirmed on testnet)                                                                  |
| Bundle id / scheme     | `com.gkouvas.brisk` / `brisk://` (OAuth deep link `brisk://oauth`; invoice `brisk://pay?...`)                        |
| Backend URL (ngrok)    | `https://<your-tunnel>.ngrok-free.dev` → local `:3001` (set `EXPO_PUBLIC_BACKEND_URL`)                               |
| ngrok command          | `cd backend && npm run ngrok` (reserved domain)                                                                      |
| NFC libs               | `react-native-hce` (Android terminal, HCE) · `react-native-nfc-manager` (customer read, iOS+Android)                 |
| NDEF tag               | Type-4, AID `D2760000850101`; payload = `brisk://pay?payee=<addr>&amount=<micros>&invoice=<id>&merchant=<name>`      |
| Stablecoin             | **USDC**. ⚠️ testnet type in `.env` UNVERIFIED — confirm in Phase 1                                                  |
| Auth                   | zkLogin via Google + Enoki; ephemeral key in `expo-secure-store`; device biometric gate (Phase 1)                    |
| Monetization           | yield spread (cut of generated yield; payments always free)                                                          |
| Test devices           | Android phone (terminal) + iPhone (customer). **NFC needs real hardware — no simulator.**                            |

Secrets live in gitignored `.env` (frontend) and `backend/.env` (Enoki private key). Templates: `.env.example`, `backend/.env.example`.

---

## How to run (dev — real devices)

```bash
# 1. Sponsor relay (Enoki) on :3001
cd backend && npm run dev
# 2. Expose it at the ngrok URL the app + Google OAuth expect
cd backend && npm run ngrok
# 3a. Brisk Terminal on the Android device (merchant / HCE)
npx expo run:android --device
# 3b. Brisk customer app on the physical iPhone (reader) — NOT the simulator for NFC
npx expo run:ios --device
```

The iOS **simulator** is still fine for non-NFC work (auth, UI, Save). Backend `/health` → `{"status":"ok"}`. Move: `cd move && sui move build|test`.

> After adding NFC config (Phase 1), **re-run `expo prebuild`** for both platforms (iOS NFC entitlement + `NFCReaderUsageDescription`; Android HCE `HostApduService` + `apduservice.xml` + `android.hardware.nfc.hce` feature).

---

## Locked decisions

| Decision        | Choice                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Primary UX**  | **NFC tap-to-pay.** Android Brisk Terminal (HCE) presents invoice; customer taps to read+pay on **iOS or Android**. |
| QR              | **Fallback only** (merchant-on-iPhone, or NFC failure). Not the headline.                                           |
| Merchant device | **Android** (HCE is Android-only). Framed as the "Brisk Terminal".                                                  |
| Customer device | **iOS + Android** (Core NFC / reader mode).                                                                         |
| Mobile stack    | Expo + RN (built on a prior RN project's auth spine). On-device `@mysten/sui`.                                      |
| Backend         | Minimal sponsor relay (Enoki private key server-side).                                                              |
| Auth            | zkLogin (Google) + Enoki + device biometric gate.                                                                   |
| Stablecoin      | USDC.                                                                                                               |
| Yield vault     | Mock-lender Move module on testnet behind an adapter; real Suilend/Scallop adapter on mainnet.                      |
| Yield UX        | Two-bucket: instant-spend float + opt-in "Save".                                                                    |
| Testing         | Real devices (Android terminal + iPhone customer); NFC has no simulator.                                            |

---

## Architecture

### NFC tap flow (the core)

1. **Merchant (Android)** enters amount → app builds invoice `brisk://pay?payee&amount&invoice&merchant`
   → `react-native-hce` emulates a Type-4 NDEF tag carrying it → terminal shows "Tap to pay $X".
2. **Customer (iOS/Android)** opens Pay → taps the terminal → `react-native-nfc-manager` reads the NDEF
   → parses invoice → shows "$X to <merchant>" → **Face ID** (`expo-local-authentication`).
3. Customer app submits the payment PTB (native-gasless `send_funds<USDC>`, or sponsored
   transfer-with-receipt) → **on-chain settlement, sub-second**.
4. **Merchant** polls chain / watches `PaymentMade` event → "Paid ✓". (HCE deactivate callback can
   also confirm the tap landed.)

### Gasless vs sponsored (load-bearing)

Native gasless (`0x2::balance::send_funds<USDC>`, SDK auto-sets gas=0) only applies to PTBs of
_solely_ allowlisted stablecoin ops. Anything richer (receipt, cashback, vault move) → **single
Enoki-sponsored PTB**. Either way the user pays **$0 gas**.

### Move package (`move/sources/`)

- `merchant_registry.move` — `Merchant` profile + `MerchantCap`. **(real, minimal)**
- `payment_receipt.move` — `Receipt` object + `PaymentMade` event; `issue<T>(...)`. **(real, minimal)**
- `spending_vault.move` — Save bucket; deposit/withdraw/`withdraw_and_pay`; value-conservation invariant. **(stub → Phase 3)**
- `lender_adapter.move` — adapter interface (testnet↔mainnet seam). **(stub → Phase 3)**
- `mock_lender.move` — deterministic, fast-forwardable yield on testnet. **(stub → Phase 3)**
- `loyalty.move` — Closed-Loop cashback token. **(DROPPED — removed before submission in commit `5ebf28d`; the shipped package has 5 modules, not 6. Closed-loop rewards moved to the v2 roadmap.)**

Security posture (OZ/OtterSec): capability-gated admin, checked arithmetic, pause flag, explicit
adapter trust boundary, full `sui move test`, Move Prover spec on vault value conservation.

### App (Expo, root) — one app, two modes

- **Pay** (`app/(tabs)/index.tsx`, customer, iOS+Android) — NFC read → confirm → biometric → pay.
- **Charge** (`merchant.tsx`, Android only) — amount → HCE emulate invoice → await settlement. Gate behind `Platform.OS === 'android'`; iPhone merchants get QR.
- **Save** (`save.tsx`) — vault deposit/withdraw + yield.

### Backend (`backend/src/server.ts`)

Clean sponsor relay: `/api/sponsor` + `/api/execute` (Enoki), `/api/faucet/request`,
`/api/user/:address/sponsorship` (in-memory daily limit), `/api/analytics/track`,
`/api/errors/report`, `/auth/callback` + `/auth/relay` (→ `brisk://oauth`).

---

## Reused from the upstream fork (don't rebuild)

- `services/auth/enokiAuth.ts` — zkLogin login/restore/sign.
- `services/blockchain/suiClient.ts` — **keep `patchIntlPluralRules()`** (RPC silently fails on Hermes without it).
- `services/blockchain/sponsoredExec.ts` + `services/api/backendApi.ts` — `executeSponsored()`.
- `store/authStore.ts`, `hooks/useAuth.ts`, `services/storage/sessionStorage.ts`, `types/user.ts`.
- Config in `utils/constants.ts`: `ENV`, `BRISK_ALLOWED_TARGETS`, `BRISK_REVENUE`.

Gotchas: `@mysten/enoki` misbehaves in RN → use the Enoki HTTP API. Enoki rejects sponsored PTBs
whose move targets aren't in `BRISK_ALLOWED_TARGETS`. `@mysten/sui` v2.16: client is
`SuiJsonRpcClient` from `@mysten/sui/jsonRpc` (not `SuiClient`).

Reference templates lived only in the upstream fork (not copied into Brisk): an
earn-transactions builder (→ vault deposit/withdraw) and a plain-transfer hook
(→ `payGasless`).

---

## Phased roadmap

Timeline May 31 → June 21. **June 13 = demo-ready**, **June 18 = feature freeze**.
Cut order if time-tight: **cashback → vault** (the tap is the core, never cut; QR is the safety net).

### ✅ Phase 0 — Foundations (DONE)

- [x] Bootstrap Brisk from the upstream fork; strip unrelated features; Pay/Charge/Save shell; typechecks clean.
- [x] Move package scaffolded + published to testnet (`0x713f0b…9934`).
- [x] Backend stripped to a clean sponsor relay; boots; OAuth → `brisk://oauth`.
- [x] Env wired; Google client + Enoki keys; **sponsor round-trip verified**.
- [x] iOS prebuild → `ios/Brisk.xcworkspace`.
- [ ] _Manual confirm anytime:_ run on a device, Google login lands on Pay tab.

### ⏭️ Phase 1 — NFC tap-to-pay core (PoC) — _the headline_

- [x] **Verified testnet + mainnet USDC types**; USDC is gasless-allowlisted (`send_funds`). (JSON-RPC needs manual gas=0.)
- [x] Added deps + native config: `react-native-hce`, `react-native-nfc-manager`, `expo-local-authentication`; iOS NFC entitlement + usage string; Android HCE service + `aid_list.xml` (AID `D2760000850101`) via `plugins/withBriskHce.js`; re-prebuilt both platforms.
- [x] Invoice codec (`brisk://pay?...`) + USDC amount helpers (`paymentTx.ts`).
- [x] `payInvoice` (native-gasless → Enoki-sponsored fallback) + `waitForSettlement` (`payments.ts`).
- [x] **Charge (Android)**: amount → HCE emulate invoice (`useCharge`, `merchant.tsx`).
- [x] **Pay (iOS+Android)**: tap → read NDEF → review → Face ID → pay (`usePay`, `index.tsx`). Typechecks + lints clean.
- [ ] **On-device verification** (real Android + iPhone): the tap end-to-end. ← NEXT (NFC can't run on simulator). Likely tweak: settlement detection (balance poll vs address-balance reflection).
- [ ] QR fallback (small): merchant-on-iPhone shows QR; customer can scan instead of tap.
- [ ] **Exit:** iPhone customer **taps** an Android Brisk Terminal → pays exact amount, no gas → terminal shows Paid in ~1s. Same for Android customer.

### ✅ Phase 2 — On-chain receipts + merchant registry (CODE DONE)

- [x] `merchant_registry` + `payment_receipt` fleshed out (+ Move tests).
- [x] `payInvoice` uses a sponsored "rich" PTB (send_funds + `issue` Receipt → payer); settlement detected from `PaymentMade` events (`receipts.ts`, event-envelope ts).
- [ ] _On-device:_ confirm a `Receipt` object + `PaymentMade` event land per payment.

### ✅ Phase 3 — Yield vault + Save bucket (CODE DONE)

- [x] `spending_vault` + `mock_lender` (+ test: deposit → 1yr → withdraw = principal + 10%). `lender_adapter` documents the mainnet swap seam.
- [x] Save tab: activate/deposit/withdraw, live value via devInspect (`vaultTx`, `saveAccount`, `useSave`, `save.tsx`).
- [ ] _On-device:_ fund the pool reserve, then deposit → accrue → withdraw.

### ~~Phase 4 — Cashback~~ (CUT before submission)

> **Dropped in commit `5ebf28d`.** Cashback/loyalty was built (closed-loop `Points`, mint-on-pay,
> redeem-burn) but cut from the final submission to keep the on-chain surface minimal and focused on
> the payment + vault primitives. The shipped package is **5 modules** (no `loyalty.move`).
> Closed-loop rewards now live on the **v2 roadmap**.

### Phase 5 — Harden, pitch, submit

- [ ] Security pass (capability review, arithmetic, pause, adapter boundary); expand tests.
- [ ] README + architecture diagram + 3-min demo video (the tap is the hero shot) + submission writeup.
- [ ] **Feature freeze Jun 18**, buffer to Jun 21.

### Post-submission / v2 (roadmap, not built now)

- [ ] Swap `mock_lender` → real Suilend/Scallop adapter on mainnet → real yield.
- [ ] Fiat on/off-ramp (Apple Pay / Google Pay via Stripe crypto / Transak).
- [ ] **iOS-as-terminal** via Apple's EEA device-to-device NFC / HCE entitlement (lets iPhones present too); merchant analytics; enable yield-spread fee.

---

## Testnet → Mainnet

The adapter interface is the only seam. Promotion = swap `mock_lender` → real adapter, point config
at mainnet USDC + Enoki gas pool, re-publish, use won audit credits, enable fee. No app-logic changes.

## Open items / risks

- ⚠️ **Testnet USDC type unverified** — first task of Phase 1.
- **NFC needs real devices** (no simulator) — have Android + iPhone; HCE config must survive prebuild.
- Merchant-on-iPhone can't present NFC → QR fallback (acceptable; terminals are Android).
- iOS reading needs the standard NFC Tag Reading capability (easy), _not_ the payment HCE entitlement.
- Real lenders mainnet-only → mock-lender + adapter (mitigated).
- Custody/regulatory (pooled yield) → non-custodial per-user vault, opt-in Save; flag MTL/securities for mainnet.

## Commit history (Phase 0)

`Initial fork` → `Strip + rebrand` → `Move scaffold + publish + constants` → `Env templates` → `Backend sponsor relay` → `docs/PLAN.md`.
