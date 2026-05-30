# fathom-backend

Express server that proxies Enoki sponsorship/execution, runs the Sui-event indexer, and serves indexer-derived user/leaderboard/vault data to the app.

## Run

```bash
npm install
cp .env.example .env       # fill ENOKI_PRIVATE_KEY at minimum
npm run dev
```

## Indexer

The indexer polls `suix_queryEvents` every ~2.5s and persists a SQLite cache at `data/fathom.sqlite` (path overridable via `FATHOM_DB_PATH`). The chain is the source of truth — the SQLite store is rebuildable.

Disable boot:

```bash
INDEXER_ENABLED=false npm run dev
```

Operational scripts:

```bash
npm run indexer:reset      # drop all tables and rerun migrations
npm run indexer:replay     # clear cursors + derived rows, refill on next boot
```

Switching networks (testnet ↔ mainnet) is a different DB filename:

```bash
FATHOM_DB_PATH=./data/mainnet.sqlite npm run dev
```

## Sponsorship cap

Each sponsored tx is logged to `sponsorship_log`. `/api/sponsor` rejects (HTTP 429) when the sender has used more than `SPONSORSHIP_DAILY_LIMIT_TX_COUNT` sponsored txs in the trailing 24h.

## Keeper

The keeper reconciles the indexer-aggregated exposure against `vault.predict_exposure` on chain. When `FATHOM_KEEPER_PRIVATE_KEY` is set, divergences > `FATHOM_KEEPER_DIVERGENCE_MIN_MICRO` (default 1 dUSDC) trigger a signed `vault::keeper_update_exposure` tx, throttled by `FATHOM_KEEPER_COOLDOWN_MS`. Without a key, the keeper logs divergences only ("observe-only").

`GET /api/vault/keeper/status` exposes `lastSubmitMs`, `lastSubmitDigest`, `lastSubmitError`, and `observerOnly` for debugging.

## Observability

- `GET /health` — returns HTTP 503 if the poller hasn't ticked or any cursor hasn't advanced in `INDEXER_STALE_ALARM_MS` (default 30s). Body contains per-filter cursor ages.
- `GET /api/admin/stats` — position counts, oracle/vault snapshot counts, sponsorship log size, keeper status, oldest unsettled position.
- `GET /api/themes/active` — curated weekly bundles.

## Tests

```bash
npm test       # builds then runs tests against dist/
```

Tests set `INDEXER_ENABLED=false` so the poller does not hit live RPC.
