# brisk-backend

A thin Express relay that lets the Brisk app run **Enoki-sponsored transactions**
without ever exposing the Enoki private key to the client, plus a few support
endpoints. It holds no custody and stores no durable state — the chain is the
source of truth.

## Run

```bash
npm install
cp .env.example .env       # set ENOKI_PRIVATE_KEY (+ optional CORS/limits)
npm run dev                # tsx watch on :3001
```

Expose it to the device with your tunnel of choice (e.g. ngrok) and point the
app's `EXPO_PUBLIC_BACKEND_URL` at the public URL.

## Endpoints

| Method | Path                                  | Purpose                                                                                                                     |
| ------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/sponsor`                        | Wrap a `transactionKindBytes` PTB into an Enoki-sponsored tx; returns `{ bytes, digest }` to sign.                          |
| POST   | `/api/execute`                        | Submit the signed sponsored tx (`{ digest, signature }`) via Enoki; returns the on-chain digest.                            |
| GET    | `/api/user/:address/sponsorship`      | Best-effort sponsorship usage for an address (per-address daily cap).                                                       |
| GET    | `/auth/callback`                      | OAuth relay: bounces the Google `id_token` to the `brisk://oauth` deep link (custom schemes can't be Google redirect URIs). |
| POST   | `/api/faucet/request`                 | Rate-limited redirect to a public testnet USDC faucet.                                                                      |
| POST   | `/api/analytics/track`, `/api/errors` | In-memory dev telemetry (capped, reset on restart).                                                                         |
| GET    | `/health`                             | Liveness probe.                                                                                                             |

The app's two-call sponsorship dance lives in `services/blockchain/sponsoredExec.ts`:
`/api/sponsor` → sign locally with the zkLogin ephemeral key → `/api/execute`.
A merchant payment is one atomic sponsored PTB (`payment_receipt::pay` — moves
the USDC + mints the receipt); a plain transfer/Send is protocol-level gasless
and goes straight to the fullnode (no relay).

## Configuration

- `ENOKI_PRIVATE_KEY` — **required**; the Enoki secret key (never sent to clients).
- `PORT` (default `3001`), `CORS_ALLOWED_ORIGINS`, rate-limit + faucet window envs.
- Per-address sponsorship cap is in-memory (best-effort). The real backstop is
  the **Enoki dashboard**: restrict sponsorship to the Brisk package's Move
  targets and cap the gas budget before exposing the relay publicly.

## Notes

- All state (sponsorship counts, faucet limits, telemetry) is in-memory and
  resets on restart — fine for a single-instance hackathon demo.
- Input is validated with `zod`; body size is capped; a global rate limiter and
  graceful SIGTERM/SIGINT drain are in place.
