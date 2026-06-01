<div align="center">

# Brisk

### Tap to pay in stablecoins — feeless to the user, and your idle dollars earn while you spend.

**A decentralized tap‑to‑pay point‑of‑sale on [Sui](https://sui.io).**
A customer taps their phone (iPhone **or** Android) to a merchant's _Brisk Terminal_ and pays in **USDC** —
charged the exact amount, **no gas, no card fees** — and the merchant is paid **instantly**.
Idle balances earn yield in a one‑tap **Save** vault.

`Sui Overflow 2026` · **DeFi & Payments** track · Built on Sui's protocol‑level **gasless stablecoin transfers**

</div>

---

## Table of contents

- [Why Brisk](#why-brisk)
- [What makes it different](#what-makes-it-different)
- [How the tap works (the hard part)](#how-the-tap-works-the-hard-part)
- [Feeless by design: gasless vs sponsored](#feeless-by-design-gasless-vs-sponsored)
- [The on‑chain primitive (Move)](#the-onchain-primitive-move)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Deployed on testnet](#deployed-on-testnet)
- [Run it yourself](#run-it-yourself)
- [Security posture](#security-posture)
- [Monetization](#monetization)
- [Roadmap](#roadmap)
- [Honest limitations](#honest-limitations)
- [Acknowledgements](#acknowledgements)

---

## Why Brisk

Card networks skim **2–3%** off every sale and settle to merchants in _days_. "Pay with crypto" was
supposed to fix this, but in practice it's worse for normal people: gas fees, seed phrases, wallet
pop‑ups, and confusing UX. Nobody taps a hardware wallet to buy a coffee.

Two things changed on Sui in 2026 that make a genuinely better experience possible:

1. **Protocol‑level gasless stablecoin transfers** (launched May 2026). Supported stablecoins move
   peer‑to‑peer for **$0.00** via the new _Address Balances_ architecture — the sender doesn't even
   need any SUI for gas. This isn't a relayer trick; it's built into the protocol.
2. **zkLogin + Passkey + Enoki sponsorship** — self‑custodial accounts from a Google sign‑in, biometric
   signing, and gas sponsorship, so a wallet feels like a normal app.

Brisk puts these together into the experience people already understand: **tap your phone, pay, done.**
Except it's feeless to the customer, settles to the merchant in under a second, runs on open rails, and
your spending balance earns yield instead of sitting idle.

> **Headline:** _"Tap to pay in stablecoins — feeless to the user, and your idle dollars earn while you spend."_

---

## What makes it different

|                  | Card networks          | Existing crypto wallets (incl. Slush) | **Brisk**                      |
| ---------------- | ---------------------- | ------------------------------------- | ------------------------------ |
| Customer fee     | 0 (merchant pays 2–3%) | Gas on every tx                       | **$0 — gasless / sponsored**   |
| Onboarding       | Bank account           | Seed phrase                           | **Google sign‑in (zkLogin)**   |
| Pay gesture      | Tap                    | Scan a QR / paste address             | **Tap (NFC), iOS + Android**   |
| Settlement       | Days                   | Seconds                               | **Sub‑second, on‑chain**       |
| Idle balance     | 0%                     | 0%                                    | **Earns yield (Save vault)**   |
| Proof of payment | Statement              | Tx hash                               | **On‑chain `Receipt` object**  |
| Rewards          | Issuer‑locked points   | —                                     | **Closed‑loop cashback token** |

No existing Sui wallet does NFC tap‑to‑pay. That tap — working on **both** iPhone and Android with **no
Apple entitlement** — is Brisk's core technical contribution, alongside the on‑chain spending‑vault primitive.

---

## How the tap works (the hard part)

Real phone‑to‑phone NFC is a minefield: **iOS has no peer‑to‑peer NFC**, Android Beam is dead, and iOS
26's third‑party HCE / device‑to‑device NFC is **EEA‑only and gated behind a regulatory‑approved
entitlement** (weeks of process). So a naïve "bonk two iPhones together" simply cannot work.

Brisk uses the one **entitlement‑free** path that works across platforms:

```
  ┌─────────────────────────┐         NFC tap          ┌──────────────────────────┐
  │   Brisk Terminal         │  ◄───────────────────►   │   Customer (Pay)          │
  │   (merchant, Android)    │   NDEF Type‑4 tag        │   iPhone OR Android       │
  │                          │   AID D2760000850101     │                           │
  │  HCE emulates a tag      │ ───────────────────────► │  reads the invoice        │
  │  carrying the invoice:   │   brisk://pay?payee=…    │  → Face ID → pays         │
  │  payee · amount · id     │   &amount=…&invoice=…    │                           │
  └─────────────────────────┘                          └──────────────────────────┘
            ▲                                                       │
            │            on‑chain settlement (sub‑second Sui)       │
            └───────────────────────────────────────────────────────┘
                     merchant sees "Paid ✓" from the PaymentMade event
```

- The **merchant terminal (Android)** uses **Host Card Emulation** to present an **NFC Forum Type‑4 tag**
  whose NDEF record is the invoice (`brisk://pay?payee=…&amount=…&invoice=…&merchant=…`).
- The **customer taps** and reads that NDEF — and **reading works on both iOS** (Core NFC, the _standard_
  "NFC Tag Reading" capability) **and Android** (reader mode).
- The customer reviews the amount, authorizes with **Face ID / fingerprint**, and the payment settles
  **on‑chain**. NFC only carries the invoice; the money moves on Sui.

This mirrors how real point‑of‑sale already works — the customer taps the merchant's terminal — and the
"terminal is an Android device" assumption is exactly what Square/SoftPOS rely on. QR is kept as a
universal fallback (e.g. a merchant on iPhone).

> We built a **custom native HCE module** (Kotlin `HostApduService` implementing the Type‑4 APDU state
> machine, see [`plugins/hce-android/`](plugins/hce-android)) because the only off‑the‑shelf RN library,
> `react-native-hce`, is unmaintained and incompatible with React Native 0.81 / AGP 8.

---

## Feeless by design: gasless vs sponsored

The user **never** pays gas. Two complementary mechanisms make that true, and a merchant payment uses
**both** as two legs:

1. **Native gasless** (the money) — the USDC transfer is a PTB containing only `0x2::balance::send_funds<USDC>`,
   submitted straight to the fullnode. Sui's protocol treats it as a **zero‑fee** Address‑Balances transfer;
   the sender needs no SUI. This leg is the source of truth for the payment (see `payGasless`).
2. **Enoki‑sponsored** (the record) — the on‑chain `Receipt` + cashback mint as a **separate** sponsored PTB
   that touches no balance, so Enoki pays its gas. It's split from the transfer because Enoki's gas station
   can't yet sponsor an Address‑Balance withdrawal (`CallArg::FundsWithdrawal`); keeping the value movement
   native‑gasless sidesteps that entirely. The receipt leg is best‑effort and never blocks settlement.

Either way the customer is charged `$X` and pays `$0` in fees. This is the load‑bearing design decision and
it's wired through `services/blockchain/payments.ts` + `paymentTx.ts`.

---

## The on‑chain primitive (Move)

The DeFi & Payments track rewards an **auditable on‑chain primitive** (1st/3rd place are sponsored by
**OpenZeppelin** and **OtterSec**). Brisk ships six small, focused Move modules ([`move/sources/`](move/sources)):

| Module              | What it is                                                                                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `merchant_registry` | Merchant identity: a `Merchant` profile object + a `MerchantCap` capability.                                                                                                                                                                       |
| `payment_receipt`   | **Verifiable receipts.** `issue<T>` mints an immutable `Receipt` (payer, payee, amount, currency, memo, invoice id, time) to the payer and emits a `PaymentMade` event — the canonical, indexable record a merchant queries for their sales.       |
| `spending_vault`    | **The novel primitive.** A per‑user `Vault<T>` custodies a lender position so idle USDC earns yield while staying instantly spendable. `deposit` consolidates, `withdraw` re‑supplies the remainder. **Value conservation** is the core invariant. |
| `mock_lender`       | Testnet lender behind the adapter seam: a shared `LendingPool<T>` accruing deterministic, time‑based yield from an admin‑funded reserve (`supply` / `redeem` / `current_value`).                                                                   |
| `lender_adapter`    | Documents the **only** testnet→mainnet swap point: replace `mock_lender` with a real Suilend/Scallop adapter exposing the same shape — no app changes.                                                                                             |
| `loyalty`           | **Closed‑loop cashback.** `Points` has `key` but **not** `store`, so it can only be moved or burned by this module — a regulated loyalty credit with no free transfers. `earn` mints 1% on payment; `redeem` burns.                                |

Every merchant payment is a **single atomic PTB**: move USDC → mint `Receipt` → mint cashback. If any step
fails, the whole payment reverts.

All four test suites pass (`sui move test`): receipt fields, merchant registration, vault
`deposit → +1yr → withdraw == principal + 10%`, and cashback mint/redeem.

---

## Architecture

```
┌───────────────────────────── Mobile app (Expo / React Native) ─────────────────────────────┐
│  Pay (iOS+Android)        Charge (Android terminal)        Save (vault)                       │
│  NFC read → Face ID       amount → HCE emulate tag         deposit / withdraw / yield          │
│        │                        │                                │                             │
│        ├── @mysten/sui (PTBs, on‑device) ── zkLogin (Enoki) ── expo-secure-store (keys)        │
└────────┼────────────────────────┼────────────────────────────────┼────────────────────────────┘
         │ build PTB               │ HCE (custom native module)     │ devInspect / events
         ▼                         ▼                                ▼
┌──────────────────────┐   ┌──────────────────────────────────────────────────────────────────┐
│  Sponsor relay        │   │                         Sui (testnet)                              │
│  (Node/Express)       │   │  brisk package: merchant_registry · payment_receipt ·              │
│  /api/sponsor         │──►│  spending_vault · mock_lender · lender_adapter · loyalty           │
│  /api/execute (Enoki) │   │  + native gasless 0x2::balance::send_funds<USDC>                   │
│  /auth/callback relay │   │  + Circle USDC · LendingPool<USDC> @ 10% APY                        │
└──────────────────────┘   └──────────────────────────────────────────────────────────────────┘
```

- **Mobile** calls the Sui TypeScript SDK directly on‑device (incl. the critical Hermes `Intl.PluralRules`
  polyfill that makes the SDK work in React Native).
- **Backend** is a thin sponsor relay only — it holds the Enoki _private_ key (which can't ship in the app)
  and proxies the Google OAuth redirect to the `brisk://oauth` deep link. It never sees the user's key.
- **Auth**: zkLogin via Google + Enoki; the ephemeral key lives in `expo-secure-store` and never leaves the
  device; signing is gated by Face ID / fingerprint (`expo-local-authentication`).

---

## Tech stack

- **Mobile:** Expo (SDK 54) · React Native 0.81 · expo-router · NativeWind · Zustand · TanStack Query
- **Sui:** `@mysten/sui` (on‑device PTBs) · `@mysten/enoki` (zkLogin + sponsorship, via HTTP API in RN)
- **NFC:** custom native Kotlin HCE module (merchant) · `react-native-nfc-manager` (customer read, iOS+Android)
- **Auth:** zkLogin (Google) · Enoki Gas Pool · `expo-local-authentication` (biometrics)
- **On‑chain:** Move 2024 (Sui) — 6 modules, `sui move test`
- **Backend:** Node + Express + Zod (sponsor relay), Enoki TypeScript SDK

---

## Repository layout

```
brisk/
├── app/                      # expo-router screens
│   ├── (tabs)/index.tsx      #   Wallet — balance · Receive/Send · activity
│   ├── (tabs)/pay.tsx        #   Pay    — customer NFC tap → Face ID → pay
│   ├── (tabs)/merchant.tsx   #   Charge — Brisk Terminal (Android HCE)
│   ├── (tabs)/save.tsx       #   Save   — yield vault
│   ├── welcome.tsx           #   Onboarding carousel → Continue with Google
│   ├── receive.tsx           #   Receive — address QR + copy
│   └── send.tsx              #   Send    — paste address → Face ID → feeless send
├── hooks/                    # usePay, useCharge, useSave, useWallet, useSend, useActivity, useAuth
├── services/
│   ├── auth/                 # enokiAuth (zkLogin login/restore/sign)
│   ├── blockchain/           # suiClient, paymentTx, payments, wallet, vaultTx, saveAccount, receipts
│   └── nfc/                  # hce (merchant), reader (customer)
├── plugins/
│   ├── withBriskHce.js       # config plugin: inject HCE module + manifest + aid_list
│   └── hce-android/          # Kotlin: HceNdefService, BriskHceModule, BriskHcePackage
├── move/
│   ├── sources/              # 6 Move modules
│   ├── tests/                # Move unit tests
│   └── deployments.json      # testnet addresses
├── backend/                  # Enoki sponsor relay (Express)
└── docs/PLAN.md              # living implementation plan / status
```

---

## Deployed on testnet

| Object                            | ID                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Package**                       | [`0xc7073f8c…fb72204a`](https://suiscan.xyz/testnet/object/0xc7073f8c1f54ece01d81e4b4cd9a16931ddacc43875bf80bf4780112fb72204a)                   |
| **LendingPool\<USDC\>** (10% APY) | [`0x2e3c89fa…80f16457`](https://suiscan.xyz/testnet/object/0x2e3c89fa3b757dcbe0ea8242e1368d8662ed6ed0eda2c412cafe0b1380f16457)                   |
| USDC (Circle, testnet)            | [`0xa1ec7fc0…::usdc::USDC`](https://suiscan.xyz/testnet/coin/0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC/txs) |
| App bundle id / scheme            | `com.gkouvas.brisk` / `brisk://`                                                                                                                 |

Full record (incl. UpgradeCap, AdminCap, publish digest) in [`move/deployments.json`](move/deployments.json). Browse the live package, pool, and payment events on [Suiscan](https://suiscan.xyz/testnet/object/0xc7073f8c1f54ece01d81e4b4cd9a16931ddacc43875bf80bf4780112fb72204a).

---

## Run it yourself

> **NFC requires real hardware** — there is no NFC on the iOS Simulator. The full tap needs a merchant
> Android device + a customer phone. iPhone NFC additionally requires a **paid Apple Developer Program**
> membership (Apple gates NFC behind it); two Android devices work entirely free.

```bash
# 0. Install
npm install
cp .env.example .env                 # fill in Enoki + Google client id (see below)
cp backend/.env.example backend/.env # fill in ENOKI_PRIVATE_KEY
(cd backend && npm install)

# 1. Sponsor relay (holds the Enoki private key)
cd backend && npm run dev
# 2. Expose it publicly so devices + Google OAuth can reach it
cd backend && npm run ngrok

# 3a. Brisk Terminal on an Android device (merchant / HCE)
npx expo run:android --device
# 3b. Customer app on a phone (iPhone needs a paid Apple team for NFC)
npx expo run:ios --device     # or a 2nd Android: npx expo run:android --device

# Move
cd move && sui move test       # run the on-chain test suites
cd move && sui move build      # compile
```

**Configuration** (`.env`): `EXPO_PUBLIC_ENOKI_API_KEY`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (a Google
_Web_ OAuth client with `<backend>/auth/callback` as an authorized redirect URI),
`EXPO_PUBLIC_BACKEND_URL` (the public/ngrok URL), `EXPO_PUBLIC_BRISK_PACKAGE_ID`, `EXPO_PUBLIC_BRISK_POOL_ID`.
Backend (`backend/.env`): `ENOKI_PRIVATE_KEY`.

**Demo flow:** sign in with Google on both devices → on Android open **Charge**, enter an amount →
on the customer phone open **Pay**, tap the terminal → Face ID → the merchant flips to **Paid ✓**, the
customer holds a `Receipt` + cashback, and idle balances can be parked in **Save** to earn yield.

---

## Security posture

Built for the OpenZeppelin / OtterSec lens:

- **Capability‑gated admin** — pool creation/config requires the `mock_lender::AdminCap`.
- **Closed‑loop loyalty** — `Points` is `key`‑only (no `store`), so it can never be transferred or composed
  outside its module.
- **Value conservation** — the vault never mints value: `withdraw` returns exactly principal + accrued, and
  `redeem` asserts the reserve can cover it (`EInsufficientReserve`). Covered by a unit test; a Move Prover
  spec is queued.
- **No custody of user keys** — the backend only sponsors gas; the zkLogin ephemeral key stays in
  `expo-secure-store` on the device and signs locally.
- **Sponsorship allow‑lists** — every sponsored PTB declares its exact `allowedMoveCallTargets`; Enoki
  rejects anything outside the list (anti‑abuse), plus a per‑sender daily cap on the relay.
- **Atomic payments** — money + receipt + cashback are one PTB; partial failure reverts everything.

---

## Monetization

Payments are **always free to the user**. Brisk's only take‑rate is a **spread on the yield** generated by
idle balances in the Save vault — users still net positive versus a bank, and incentives stay aligned (we
earn only when we earn for you). Configurable via `EXPO_PUBLIC_YIELD_SPREAD_BPS` (default 10% of yield).

---

## Roadmap

**Testnet → mainnet** is a single seam: swap `mock_lender` for a real **Suilend/Scallop** adapter behind
`lender_adapter`, point config at mainnet USDC + the Enoki gas pool, re‑publish, and (with the won audit
credits) ship. No app‑logic changes.

- **v2:** fiat **on/off‑ramp** (Apple Pay / Google Pay via a ramp partner) — flow analyzed in
  [`docs/ONRAMP_OFFRAMP.md`](docs/ONRAMP_OFFRAMP.md) · cashback redemption marketplace · merchant
  analytics · iOS‑as‑terminal once Apple's EEA device‑to‑device NFC entitlement is granted · enable the
  yield‑spread fee.

---

## Honest limitations

We'd rather be straight about the edges than oversell:

- **Merchant terminal is Android‑only.** HCE doesn't exist on iOS without a hard entitlement, so the
  _terminal_ runs on Android; the _customer_ works on iOS + Android. (A merchant on iPhone falls back to QR.)
- **iOS NFC needs a paid Apple account.** Free/Personal Apple teams can't provision the NFC capability.
- **Testnet yield is from a mock lender** with an admin‑funded reserve, behind the adapter interface — the
  mainnet adapter wires a real money market. The reserve must be funded (`mock_lender::fund`) to pay yield.
- **End‑to‑end on‑device tap** is pending a second NFC device; the app builds, runs, signs in via zkLogin,
  and loads the HCE module on a Pixel 9 Pro today.

See [`docs/PLAN.md`](docs/PLAN.md) for the full status and the phase‑by‑phase implementation log.
