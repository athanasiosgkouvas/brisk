# Deploying the Brisk backend (Render) + wiring the app

The app's only server dependency is the **Enoki sponsor relay** in `backend/`
(`/api/sponsor`, `/api/execute`, `/auth/callback`, `/health`, …). For judges to
use the app it must run at a stable public URL instead of a local ngrok tunnel.

## 1. Push the repo to GitHub

Render deploys from a connected Git repo. Secrets are gitignored (`.env`,
`backend/.env`, `google-services.json`), so the repo is safe to push.

```bash
git remote add origin https://github.com/<you>/brisk.git
git push -u origin main
```

## 2. Deploy on Render (Blueprint)

The repo root has [`render.yaml`](../render.yaml) describing the service
(`rootDir: backend`, build `npm install --include=dev && npm run build`, start
`npm start`, health check `/health`, Node 22).

1. Render dashboard → **New + → Blueprint** → pick the repo → **Apply**.
2. When prompted, paste **`ENOKI_PRIVATE_KEY`** (the Enoki **secret** key — same
   value as `backend/.env`; it's `sync:false`, never committed).
3. Wait for the build → you get a URL like **`https://brisk-backend.onrender.com`**.
4. Sanity check: `curl https://brisk-backend.onrender.com/health` → `{"status":"ok"}`.

> **Free-tier cold starts.** Free Render services sleep after ~15 min idle and
> take ~30–60 s to wake, which can make the first tap during judging feel stuck.
> Either upgrade to the **Starter ($7/mo)** plan, or keep it warm with a free
> uptime pinger (e.g. cron-job.org / UptimeRobot hitting `/health` every ~10 min).

## 3. Whitelist the new OAuth redirect (Google Cloud)

The native zkLogin redirect is `${EXPO_PUBLIC_BACKEND_URL}/auth/callback`. In
**Google Cloud Console → APIs & Services → Credentials → the OAuth 2.0 Web
Client** (the `EXPO_PUBLIC_GOOGLE_CLIENT_ID`), add to **Authorized redirect URIs**:

```
https://brisk-backend.onrender.com/auth/callback
```

(Keep the ngrok one too if you still dev locally.) Without this, Google rejects sign-in.

## 4. Point the app at Render + rebuild

`EXPO_PUBLIC_*` vars are baked into the JS bundle at build time, so the app must
be rebuilt after changing them.

```bash
# .env (frontend)
EXPO_PUBLIC_BACKEND_URL=https://brisk-backend.onrender.com
```

Then rebuild the distributable APK and re-upload to Firebase App Distribution:

```bash
cd android && ./gradlew assembleRelease
firebase appdistribution:distribute \
  app/build/outputs/apk/release/app-release.apk \
  --app 1:361814719717:android:4aa1cf479224beaf87e80c --groups judges
```

## What does NOT change

- **Enoki** doesn't care where the relay runs — no dashboard change for the move
  (the gas-pool / allowed-targets config stays as is).
- The on-chain package/pool, USDC type, and the app's Enoki **public** key are
  unchanged.
