# Brisk — Project Plan & Status

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

**Phase 0 (foundations) is complete.** Clean fork of `fathom`, stripped + rebranded,
Move package live on testnet, backend sponsor relay verified, iOS app prebuilt.
**Next: Phase 1 — the NFC tap-to-pay core** (this is the headline build).

Test devices available: **Android phone + iPhone** (Android = Brisk Terminal, iPhone = customer).

---

## Key coordinates (don't re-derive these)

| Thing                  | Value                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| Repo                   | `/Users/agkouvas/sui_repos/brisk` (monorepo: app root / `backend/` / `move/`)                                   |
| Built on               | fork of `/Users/agkouvas/sui_repos/fathom` (auth + sponsor spine reused)                                        |
| Move package (testnet) | `0x713f0b6d6251bf8bf557479ceb4a9695ed2d14eea8946d610d23c88d3c5f9934`                                            |
| UpgradeCap             | `0x2f2e2985a84c8e0287ea6426944afbebe2c88854c5f3b29e052b3dcb8a739f12`                                            |
| Deployments record     | `move/deployments.json`                                                                                         |
| Dev Sui address        | `0x076a67589159074d5c29ccddc1c24f7c34a4c3527502e55f182e10f5bc0bd606`                                            |
| Network                | testnet (gasless `send_funds` confirmed on testnet)                                                             |
| Bundle id / scheme     | `com.gkouvas.brisk` / `brisk://` (OAuth deep link `brisk://oauth`; invoice `brisk://pay?...`)                   |
| Backend URL (ngrok)    | `https://buddy-goldsmith-bolster.ngrok-free.dev` → local `:3001`                                                |
| ngrok command          | `cd backend && npm run ngrok` (reserved domain)                                                                 |
| NFC libs               | `react-native-hce` (Android terminal, HCE) · `react-native-nfc-manager` (customer read, iOS+Android)            |
| NDEF tag               | Type-4, AID `D2760000850101`; payload = `brisk://pay?payee=<addr>&amount=<micros>&invoice=<id>&merchant=<name>` |
| Stablecoin             | **USDC**. ⚠️ testnet type in `.env` UNVERIFIED — confirm in Phase 1                                             |
| Auth                   | zkLogin via Google + Enoki; ephemeral key in `expo-secure-store`; device biometric gate (Phase 1)               |
| Monetization           | yield spread (cut of generated yield; payments always free)                                                     |
| Test devices           | Android phone (terminal) + iPhone (customer). **NFC needs real hardware — no simulator.**                       |

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
| Mobile stack    | Expo + RN, fork of fathom. On-device `@mysten/sui`.                                                                 |
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
- `loyalty.move` — Closed-Loop cashback token. **(stub → Phase 4)**

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

## Reused from the fathom fork (don't rebuild)

- `services/auth/enokiAuth.ts` — zkLogin login/restore/sign.
- `services/blockchain/suiClient.ts` — **keep `patchIntlPluralRules()`** (RPC silently fails on Hermes without it).
- `services/blockchain/sponsoredExec.ts` + `services/api/backendApi.ts` — `executeSponsored()`.
- `store/authStore.ts`, `hooks/useAuth.ts`, `services/storage/sessionStorage.ts`, `types/user.ts`.
- Config in `utils/constants.ts`: `ENV`, `BRISK_ALLOWED_TARGETS`, `BRISK_REVENUE`.

Gotchas: `@mysten/enoki` misbehaves in RN → use the Enoki HTTP API. Enoki rejects sponsored PTBs
whose move targets aren't in `BRISK_ALLOWED_TARGETS`. `@mysten/sui` v2.16: client is
`SuiJsonRpcClient` from `@mysten/sui/jsonRpc` (not `SuiClient`).

Reference templates (in fathom, not copied): `earnTransactions.ts` (→ vault deposit/withdraw),
`useSendDusdc.ts` (→ plain transfer), `move/fathom_router/sources/router.move` `assert_and_record`.

---

## Phased roadmap

Timeline May 31 → June 21. **June 13 = demo-ready**, **June 18 = feature freeze**.
Cut order if time-tight: **cashback → vault** (the tap is the core, never cut; QR is the safety net).

### ✅ Phase 0 — Foundations (DONE)

- [x] Fork fathom → brisk; strip Predict/DeepBook/Earn; Pay/Charge/Save shell; typechecks clean.
- [x] Move package scaffolded + published to testnet (`0x713f0b…9934`).
- [x] Backend stripped to a clean sponsor relay; boots; OAuth → `brisk://oauth`.
- [x] Env wired; Google client + Enoki keys; **sponsor round-trip verified**.
- [x] iOS prebuild → `ios/Brisk.xcworkspace`.
- [ ] _Manual confirm anytime:_ run on a device, Google login lands on Pay tab.

### ⏭️ Phase 1 — NFC tap-to-pay core (PoC) — _the headline_

- [ ] **Verify testnet USDC type + that `send_funds` is gasless for it** (de-risk foundation).
- [ ] Add deps + native config: `react-native-hce`, `react-native-nfc-manager`, `expo-local-authentication`; iOS NFC entitlement + `NFCReaderUsageDescription`; Android HCE `HostApduService`/`apduservice.xml`/`nfc.hce` feature; re-`expo prebuild` both platforms.
- [ ] Invoice format helpers (`brisk://pay?...` encode/parse).
- [ ] **Charge (Android)**: amount entry → HCE emulate invoice tag → "Tap to pay $X".
- [ ] **Pay (iOS+Android)**: tap → read NDEF → confirm → Face ID → submit gasless `send_funds<USDC>`.
- [ ] Merchant settlement detection (poll/event) → "Paid ✓".
- [ ] QR fallback (small): merchant-on-iPhone shows QR; customer can scan instead of tap.
- [ ] **Exit:** iPhone customer **taps** an Android Brisk Terminal → pays exact amount, no gas → terminal shows Paid in ~1s. Same for Android customer.

### Phase 2 — On-chain receipts + merchant registry

- [ ] Finish `merchant_registry` + `payment_receipt` (+ tests); merchant onboarding.
- [ ] Payment uses sponsored "rich" PTB (transfer + `Receipt`); receipt history from `PaymentMade` events.
- [ ] **Exit:** every payment yields an on-chain `Receipt`; refund path demoable.

### Phase 3 — Yield vault + Save bucket

- [ ] `spending_vault` + `lender_adapter` + `mock_lender` (+ tests, Prover value-conservation spec).
- [ ] Save tab: deposit/withdraw, accruing yield (fast-forwardable), `withdraw_and_pay`.
- [ ] **Exit:** deposit → yield accrues → spend pulls from Save instantly; invariant test passes.

### Phase 4 — Cashback + polish

- [ ] `loyalty` Closed-Loop cashback minted on payment; redemption UX.
- [ ] Tighten tap UX (haptics on read, retry, error states); QR fallback polish.
- [ ] **Exit:** cashback appears post-payment; tap flow feels production-grade.

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
