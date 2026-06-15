<div align="center">

# Brisk

### Tap to pay in stablecoins — feeless to the user, your idle dollars earn while you spend, and every merchant gets gift cards out of the box.

**A decentralized tap‑to‑pay point‑of‑sale on [Sui](https://sui.io).**
A customer taps their phone (iPhone **or** Android) to a merchant's _Brisk Terminal_ and pays in **USDC** —
charged the exact amount, **no gas, no card fees** — and the merchant is paid **instantly**.
Idle balances earn yield in a one‑tap **Save** vault, and any merchant can sell **on‑chain gift cards**
that customers buy, share, claim, and re‑gift — all gasless.

`Sui Overflow 2026` · **DeFi & Payments** track · Built on Sui's protocol‑level **gasless stablecoin transfers**

**[▶ Watch the demo](https://www.youtube.com/watch?v=K89fJfj3xQo)** · **[🌐 Live site](https://brisk-site.onrender.com)** · **[📱 Test the Android APK](https://appdistribution.firebase.dev/i/daeadf277c746f80)**

</div>

---

## Table of contents

- [Why Brisk](#why-brisk)
- [What makes it different](#what-makes-it-different)
- [The three unique pieces](#the-three-unique-pieces)
- [How the tap works (the hard part)](#how-the-tap-works-the-hard-part)
- [On‑chain gift cards (the merchant‑prepaid promise)](#onchain-gift-cards-the-merchantprepaid-promise)
- [Merchant identity & Pro mode](#merchant-identity--pro-mode)
- [Remote pay: payment links](#remote-pay-payment-links)
- [Feeless by design: gasless vs sponsored](#feeless-by-design-gasless-vs-sponsored)
- [The on‑chain primitives (Move)](#the-onchain-primitives-move)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Deployed on testnet](#deployed-on-testnet)
- [Run it yourself](#run-it-yourself)
- [Security posture](#security-posture)
- [Monetization](#monetization)
- [Roadmap](#roadmap)
- [Honest limitations](#honest-limitations)

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
Except it's feeless to the customer, settles to the merchant in under a second, runs on open rails, your
spending balance earns yield instead of sitting idle, and the merchant gets a full gift‑card program for free.

> **Headline:** _"Tap to pay in stablecoins — feeless to the user, and your idle dollars earn while you spend."_

---

## What makes it different

|                  | Card networks          | Existing crypto wallets (incl. Slush) | **Brisk**                          |
| ---------------- | ---------------------- | ------------------------------------- | ---------------------------------- |
| Customer fee     | 0 (merchant pays 2–3%) | Gas on every tx                       | **$0 — gasless / sponsored**       |
| Onboarding       | Bank account           | Seed phrase                           | **Google sign‑in (zkLogin)**       |
| Pay gesture      | Tap                    | Scan a QR / paste address             | **Tap (NFC), iOS + Android**       |
| Settlement       | Days                   | Seconds                               | **Sub‑second, on‑chain**           |
| Idle balance     | 0%                     | 0%                                    | **Earns yield (Save vault)**       |
| Proof of payment | Statement              | Tx hash                               | **On‑chain `Receipt` object**      |
| Gift cards       | Closed SaaS, ~3–10%    | —                                     | **On‑chain, gasless, re‑giftable** |

No existing Sui wallet does NFC tap‑to‑pay, and none turns every merchant into a gift‑card issuer with
trust‑minimized, self‑custodial vouchers. Those — plus the on‑chain spending‑vault primitive — are Brisk's
core technical contributions.

---

## The three unique pieces

Brisk is small but opinionated. Three things here don't exist elsewhere on Sui, and each is wired to a
focused on‑chain primitive rather than bolted on as UI:

1. **Cross‑platform NFC tap‑to‑pay with no Apple entitlement** — a custom Kotlin HCE module turns an
   Android phone into an NFC tag the customer's iPhone _or_ Android reads. ([details ↓](#how-the-tap-works-the-hard-part))
2. **A spending account that earns yield** — `spending_vault` custodies a lender position so idle USDC
   compounds while staying instantly spendable, with value‑conservation as the core invariant. ([details ↓](#the-onchain-primitives-move))
3. **On‑chain gift cards on a merchant‑prepaid promise model** — the merchant is paid at issuance, the
   card is a self‑custodial redeemable promise, and the recipient can claim _or re‑gift_ it via a
   hashed‑secret link. ([details ↓](#onchain-gift-cards-the-merchantprepaid-promise))

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
"terminal is an Android device" assumption is exactly what Square/SoftPOS rely on. (An iPhone‑as‑terminal
mode is on the roadmap, pending Apple's EEA device‑to‑device NFC entitlement — see [Roadmap](#roadmap).)

> We built a **custom native HCE module** (Kotlin `HostApduService` implementing the Type‑4 APDU state
> machine, see [`plugins/hce-android/`](plugins/hce-android)) because the only off‑the‑shelf RN library,
> `react-native-hce`, is unmaintained and incompatible with React Native 0.81 / AGP 8.

---

## On‑chain gift cards (the merchant‑prepaid promise)

Most gift‑card programs are closed SaaS that hold the float and clip 3–10%. Brisk makes gift cards a
**first‑class on‑chain object** any merchant gets for free — and chooses the economic model that gives the
merchant a real reason to participate: **the merchant is paid upfront.**

```
  Buyer pays $50                        Recipient claims                 Recipient redeems / re‑gifts
  ─────────────                         ───────────────                  ────────────────────────────
  gift_card::mint           share link  gift_card::claim     pay flow    gift_card::redeem  (draws down)
  fee 3% ($1.50) → treasury  #s=secret  blake2b256(secret)   ─────────►  no coin moves (merchant prepaid)
  net $48.50    → MERCHANT   ─────────► == claim_hash                    gift_card::regift  (new secret)
  promise of $50 → GiftCard              recipient = sender              ─────────► hand it on to a friend
```

- **Merchant‑prepaid.** `mint` pays the merchant their **net (face − fee) immediately** and skims the
  protocol **fee to the treasury** — both on‑chain, at purchase. The merchant gets working capital + the
  breakage benefit and gives up ~3% for it, exactly like a real gift‑card program.
- **The card holds no escrow.** The `GiftCard` object is a pure **redeemable promise** of the full face
  value at that merchant; `redeem` moves no funds (the merchant was already paid) — it just draws down the
  remaining balance on‑chain so it can't be double‑spent.
- **zkSend‑style hashed‑secret links.** The buyer shares `…/g/<code>#s=<secret>`. Only `blake2b256(secret)`
  is stored on‑chain; the secret itself lives **only in the URL fragment** and never touches the backend.
  `claim` binds the card to the first address that presents the matching secret.
- **Re‑giftable.** Received a card you won't use? `regift` (recipient‑gated) resets it with a fresh secret
  so you can pass it on — the value and merchant binding are preserved.
- **Never lost.** The issuer's secret is persisted **locally on‑device** (never server‑side), so a sent‑but‑
  unclaimed link can always be re‑shared from _My gift cards_; entries self‑prune once claimed or spent.
- **Gasless end‑to‑end.** Buy, claim, redeem, and re‑gift are all **Enoki‑sponsored** — no SUI ever needed.
- **Discovery.** Customers find merchants via in‑app search; merchants share a `…/gc/<merchantId>` "sell
  gift cards" link. At checkout, a held card for that merchant is applied automatically.

The whole flow is in `move/sources/gift_card.move` (+ `gift_card_tests.move`), `services/blockchain/giftCard.ts`,
and the `app/buy-gift-card · claim · gift-cards · gift-link` screens.

---

## Merchant identity & Pro mode

Brisk has two faces behind one Google sign‑in. A long‑press‑free **Settings → mode toggle** flips between:

- **Personal** — the consumer wallet: balance, Receive/Send, Save, gift cards, activity.
- **Pro** — the merchant view: a **business name** (shown on receipts, links, and gift cards) registered in
  an on‑chain `merchant_registry` + a backend directory so customers see _"Acme Coffee"_, not `0x…`. The Pro
  dashboard shows a single **Total balance** across treasury + Save + all receiving accounts, an itemized
  account list, **New charge**, and a **Business hub** (identity, gift‑card share link, fee transparency).

**Receiving accounts (tills).** Merchants collect into named **`till`** shared objects — address accumulators
that keep the merchant's _private treasury_ hidden from customers (a customer paying a till never sees the
merchant's main balance). Funds sweep from a till to the treasury on demand, and zero‑balance tills are
hidden from the dashboard.

---

## Remote pay: payment links

NFC is for in‑person taps. When the customer isn't there — or the merchant is on iOS (no HCE) — Brisk
mints a **shareable payment link** instead. From **Charge**, enter an amount and tap _Create payment link_:
the backend stores the invoice under a short code and returns `https://<host>/p/<code>` to copy or share
(WhatsApp, etc.). When the customer opens it, the landing page **deep‑links into the app** (`brisk://pay?code=…`,
the same redirect trick as the OAuth relay) for a one‑tap pay; if the app isn't installed it shows the
invoice + a "get Brisk" fallback. Links have a real lifecycle — **single‑use or reusable**, **configurable
expiry** (1h/24h/7d), **cancel/void**, and a **"My payment links"** management screen showing each link's
status. Backed by Postgres in the relay (`/api/links`, `/p/:code`); the payment itself runs the same
two‑leg gasless+receipt flow. Gift‑card claim (`/g/:code`) and "sell gift cards" (`/gc/:merchantId`) landings
share the same deep‑link mechanism.

---

## Feeless by design: gasless vs sponsored

The user **never** pays gas. The money itself always moves over Sui's **native gasless** rail; an
**Enoki‑sponsored** leg adds the on‑chain receipt on top:

1. **Native gasless (settlement, source of truth)** — the transfer is a PTB of only
   `0x2::balance::send_funds<USDC>`, submitted straight to the fullnode. Sui treats it as a **zero‑fee**
   Address‑Balances transfer; the sender needs no SUI. This is the actual demonstration — USDC moving at
   zero protocol gas with no sponsor — and it's what shows in the activity feed.
2. **Enoki‑sponsored receipt (best‑effort)** — a merchant payment then records the on‑chain `Receipt` in a
   separate sponsored PTB (`payment_receipt::record_payment`) that mints the `Receipt` + emits `PaymentMade`
   **without moving a coin**. If this leg ever fails, the payment has already settled in leg 1 — the receipt
   is just skipped (`receiptIssued = false`).

So a merchant/link payment is **two feeless legs**; a plain P2P Send is just leg 1. Gift‑card buy/claim/
redeem/re‑gift are **fully sponsored** PTBs. Either way the customer is charged `$X` and pays `$0`. Wired
through `services/blockchain/payments.ts` + `paymentTx.ts`.

---

## The on‑chain primitives (Move)

The DeFi & Payments track rewards **auditable on‑chain primitives** (1st/3rd place are sponsored by
**OpenZeppelin** and **OtterSec**). Brisk ships **seven** small, focused Move modules ([`move/sources/`](move/sources)):

| Module              | What it is                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `merchant_registry` | Merchant identity: a shared `Merchant` profile + a `MerchantCap`. `register_and_share` onboards a merchant (shares the profile so a customer's pay PTB can reference it; the cap goes to the merchant). `controls(cap, merchant)` gates merchant‑only actions; `owner(merchant)` is the payout address.                                                                                                                |
| `payment_receipt`   | **Unforgeable, merchant‑bound receipts.** Both paths read `payee`/`merchant` from the on‑chain `Merchant` profile (never caller‑supplied): `pay<T>` moves USDC and mints the `Receipt` atomically; `record_payment<T>` is the **receipt leg of the two‑leg payment** (mints the soulbound `Receipt` + emits `PaymentMade`, moves no coin). `refund<T>` returns funds, gated by `MerchantCap`.                          |
| `spending_vault`    | **The novel primitive.** A per‑user `Vault<T>` custodies a single lender position so idle USDC earns yield while staying instantly spendable. `deposit` adds shares (yield compounds via the rising exchange rate); `withdraw` redeems, splits the requested amount, and re‑supplies the remainder. **Value conservation** is the core invariant.                                                                      |
| `till`              | **Merchant receiving accounts.** A named shared `Till` accumulates customer payments into an address accumulator that **hides the merchant's private treasury** from payers; `sweep` moves funds to the treasury, `set_treasury`/`rename`/`set_active` are `MerchantCap`‑gated.                                                                                                                                        |
| `gift_card`         | **On‑chain, closed‑loop, merchant‑prepaid gift cards.** `mint<T>` pays the merchant net + treasury fee at issuance (no escrow); `claim` binds a recipient via a `blake2b256` hashed secret; `redeem` draws down the promise (recipient‑gated, merchant‑locked, no funds move); `regift` lets the holder reset it with a fresh secret to pass it on.                                                                    |
| `mock_lender`       | Testnet **cToken/share money market** mirroring Suilend/Scallop, behind the adapter seam. Suppliers receive **shares** priced by a global **compounding `exchange_rate`**; `redeem` burns shares at the current rate, clamped to liquidity so it never aborts. A **`reserve_factor`** routes the protocol's cut of interest into a `reserves` balance, claimable via `claim_reserves` (the **on‑chain yield spread**). |
| `lender_adapter`    | The **only** testnet→mainnet swap point — the vault routes every supply/redeem/value call through it; today it delegates to `mock_lender`, on mainnet you repoint it at a real Suilend/Scallop market with **no vault or app changes**.                                                                                                                                                                                |

Gift cards and tills were added as **package upgrades** that preserve type identity and public signatures —
the prepaid rework, for instance, changed only function bodies so it stayed upgrade‑compatible.

All test suites pass — **`sui move test`, 34 tests** — covering: authentic receipt fields + exact‑amount
change + insufficient‑funds abort, `MerchantCap`‑gated refund, merchant registration, the share‑model vault
(`deposit → +1yr → withdraw == principal + yield`, multi‑deposit share accrual, partial‑withdraw re‑supply,
multi‑user isolation, withdraw clamp), the money market (shares at the exchange rate, compounding,
**reserve factor → reserves + `claim_reserves`**, graceful clamp, forward‑only `set_apy`), till sweep/caps,
and the full gift‑card lifecycle (**merchant paid net at mint + fee to treasury**, full/partial draw‑down,
over‑redeem abort, wrong‑secret / double‑claim / non‑recipient / wrong‑merchant aborts, and
**re‑gift → new claimer → redeem**).

---

## Architecture

```
┌───────────────────────────── Mobile app (Expo / React Native) ─────────────────────────────┐
│  Pay (iOS+Android)   Charge (Android terminal)   Save (vault)   Gift cards   Pro / Business   │
│  NFC read → Face ID  amount → HCE emulate tag     deposit/yield  buy·claim·   identity·tills   │
│        │                   │                          │          redeem·regift     │           │
│        ├── @mysten/sui (PTBs, on‑device) ── zkLogin (Enoki) ── expo-secure-store (keys)        │
└────────┼───────────────────┼──────────────────────────┼───────────────────┼──────────────────┘
         │ build PTB          │ HCE (custom native)       │ devInspect/events  │ sponsored PTBs
         ▼                    ▼                            ▼                    ▼
┌──────────────────────┐   ┌──────────────────────────────────────────────────────────────────┐
│  Relay + index store  │   │                         Sui (testnet)                              │
│  (Express + Postgres) │   │  brisk pkg: merchant_registry · payment_receipt · spending_vault · │
│  /api/sponsor·execute │──►│  till · gift_card · mock_lender · lender_adapter                   │
│  /api/links · /p/:code│   │  + native gasless 0x2::balance::send_funds<USDC>                   │
│  /api/giftcards·/g·/gc│   │  + Circle USDC · cToken LendingPool<USDC> @ 10% APY                 │
│  /auth/callback relay │   │  + GiftCardConfig (fee bps + treasury, enforced on‑chain)          │
└──────────────────────┘   └──────────────────────────────────────────────────────────────────┘
```

- **Mobile** calls the Sui TypeScript SDK directly on‑device (incl. the critical Hermes `Intl.PluralRules`
  polyfill that makes the SDK work in React Native).
- **Backend** is a thin sponsor relay + **metadata index** — it holds the Enoki _private_ key (which can't
  ship in the app), proxies the Google OAuth redirect to `brisk://oauth`, and indexes payment links, the
  merchant directory, tills, and gift‑card codes (state of record stays on‑chain; gift‑card secrets never
  reach it). It never sees the user's key.
- **Auth**: zkLogin via Google + Enoki; the ephemeral key lives in `expo-secure-store` and never leaves the
  device; signing is gated by Face ID / fingerprint (`expo-local-authentication`).

---

## Tech stack

- **Mobile:** Expo (SDK 54) · React Native 0.81 · expo-router · NativeWind · Zustand · TanStack Query
- **Sui:** `@mysten/sui` (on‑device PTBs) · `@mysten/enoki` (zkLogin + sponsorship, via HTTP API in RN)
- **NFC:** custom native Kotlin HCE module (merchant) · `react-native-nfc-manager` (customer read, iOS+Android)
- **Auth:** zkLogin (Google) · Enoki Gas Pool · `expo-local-authentication` (biometrics)
- **Crypto:** `@noble/hashes` blake2b (gift‑card claim secrets, matched to `sui::hash::blake2b256`) · `expo-crypto`
- **On‑chain:** Move 2024 (Sui) — 7 modules, `sui move test` (34 tests)
- **Backend:** Node + Express + Zod (sponsor relay + link/merchant/till/gift‑card index) · Postgres (`pg`) · Enoki TypeScript SDK

---

## Repository layout

```
brisk/
├── app/                      # expo-router screens
│   ├── (tabs)/index.tsx      #   Wallet — balance · Receive/Send · gift cards · activity (live Save card)
│   ├── (tabs)/pay.tsx        #   Pay    — customer NFC tap → Face ID → pay
│   ├── (tabs)/merchant.tsx   #   Charge — Brisk Terminal (HCE) + Create payment link
│   ├── (tabs)/save.tsx       #   Save   — live‑ticking yield, projections, history, quick actions
│   ├── (tabs)/links.tsx      #   "My payment links" — merchant link manager (status / cancel)
│   ├── pay-link.tsx          #   One‑tap confirm for an incoming payment link (auto‑applies gift credit)
│   ├── buy-gift-card.tsx     #   Buy a gift card (merchant search or share‑link) → sponsored mint
│   ├── claim.tsx             #   Claim a gift card from a hashed‑secret link
│   ├── gift-cards.tsx        #   My gift cards — held (redeem/re‑gift) + sent (re‑share) buckets
│   ├── gift-link.tsx         #   Shareable gift link (QR + copy + share), reused for re‑gift
│   ├── business.tsx          #   Pro Business hub — identity · gift‑card link · fee transparency
│   ├── tills.tsx             #   Receiving accounts (create / sweep / manage)
│   ├── pro-setup.tsx         #   First‑time Pro: capture the business name
│   ├── settings.tsx          #   Mode toggle · theme · terms · contact · logout
│   ├── welcome.tsx           #   Onboarding carousel → Continue with Google
│   └── receive.tsx / send.tsx #  Receive (QR) · Send (feeless P2P)
├── hooks/                    # usePay, useCharge, useSave, useWallet, useSend, useActivity, useAuth,
│                             #   useGiftCards, usePayDiscounts, useTills, useMerchantProfile, useLiveYield …
├── components/ui/ + screens/ # Aurora kit (GlassCard, StatChip, Sparkline, AnimatedCheck…) + ProDashboard
├── store/                    # Zustand: authStore, appModeStore, themeStore, pendingPaymentStore
├── services/
│   ├── auth/                 # enokiAuth (zkLogin login/restore/sign)
│   ├── api/                  # backendApi (sponsor/execute, links, merchants, tills, gift cards)
│   ├── blockchain/           # suiClient, paymentTx, payments, wallet, vaultTx, saveAccount,
│   │                         #   giftCard, tills, receipts, yieldMath, coverFromSave
│   ├── storage/              # prefsStorage (app mode, theme, locally‑held gift‑card secrets)
│   └── nfc/                  # hce (merchant), reader (customer)
├── plugins/
│   ├── withBriskHce.js       # config plugin: inject HCE module + manifest + aid_list
│   └── hce-android/          # Kotlin: HceNdefService, BriskHceModule, BriskHcePackage
├── move/
│   ├── sources/              # 7 Move modules
│   ├── tests/                # Move unit tests (34)
│   └── deployments.json      # testnet addresses + upgrade history
├── backend/                  # Enoki sponsor relay + index (Express + Postgres)
│   └── src/                  #   server.ts, db.ts, services/{linkStore, merchantStore, tillStore, giftCardStore}
└── docs/                     # PLAN.md (status) · DEPLOY.md · ONRAMP_OFFRAMP.md
```

---

## Deployed on testnet

| Object                                                | ID                                                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Package** (base)                                    | [`0xcbd54ab5…d4fd03cc`](https://suiscan.xyz/testnet/object/0xcbd54ab52fad4110fdad2d9fd8e92e84dd87db436f2b608cc47819f7d4fd03cc)                   |
| **Upgrade — `record_payment`**                        | [`0x3ac880a1…6c2837cb`](https://suiscan.xyz/testnet/object/0x3ac880a1eab2763fc1b92376a88e1913d0bc4dbf02023a3c0a0321d16c2837cb)                   |
| **Upgrade — `till`**                                  | [`0xe96ec7f8…885b1e35`](https://suiscan.xyz/testnet/object/0xe96ec7f8b0633204af0a4060cc10adeac019641d1ec71096f0567071885b1e35)                   |
| **Upgrade — `gift_card`** (v6, prepaid + re‑gift)     | [`0xc90ebfad…0b6a86`](https://suiscan.xyz/testnet/object/0xc90ebfadb58657be143a09342d575223681587de6eb87efe006d720edc0b6a86)                     |
| **GiftCardConfig** (fee 3%, treasury, on‑chain)       | [`0xa50c8948…ead5bf7`](https://suiscan.xyz/testnet/object/0xa50c8948a8e4a555e3f7539dc9364e11e32ceec486403d15a61c74f4fead5bf7)                    |
| **LendingPool\<USDC\>** (10% APY, 10% reserve factor) | [`0xdd22637b…5c2023b8`](https://suiscan.xyz/testnet/object/0xdd22637b26c052aedd2ab234a62d52d607e3fe381cc2181768b154f25c2023b8)                   |
| USDC (Circle, testnet)                                | [`0xa1ec7fc0…::usdc::USDC`](https://suiscan.xyz/testnet/coin/0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC/txs) |
| App bundle id / scheme                                | `com.gkouvas.brisk` / `brisk://`                                                                                                                 |

Full record (UpgradeCap, AdminCaps, every publish + upgrade digest, and the upgrade history) lives in
[`move/deployments.json`](move/deployments.json).

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
cd move && sui move test       # run the on-chain test suites (34 tests)
cd move && sui move build      # compile
```

**Configuration** (`.env`): `EXPO_PUBLIC_ENOKI_API_KEY`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (a Google
_Web_ OAuth client with `<backend>/auth/callback` as an authorized redirect URI),
`EXPO_PUBLIC_BACKEND_URL` (the public/ngrok URL), `EXPO_PUBLIC_BRISK_PACKAGE_ID`,
`EXPO_PUBLIC_BRISK_RECORD_PKG`, `EXPO_PUBLIC_BRISK_TILL_PKG`, `EXPO_PUBLIC_BRISK_GIFT_CARD_PKG`,
`EXPO_PUBLIC_GIFT_CARD_CONFIG_ID`, `EXPO_PUBLIC_BRISK_POOL_ID`, `EXPO_PUBLIC_BRISK_RESERVE_FACTOR_BPS`.
Backend (`backend/.env`): `ENOKI_PRIVATE_KEY`, the package ids above (sponsorship allowlist — must also be
listed in the **Enoki dashboard** allowlist), and `DATABASE_URL` (Postgres) + `PUBLIC_BASE_URL` for links
and gift‑card landings.

**Demo flow:** sign in with Google on both devices → on Android open **Charge**, enter an amount → on the
customer phone open **Pay**, tap the terminal → the merchant flips to **Paid ✓**, the customer holds an
on‑chain `Receipt`. Park idle balances in **Save** to earn yield, or **buy a gift card** for a merchant,
share the link, claim it on a second account, and **re‑gift** or **redeem** it at checkout.

---

## Security posture

Built for the OpenZeppelin / OtterSec lens:

- **Capability‑gated actions** — pool config + yield funding require `mock_lender::AdminCap`; merchant
  `refund`, till `sweep`/`set_treasury`, and gift‑card config changes require the `MerchantCap`/`AdminCap`
  that `controls` the object, so no actor can act "as" another.
- **Unforgeable, merchant‑bound receipts** — a `Receipt`/`PaymentMade` can only come from
  `payment_receipt::pay` or `record_payment`, both of which read payee/merchant from the on‑chain `Merchant`
  profile, so payee/merchant/timestamp are authentic and the receipt is soulbound to the payer.
- **Gift‑card secrets are off‑chain by design** — only `blake2b256(secret)` is stored on‑chain; the secret
  lives in the link fragment and on the issuer's device, never on the backend. `claim` is first‑valid‑secret‑
  wins; `redeem`/`regift` are recipient‑gated and merchant‑locked. The 3% fee is enforced in the on‑chain
  `GiftCardConfig`, never supplied by the buyer.
- **Solvent / graceful by construction** — the cToken market prices shares off a time‑driven exchange rate
  (never `backing / total_shares`), so it's structurally immune to the first‑depositor inflation attack;
  `redeem` pays `min(owed, backing)` and **never aborts**. Value conservation, share isolation, compounding,
  the reserve split, and the withdraw clamp are all unit‑tested.
- **No custody of user keys** — the backend only sponsors gas + indexes metadata; the zkLogin ephemeral key
  stays in `expo-secure-store` on the device and signs locally.
- **Sponsorship allow‑lists** — every sponsored PTB declares its exact `allowedMoveCallTargets`; Enoki rejects
  anything outside the list (anti‑abuse), plus a per‑sender daily cap on the relay.
- **Money moves gasless, receipt is best‑effort** — settlement is a native‑gasless transfer (no sponsor in
  the trust path); the sponsored receipt leg can fail without affecting the (already‑settled) payment.

---

## Monetization

Payments are **always free to the user**. Brisk earns from two aligned, on‑chain take‑rates:

1. **Yield spread on idle balances** — the Save vault's money market diverts a `reserve_factor` (currently
   **10%**) of accrued interest into a `reserves` balance, claimable to the treasury via
   `mock_lender::claim_reserves`. Suppliers earn the **net** APY (gross × (1 − reserve factor)); we earn only
   when we earn for you.
2. **Gift‑card fee** — a flat **3%** of each gift‑card sale, skimmed to the treasury **on‑chain at issuance**
   (enforced in `GiftCardConfig`), borne by the prepaid merchant — not the buyer or recipient.

Both are configurable (`EXPO_PUBLIC_BRISK_RESERVE_FACTOR_BPS` / `EXPO_PUBLIC_GIFT_CARD_FEE_BPS`) and there
are **no fees on ordinary payments**.

---

## Roadmap

**Testnet → mainnet** is a single seam: swap `mock_lender` for a real **Suilend/Scallop** adapter behind
`lender_adapter`, point config at mainnet USDC + the Enoki gas pool, re‑publish, and (with the won audit
credits) ship. No app‑logic changes.

- **v2:** fiat **on/off‑ramp** (Apple Pay / Google Pay via a ramp partner) — flow analyzed in
  [`docs/ONRAMP_OFFRAMP.md`](docs/ONRAMP_OFFRAMP.md) · merchant analytics & gift‑card event indexing ·
  buyer‑reclaim‑after‑expiry for unclaimed gift cards (the `expires_ms` field is already in the object) ·
  iOS‑as‑terminal once Apple's EEA device‑to‑device NFC entitlement is granted · automated treasury sweep of
  the (already on‑chain) yield‑spread reserves.

---

## Honest limitations

We'd rather be straight about the edges than oversell:

- **Merchant terminal is Android‑only.** HCE doesn't exist on iOS without a hard entitlement, so the
  _terminal_ runs on Android; the _customer_ works on iOS + Android. (An iPhone‑as‑terminal mode is roadmap.)
- **iOS NFC needs a paid Apple account.** Free/Personal Apple teams can't provision the NFC capability.
- **Testnet yield is from a mock lender** behind the adapter seam — a real cToken/share money market in
  mechanics (shares, compounding exchange rate, reserve factor), but supplier interest is paid from a
  pre‑seeded `backing` balance (admin `mock_lender::fund`) standing in for borrower repayments, since there's
  no borrow side on testnet. Principal is always redeemable; `redeem` clamps to backing and never aborts. On
  mainnet, `lender_adapter` repoints at a real Suilend/Scallop market — no vault/app changes.
- **The receipt leg depends on sponsorship.** The money always moves (native‑gasless leg 1); the on‑chain
  `Receipt` is a best‑effort sponsored leg 2, so a sponsorship hiccup means a settled payment without a
  minted receipt (`receiptIssued = false`), not a failed payment.
- **Gift cards are single‑currency, closed‑loop USDC** — redeemable only at the issuing merchant, by design.
- **End‑to‑end on‑device tap** is pending a second simultaneous NFC device; the app builds, runs, signs in
  via zkLogin, and loads the HCE module on a Pixel 9 Pro / Mi 9T Pro today.

See [`docs/PLAN.md`](docs/PLAN.md) for the full status and the phase‑by‑phase implementation log.
