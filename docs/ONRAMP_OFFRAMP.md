# Fiat On/Off‑Ramp — v2 flow analysis

> **Status: v2 (not built).** Today Brisk funds via **Receive** (send USDC to your Sui address; testnet
> uses the Circle faucet) and cashes out via **Send** (USDC to any address). This doc analyzes how real
> fiat ramps slot in for mainnet, so the path is clear.

## Goal

Let a user **add money with a card / Apple Pay / Google Pay** (on‑ramp) and **cash out to a bank**
(off‑ramp) — without Brisk ever touching fiat or becoming a money transmitter.

## Where it fits in the app

- **On‑ramp →** a new **"Add money"** action on the Wallet/Home screen, alongside the current **Receive**.
- **Off‑ramp →** a **"Cash out"** option in the **Send** flow (send to a bank instead of an address).

Both reuse what already exists: the on‑ramp simply makes USDC appear at the user's address (which
`getSpendableUsdcMicros` / `core.getBalance` already reads, including Address Balances); the off‑ramp is a
`send_funds` to the partner's deposit address (the existing `sendUsdc`).

## The key architectural choice: stay non‑custodial

Brisk should **never custody fiat or user funds**. The ramp **partner** is the regulated entity (MSB /
money transmitter, KYC/AML, licensing). Funds flow **partner ↔ user's self‑custodial Sui address**
directly. This keeps Brisk a software interface, not a financial institution — the same posture as the
rest of the app (the backend only sponsors gas; it never holds keys or money).

```
On‑ramp:   user → [partner KYC + card/Apple Pay] → USDC minted/sent to user's Sui address → shows in Brisk
Off‑ramp:  user → Brisk Send (USDC) → partner deposit address → [partner KYC] → fiat to user's bank
```

## Provider options (USDC, mobile, Sui)

| Provider                 | Notes                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Stripe Crypto Onramp** | Polished embeddable widget, Apple/Google Pay, strong trust; confirm Sui‑USDC destination support / availability. |
| **Transak**              | Wide coverage, supports many chains incl. Sui, on **and** off‑ramp, mobile SDK + webview.                        |
| **Ramp Network**         | Good UX, Apple/Google Pay, on/off‑ramp; check Sui‑USDC support.                                                  |
| **Coinbase Onramp**      | Trusted brand, deep USDC support; chain/region coverage to verify.                                               |

Selection criteria: native **USDC‑on‑Sui** payout/deposit, **both** on‑ and off‑ramp, a **mobile
webview/SDK**, acceptable fees + regional coverage, and the ability to **pre‑fill the destination
address** (the user's Brisk address) so funds land where the app already reads them.

## Integration sketch

- **On‑ramp:** open the partner's hosted flow (webview / `expo-web-browser`) with the user's Sui address as
  the destination and USDC‑on‑Sui as the asset. Partner runs KYC + payment; USDC arrives at the address;
  Brisk's balance poll picks it up. No new on‑chain code.
- **Off‑ramp:** request a deposit address (or use the partner SDK), then route Brisk's existing `sendUsdc`
  to it; the partner KYCs and pays out fiat. Could even reuse gasless `send_funds`.
- **Backend:** at most a thin endpoint to create partner sessions / sign widget params with the partner's
  secret (same shape as the existing Enoki sponsor relay). Still no custody.

## Regulatory / custody notes

- Brisk = non‑custodial software → avoids money‑transmitter licensing; the **partner** is the MSB.
- KYC/AML, sanctions screening, and fiat handling are the **partner's** responsibility.
- Regional availability, per‑transaction minimums, and fees vary by partner — surface them in‑flow.

## Testnet → mainnet

Ramps are **mainnet‑only**. On testnet we keep **Receive (address/QR) + Circle faucet** for funding and
**Send** for cash‑out. Flipping to mainnet is a config + partner‑integration step; no changes to Brisk's
on‑chain primitives.
