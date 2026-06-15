# brisk-backend

A thin Express relay that lets the Brisk app run **Enoki-sponsored transactions**
without ever exposing the Enoki private key to the client, plus a **metadata index**
for the off-chain bits (payment-link codes, the merchant directory, tills, and
gift-card codes). It holds **no custody of user keys** — the chain stays the source
of record for value; Postgres only indexes metadata, and gift-card secrets never
reach it.

## Run

```bash
npm install
cp .env.example .env       # set ENOKI_PRIVATE_KEY (+ optional DATABASE_URL / limits)
npm run dev                # tsx watch on :3001
```

Expose it to the device with your tunnel of choice (e.g. `npm run ngrok`) and point
the app's `EXPO_PUBLIC_BACKEND_URL` at the public URL.

`DATABASE_URL` (Postgres) is **optional for local dev** — when it's unset, the
sponsorship / auth / faucet endpoints still work, but the payment-link, merchant,
till, and gift-card endpoints return `503` (they need the durable store). On Render,
`DATABASE_URL` is wired from the managed Postgres in [`../render.yaml`](../render.yaml).

## Endpoints

**Sponsorship & auth**

| Method | Path                             | Purpose                                                                                                                    |
| ------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/sponsor`                   | Wrap a `transactionKindBytes` PTB into an Enoki-sponsored tx; returns `{ bytes, digest }` to sign.                         |
| POST   | `/api/execute`                   | Submit the signed sponsored tx (`{ digest, signature }`) via Enoki; returns the on-chain digest.                           |
| GET    | `/api/user/:address/sponsorship` | Best-effort sponsorship usage for an address (per-address daily cap).                                                      |
| GET    | `/auth/callback`, `/auth/relay`  | OAuth relay: bounce the Google `id_token` to the `brisk://oauth` deep link (custom schemes can't be Google redirect URIs). |

**Support**

| Method | Path                                         | Purpose                                                          |
| ------ | -------------------------------------------- | ---------------------------------------------------------------- |
| POST   | `/api/faucet/request`                        | Rate-limited redirect to a public testnet faucet (Sui, for gas). |
| POST   | `/api/analytics/track`, `/api/errors/report` | In-memory dev telemetry (capped, reset on restart).              |
| GET    | `/health`                                    | Liveness probe.                                                  |

**Metadata index (Postgres-backed — require `DATABASE_URL`)**

| Method     | Path                                                                                                      | Purpose                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| POST / GET | `/api/links`, `/api/links/:code`                                                                          | Create a payment link / fetch one / list a merchant's links.                    |
| POST       | `/api/links/:code/paid`, `/api/links/:code/cancel`                                                        | Mark a link paid / cancel (void) a pending link.                                |
| GET        | `/p/:code`                                                                                                | Public payment-link landing → deep-links into `brisk://pay?code=…`.             |
| POST / GET | `/api/tills`, `/api/tills/:tillId/{treasury,active,rename}`                                               | Create / list / update merchant receiving accounts (tills).                     |
| POST / GET | `/api/merchants`, `/api/merchants/{search,lookup,by-owner/:address,:merchantId}`                          | Register / look up / search the merchant directory.                             |
| POST / GET | `/api/giftcards`, `/api/giftcards/record`, `/api/giftcards/code/:code`, `/api/giftcards/code/:code/claim` | Record an issued card, fetch by code, mark claimed, list a holder's cards.      |
| GET        | `/g/:code`, `/gc/:merchantId`                                                                             | Public gift-card claim / "sell gift cards" landings (same deep-link mechanism). |

The app's two-call sponsorship dance lives in `services/blockchain/sponsoredExec.ts`:
`/api/sponsor` → sign locally with the zkLogin ephemeral key → `/api/execute`.
A merchant payment is two feeless legs — settlement is **protocol-level gasless**
(`0x2::balance::send_funds<USDC>`, straight to the fullnode, **no relay**), then a
best-effort **sponsored** receipt leg (`payment_receipt::record_payment`) goes through
this relay. A plain Send is just the gasless leg.

## Configuration

- `ENOKI_PRIVATE_KEY` — **required**; the Enoki secret key (never sent to clients).
- `BRISK_PACKAGE_ID` (+ `BRISK_RECORD_PKG`, `BRISK_TILL_PKG`, `BRISK_GIFT_CARD_PKG`) —
  the relay's move-call **allowlist**; it fails _closed_ (sponsors nothing) if the base
  id is unset, so the allowlist is the authoritative backstop on what the gas key pays for.
  These must **also** be on the **Enoki dashboard** allowlist.
- `DATABASE_URL` — Postgres for the metadata index (optional locally; see above).
- `PUBLIC_BASE_URL` — public https origin for building `/p/<code>` and `/g/<code>` URLs.
- `PORT` (default `3001`), `CORS_ALLOWED_ORIGINS`, sponsorship caps
  (`SPONSORSHIP_DAILY_LIMIT_TX_COUNT`, `SPONSORSHIP_GLOBAL_DAILY_MAX`), faucet window envs.

## Notes

- **Durable** state (links, merchants, tills, gift-card codes) lives in Postgres;
  **ephemeral** state (sponsorship counts, faucet limits, telemetry) is in-memory and
  resets on restart — fine for a single-instance hackathon deployment.
- Input is validated with `zod`; body size is capped; a global rate limiter and a
  graceful SIGTERM/SIGINT drain are in place.
- A separate daily `npm run sweep` cron (see `../render.yaml`) drains active tills to
  their treasuries, signing with its own funded keypair (no sponsorship, no merchant key).
