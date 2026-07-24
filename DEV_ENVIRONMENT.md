# Brisk — Dev environment (Render)

A **develop**-tracked staging stack that mirrors prod so we can test risky flows
(currently the Coinbase onramp) without touching the live `main` services.

> **render.yaml is not used.** Every Render service and env var below is created
> **by hand in the Render dashboard**. render.yaml in this repo is documentation
> only and is never applied.

## Topology

| Purpose          | Prod (tracks `main`) | Dev (tracks `develop`)  |
| ---------------- | -------------------- | ----------------------- |
| Backend + webpay | `brisk-backend`      | **`brisk-backend-dev`** |
| Postgres         | `brisk-db`           | **`brisk-db-dev`**      |
| Marketing site   | `brisk-site`         | **`brisk-site-dev`**    |
| Sweep cron       | `brisk-sweep`        | _(not created for dev)_ |

The webpay browser pay app is **served by the backend at `/pay`** — so
`brisk-backend-dev` is both the API and the "dev web" pay flow; no separate
webpay service is needed.

Branch model: **`develop` → dev**, **`main` → prod**. Feature branches merge into
`develop` first; only reviewed work is fast-forwarded to `main`.

---

## One-time setup (Render dashboard)

Do these in order — the backend's URL-dependent env vars need the service URL,
which Render only assigns after the service exists.

### 1. `brisk-db-dev` — Postgres (Free)

- New → Postgres. Name `brisk-db-dev`, database name `brisk`, Postgres 16, **Free**.
- Copy its **Internal Connection String** (used as `DATABASE_URL` below).

### 2. `brisk-backend-dev` — Node web service

- New → Web Service → this repo → **Branch: `develop`**.
- Root directory: `backend`
- Build command (same as prod — builds webpay then the backend):
  ```
  cd ../webpay && npm install --include=dev && npm run build && cd ../backend && npm install --include=dev && npm run build
  ```
- Start command: `npm start`
- Health check path: `/health`
- Auto-Deploy: **On** (deploys on every push to `develop`).
- Add the env vars from the table below, then **Save & deploy**.
- After it goes live, note the URL (e.g. `https://brisk-backend-dev-xxxx.onrender.com`)
  and set the URL-dependent vars (marked ⟳) to it, then redeploy.

### 3. `brisk-site-dev` — static marketing site

- New → Static Site → this repo → **Branch: `develop`**.
- Root directory: `web`, build command empty, publish path `.`, Auto-Deploy On.
- SPA rewrite: `/*` → `/index.html` (same as prod `brisk-site`).

### 4. Point the dev app build at dev (for a dev APK)

When building an APK to test against dev, set `EXPO_PUBLIC_BACKEND_URL` to the
`brisk-backend-dev` URL (see root `.env.example`). Everything else in the app is
env-flagged the same as prod.

---

## `brisk-backend-dev` env vars

Set in the Render dashboard → the service → Environment. **⟳ = set to the dev
backend's own URL after step 2.** **🔒 = secret, paste by hand.**

| Key                                | Value                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `NODE_VERSION`                     | `22`                                                                             |
| `ENOKI_PRIVATE_KEY` 🔒             | Enoki **private** key (testnet — can reuse the prod one)                         |
| `SPONSORSHIP_DAILY_LIMIT_TX_COUNT` | `100`                                                                            |
| `BRISK_PACKAGE_ID`                 | `0xcbd54ab52fad4110fdad2d9fd8e92e84dd87db436f2b608cc47819f7d4fd03cc`             |
| `BRISK_RECORD_PKG`                 | `0x3ac880a1eab2763fc1b92376a88e1913d0bc4dbf02023a3c0a0321d16c2837cb`             |
| `BRISK_TILL_PKG`                   | `0xe96ec7f8b0633204af0a4060cc10adeac019641d1ec71096f0567071885b1e35`             |
| `BRISK_GIFT_CARD_PKG`              | `0xc90ebfadb58657be143a09342d575223681587de6eb87efe006d720edc0b6a86`             |
| `DATABASE_URL` 🔒                  | Internal connection string of `brisk-db-dev`                                     |
| `PUBLIC_BASE_URL` ⟳                | the dev backend URL (e.g. `https://brisk-backend-dev-xxxx.onrender.com`)         |
| `VITE_BACKEND_URL` ⟳               | same dev backend URL                                                             |
| `VITE_WEB_REDIRECT_URI` ⟳          | `<dev backend URL>/pay/`                                                         |
| `VITE_SUI_NETWORK`                 | `testnet`                                                                        |
| `VITE_USDC_TYPE`                   | `0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC` |
| `VITE_ENOKI_API_KEY` 🔒            | Enoki **public** key (same as app's `EXPO_PUBLIC_ENOKI_API_KEY`)                 |
| `VITE_GOOGLE_CLIENT_ID` 🔒         | Google **Web** OAuth client id                                                   |
| `VITE_COINBASE_ENABLED`            | `true`                                                                           |
| **Coinbase onramp**                |                                                                                  |
| `CDP_ENV`                          | `sandbox`                                                                        |
| `CDP_API_KEY_ID` 🔒                | CDP onramp **Secret** API key id                                                 |
| `CDP_API_KEY_SECRET` 🔒            | CDP onramp **Secret** API key secret                                             |
| `CDP_WEBHOOK_SECRET` 🔒            | (later) webhook signing secret from the CDP CLI                                  |

> The onramp redirects (`COINBASE_ONRAMP_REDIRECT`, `COINBASE_ONRAMP_WEB_REDIRECT`)
> default to `PUBLIC_BASE_URL` + `/onramp/return` and `/pay/onramp-return`, so you
> normally don't set them. Override only if the return path differs.

### Google OAuth (Web client)

Add the dev backend origin as an **Authorized JavaScript origin** and
`<dev backend URL>/pay/` + `<dev backend URL>/auth/callback` as **Authorized
redirect URIs** on the Google Web client — same as prod, for the dev URL.

### CDP Onramp allowlist (the returnTo gate)

In the CDP portal, on the **project that owns your onramp Secret API key**:
**Payments → Onramp & Offramp** → add the dev backend domain
(`https://brisk-backend-dev-xxxx.onrender.com`) and `brisk://onramp-return`.
Without this, the hosted flow rejects the return with `Invalid returnTo param`.
`CDP_ENV=sandbox` only switches the widget host to `pay-sandbox.coinbase.com`;
tokens are still minted with the same key against `api.developer.coinbase.com`.

---

## Verify the dev deploy

1. Push to `develop` → `brisk-backend-dev` auto-deploys.
2. `GET <dev backend URL>/health` → `{"status":"ok"}`.
3. `POST <dev backend URL>/api/onramp/session` with `{"address":"0x…","amountUsd":50}`
   → `{ "url": "https://pay-sandbox.coinbase.com/buy/select-asset?…" }`.
4. Open that URL → the Coinbase **sandbox** sheet loads on **Sui / USDC** (test
   card `4242 4242 4242 4242`); on completion it returns via
   `<dev backend URL>/onramp/return` → `brisk://onramp-return`.
5. Build a dev APK with `EXPO_PUBLIC_BACKEND_URL=<dev backend URL>` and tap
   **Add funds** to exercise the full deep-link return + balance poll.
