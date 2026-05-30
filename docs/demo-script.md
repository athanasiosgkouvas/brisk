# Demo script

A 60-second walkthrough that exercises every on-camera surface of Fathom. Doubles as a manual QA script — run it before tagging a build.

The headline pitch for the Sui Overflow 2026 **DeepBook track** is _enforced, on-chain DeepBook composability_: every Smart Bet swipe submits a single sponsored PTB that mints a Predict position, trades on `deepbook::pool::swap_exact_base_for_quote<SUI, DBUSDC>`, and calls **Fathom's own** `fathom_router::assert_and_record`, which asserts the orderbook actually filled (aborting the whole tx otherwise) and emits a `HedgedSwapExecuted` event. Plus a real **maker-order** panel that rests limit orders on the CLOB, and a live DeepBook ticker.

## Pre-flight

Run these on the recording device before opening the camera:

- App is installed in **release** mode from a fresh APK build (`docs/build-android.md`).
- Pick a recording mode:
  - **Demo mode** (`EXPO_PUBLIC_DEMO_MODE=true`) — deterministic markets, simulated settlement, mock Earn state. Safest for a video.
  - **Live mode** (demo flag off) — real testnet flow. Required if the voice-over claims the digest will resolve on SuiVision.
- Backend is reachable at the configured `EXPO_PUBLIC_BACKEND_URL` (ngrok URL on the same Wi-Fi).
- Backend health endpoint returns 200:

  ```bash
  curl -fsS "$EXPO_PUBLIC_BACKEND_URL/health" | jq '.status'
  # expect: "ok"
  ```

- For the **enforced spot leg to actually fill on camera**, the recording account must hold **≥ ~3 SUI** AND some **DEEP** (the SUI/DBUSDC book needs ≥ ~1 SUI size and charges a DEEP fill fee; with zero DEEP the book returns a zero fill and Smart Bet honestly falls back to a plain mint with a visible note). Top up SUI from the testnet faucet and DEEP from the DeepBook DEEP treasury before recording. If you only want to show the fallback, no DEEP is needed — the note ("Spot leg skipped — needs DEEP…") is itself an honest beat.
- Phone is on Do Not Disturb so notification haptics don't interrupt the audio track.
- Sign out from any existing session so the recording starts on the Welcome screen.

## Six-beat shot list

Total target: 55-70 seconds. The new Smart Bet + DeepBook beats add ~10 seconds; trim Beat 5 if the cut runs long.

### Beat 1 — Welcome (0:00 – 0:06)

1. Launch the app. The Welcome screen should fade in with the **Swipe. Bet. Win.** stagger animation and the trust chips sliding up.
2. Tap **Continue with Google**. Light haptic on press; Google sign-in custom-tab opens.
3. Complete Google sign-in. App lands on the **Swipe** tab in under 3 seconds. No wallet pop-ups, no gas approvals.

### Beat 2 — Smart Bet on (0:06 – 0:18) — _NEW headline beat_

