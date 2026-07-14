<div align="center">

# Brisk

### Tap to pay in stablecoins — feeless for shoppers, instant and card‑fee‑free for businesses.

Brisk is a **B2C payments app**. Shoppers tap their phone to pay in **USDC** — the exact amount,
**no gas, no card fees** — and their idle balance quietly **earns yield**. Businesses get **paid
instantly**, run a **gift‑card program** out of the box, and can plug Brisk straight into the
**point‑of‑sale / ERP** they already use. One Google sign‑in. No seed phrase. No pop‑ups.

**[▶ Watch the demo](https://www.youtube.com/watch?v=K89fJfj3xQo)** · **[🌐 Live site](https://brisk-site.onrender.com)** · **[📱 Get the Android app](https://appdistribution.firebase.dev/i/daeadf277c746f80)**

</div>

---

## The problem

Paying should be the easy part. It isn't.

- **Card networks** skim **2–3%** off every sale and settle to the business in _days_.
- **"Pay with crypto"** was supposed to fix that, but for normal people it's worse: gas fees, seed
  phrases, wallet pop‑ups, addresses to paste. Nobody taps a hardware wallet to buy a coffee.

Shoppers want **tap‑and‑go**. Businesses want money **now**, without a 3% haircut. Brisk gives both
sides exactly that — with the familiarity of Apple Pay and the economics of open money.

---

## What Brisk is

**One app, two sides, one Google sign‑in.**

- For the **shopper** — a tap‑to‑pay wallet where the balance is real dollars (USDC), payments are
  feeless, and idle money earns yield until the moment you spend it.
- For the **business** — a way to accept payments in person and remotely, issue gift cards, and get paid
  **instantly with zero card fees** — from a phone, or wired into your existing POS/ERP.

Everything is **self‑custodial** (your money is yours), **feeless** to the payer, and settles in
**under a second**.

---

## For shoppers

- **Sign in with Google — no seed phrase.** Your account is self‑custodial and created from a normal
  sign‑in; every payment is confirmed with **Face ID / fingerprint**.
- **Tap to pay.** Hold your phone to a Brisk terminal and pay the exact amount — works on **iPhone and
  Android**. It feels like Apple Pay; it's stablecoins on open rails.
- **Truly feeless.** You're charged `$X` and pay `$0` — **no gas, no card fees**, and you never need to
  hold any other token.
- **Your money earns while it waits.** Move idle balance into **Save** with one tap and it earns yield in
  the background — and it's still instantly spendable.
- **Your `@brisk` username.** Claim a handle once (`you@brisk`) and friends send you money **by name** —
  no long addresses. Your username, not a `0x…` address, is what people see when you pay, send, or receive.
- **Send to anyone, any way.** Send feelessly to a **`@brisk` username**, a raw **address**, or a **SuiNS
  `.sui` name** — Brisk resolves and verifies it before you confirm, and shows the real destination so you
  always know where the money is going. **Re‑send** to a friend in **one tap** from your recents.
- **Exchange money in person, no business needed.** Two friends can **tap phones to pay each other** on the
  spot — one enters the amount, the other taps. No addresses, no setup, feeless.
- **Gift cards.** Buy a gift card for any business — **browse and search** businesses (with their logos),
  then share the card by link. Recipients **claim** it, **redeem** it at checkout (it's applied
  automatically), or **re‑gift** it to someone else.
- **A clean history.** Your activity feed shows who you paid — businesses by their real **name and logo**,
  friends by their **`@brisk` username** — plus an on‑chain receipt for every purchase. Tap **See all** for
  your full history (payments and Save moves), loaded as you scroll.

---

## For businesses

- **Go Pro in seconds.** Flip to business mode from the same account. Setup is one‑time and smart — come
  back on a new phone and Brisk recognizes your business instead of asking again.
- **Your business, done properly.** Set your **name, VAT / Tax ID, address, contact details, category, and
  logo** — and they show up consistently everywhere customers see you (checkout, gift cards, activity).
- **Get paid in person, two ways:**
  - **Tap to charge** — enter an amount and have the customer tap to pay. Money lands instantly.
  - **Point‑of‑sale / ERP integration** — pair Brisk with the POS or ERP you already run using a short
    **terminal code**. Your system starts a sale, it's **pushed to the phone in real time** (with a buzz),
    the terminal **charges automatically over tap**, and the **on‑chain transaction reference is reported
    straight back to your ERP** — ready for tax reporting. Cancel a sale any time; every sale reconciles.
- **Receiving accounts.** Collect into named accounts that keep your **private treasury hidden** from
  customers, and sweep funds to your treasury whenever you like.
- **Payment links.** Not in person? Create a shareable payment link — **single‑use or reusable**, with an
  **expiry**, one‑tap **cancel**, and a management screen that tracks each link's status.
- **A gift‑card program for free.** Any business can sell gift cards. You're **paid upfront** at purchase;
  customers buy, share, and redeem them — no third‑party gift‑card platform taking a cut.
- **Instant settlement, no card fees.** Funds are yours the moment a customer pays — not in two business
  days, and without a 2–3% network fee. A dashboard shows your total balance and live activity.

---

## Why Brisk

|                     | Card networks           | Crypto wallets            | **Brisk**                       |
| ------------------- | ----------------------- | ------------------------- | ------------------------------- |
| Shopper fee         | 0 (business pays 2–3%)  | Gas on every payment      | **$0 — feeless**                |
| Sign‑up             | Bank account            | Seed phrase               | **Google sign‑in**              |
| Pay gesture         | Tap                     | Scan a QR / paste address | **Tap (NFC), iPhone + Android** |
| Business settlement | Days                    | Seconds                   | **Instant**                     |
| Idle balance        | 0%                      | 0%                        | **Earns yield**                 |
| Gift cards          | Closed platform, ~3–10% | —                         | **Built in, share & re‑gift**   |

---

## Feeless & self‑custodial

Brisk runs on **Sui's gasless stablecoin rails**, so a shopper pays **$0 in gas** and never needs to hold
any token other than the dollars they're spending. Accounts are **self‑custodial** and created from a
Google sign‑in — no seed phrase to lose, no wallet extension to install — and every payment settles
**on‑chain in under a second**. Simple on the surface, real money underneath.

---

## How Brisk makes money

Brisk keeps the core tap‑to‑pay experience free and earns from a few aligned, opt‑in revenue lines:

- **A small yield spread** on idle balances — we keep a slice of the yield your Save balance earns, so we
  only make money when you do.
- **A small gift‑card fee** — borne by the business that's paid upfront, never by the buyer or recipient.
- **A partnership spread on POS / ERP integrations** — businesses that plug Brisk into a connected
  point‑of‑sale or ERP pay a small, transparent spread that Brisk shares with the integration partner —
  funding the integration and bringing Brisk to more checkout counters.

Everyday shopper‑to‑business tap payments are always free.

---

## What's next

**On‑ramp & off‑ramp.** Fiat in and out — top up your Brisk balance with **Apple Pay / Google Pay** and
let businesses **cash out to their bank** — via a ramp partner, so getting money in and out is as easy as
spending it.

---

<div align="center">

**[▶ Demo](https://www.youtube.com/watch?v=K89fJfj3xQo)** · **[🌐 brisk‑site.onrender.com](https://brisk-site.onrender.com)** · **[📱 Android app](https://appdistribution.firebase.dev/i/daeadf277c746f80)**

`com.gkouvas.brisk` · `brisk://`

</div>