1. Note the live **DeepBook SUI/DBUSDC ticker** above the deck (mid + spread, "live"). Tap the **DeepBook Smart Bet** chip's **Setup**.
2. In the sheet, tap **On**, then tap **1 SUI** as the per-swipe spot-leg size (the book's min fill). With DEEP held, the live quote populates (~"1 SUI → ~0.90 DBUSDC") and the sheet shows the enforced 2% floor. Tap **Done**.
3. Back on the deck, the chip reads "Predict mint + 1 SUI → ~0.90 DBUSDC, enforced atomically".
4. Swipe **right** on the first card. The sponsored PTB carries `predict::mint`, the DeepBook swap, and `fathom_router::assert_and_record`.
5. _Voice-over line:_ "One swipe, one signature — and our own Move package asserts on-chain that the DeepBook orderbook actually filled. No fill, no bet. You'll see `predict::mint`, `deepbook::pool::swap_exact_base_for_quote`, and `fathom_router::assert_and_record` in one digest."
6. _(If the wallet has no DEEP, the swipe instead shows the amber note "Spot leg skipped — needs DEEP…" and mints a plain position — an honest beat you can narrate as "never a silent no-op.")_

### Beat 3 — Win + Claim with take-rate visible (0:18 – 0:32)

1. Swipe **right** on the next two cards (no Smart Bet hedge needed; the toggle persists either way). Each swipe submits a sponsored PTB.
2. Wait for the first swiped position to settle. In demo mode this takes ~15 s; outcome is deterministic.
3. On a winning settlement: the **WinToast** slides down from the top with confetti. Tap the toast or jump to **Settings**.
4. Find the winning position and tap **Claim winnings**.
5. The **ClaimSuccessModal** appears with an _itemized payout_: **Gross → Fathom fee 1.00% → Net to wallet**. Linger here — this is the business-model proof point. Tap **Done**.

### Beat 4 — Earn with on-chain pre-checks (0:32 – 0:45)

1. Switch to the **Earn** tab. The vault state (TVL, share price, 7d APY) renders. New: balances and APY use shimmer skeletons while loading instead of a blank state.
2. Type `1` into the dUSDC deposit field. Tap **Deposit**.
3. Switch to **Withdraw**. Type `1`. Note the share-price preview line. If the on-chain `available_withdrawal` cap is tight, a defensive warning appears.

### Beat 5 — DeepBook maker order + swap (0:45 – 0:55) — _NEW DeepBook beat_

1. Switch to the **Profile** tab.
2. Scroll to the **DeepBook maker order** panel. Tap **Open order ticket**. Leave side on **Sell SUI (ask)**; the price prefills above the live mid (rests, won't fill). Size `1`. Tap **Place order** — the first one also creates your shared `BalanceManager`. A "resting on the book" line with the order id appears; tap **Cancel order** to pull it.
3. _Voice-over line:_ "This isn't just taking the book — we rest real maker liquidity on the DeepBook CLOB via a BalanceManager, then cancel it. Genuine orderbook participation."
4. _(Optional if time:)_ The **DeepBook swap** panel above does a one-tap sponsored SUI → DBUSDC market swap.

### Beat 6 — Closing (0:55 – 1:05)

1. Tap any recent digest from the position history. _If the voice-over references SuiVision_: cut to a pre-loaded SuiVision tab showing the Smart Bet digest's PTB inspector — `predict::predict::mint`, `deepbook::pool::swap_exact_base_for_quote`, and `fathom_router::router::assert_and_record` together in one digest.
2. End on the bullet list: _Enforced DeepBook composability · real CLOB maker orders · zkLogin · self-sustaining vault · we only earn when you win_.

## Manual-QA flag list

After the recording, walk through these without re-recording. All should succeed:

- Background the app for 60 seconds while a position is pending, then foreground it. Polling reconciles within ~1 second (AppState listener in `useSettlementPolling`).
- Open **Settings → Responsible gaming**, toggle **Pause trading** on. Navigate back to Swipe — the deck is replaced by a calm pause card. Toggle off, deck returns.
- Force-close the app and reopen. Welcome screen does **not** appear (session restore). Earn tab opens with cached vault state instantly.
- Run the **live-mode** (non-demo) walkthrough on the same APK: with Smart Bet OFF swipe one real binary market, claim, deposit $1 dUSDC into Earn, withdraw it. Then with Smart Bet ON (wallet funded with SUI **and** DEEP, size ≥ 1 SUI) swipe again and verify on SuiVision that the digest carries `predict::mint`, `deepbook::pool::swap_exact_base_for_quote`, and `fathom_router::assert_and_record`.
- Open the Profile tab: place a 1 SUI ask via the **maker-order** panel and cancel it (verify `OrderPlaced` then `OrderCanceled`); run a 0.05 SUI → DBUSDC market swap via the **swap** panel.
- Confirm the standalone capabilities also work headless via the probes: `npx tsx scripts/probe-router.ts` and `npx tsx scripts/probe-limit-order.ts`.

## When something goes wrong on camera

- If Google sign-in stalls, ensure the ngrok URL in `EXPO_PUBLIC_BACKEND_URL` is the **HTTPS** one and the `ngrok-skip-browser-warning` header is being sent by `/auth/callback`.
- If the swipe deck shows "Couldn't load markets", you forgot to set `EXPO_PUBLIC_DEMO_MODE=true` — kill and re-record (or accept live markets and adjust voice-over).
- If the Smart Bet chip shows "Pricing…" indefinitely, the testnet RPC is throwing on devInspect. The swipe still works — it falls back to a plain Predict mint and shows an amber `smartBetNote` explaining why (per `hooks/usePredict.ts`). This is intended, honest behaviour, not a silent no-op.
- If the DeepBook swap panel shows zero SUI balance after sign-in, top up the recording wallet from the Sui testnet faucet (`sui client faucet`) and refresh.
- If the Earn tab shows a spinner on first open, the vault state cache wasn't hydrated. Kill the app, reopen, and re-record.
