# Marketing prep

Submission-form-ready copy. Paste these into the hackathon form fields without editing.

## Tagline (max 60 chars)

Enforced DeepBook composability — bet + asserted spot fill, 1 tx.

## One-liner

Fathom is a mobile-first prediction market where DeepBook is load-bearing, not decorative: every Smart Bet swipe mints a Predict position AND trades on the DeepBook orderbook in one sponsored PTB, with **Fathom's own Move package asserting the fill on-chain** (no fill, no bet) — plus real CLOB maker orders — all behind zkLogin + Enoki so the user signs once and pays no gas.

## Five-bullet pitch

- **Enforced DeepBook composability in one digest** — Smart Bet swipes submit a single sponsored PTB calling `predict::mint`, `deepbook::pool::swap_exact_base_for_quote<SUI, DBUSDC>`, and Fathom's own `fathom_router::assert_and_record`, which asserts the orderbook actually filled a slippage floor (aborting otherwise) and emits a linking event. Plus a real maker-order panel that rests + cancels limit orders on the CLOB. Not a no-op — on-chain-enforced.
- **Zero wallet friction** — Google sign-in with **zkLogin**, sponsored execution via **Enoki**. Users keep self-custody of their ephemeral key; no seed phrases, no gas approvals.
- **Real revenue model, no hidden fees** — Fathom skims a transparent 1% fee on winning payouts inside the redeem PTB and itemises Gross → Fee → Net in the claim modal. We only earn when you win.
- **Dual-sided economy** — the Earn tab funds the same DeepBook Predict vault that pays winning swipes. PLP shares, live 7-day APY, on-chain `available_withdrawal` pre-check.
- **DeepBook utility surface** — Profile tab includes a standalone DeepBook swap panel (SUI ↔ DBUSDC, sponsored). Real orderbook usage outside of the prediction flow.

## Demo video

_(Paste Loom or YouTube unlisted URL here once recorded — see `docs/demo-script.md`.)_

## Screenshots

Captured against the bundled release APK in demo mode. Drop into `assets/screenshots/`:

- `welcome.png` — Welcome screen with stagger animation mid-frame.
- `swipe.png` — Swipe deck showing a binary card mid-drag with the YES overlay.
- `claim.png` — Claim celebration modal with "+$X.XX dUSDC".
- `earn.png` — Earn tab showing TVL, share price, 7-day APY, and the user's PLP position.

## Links

- README: [`README.md`](../README.md)
- Architecture + technical detail: [`TECHNICAL_OVERVIEW.md`](../TECHNICAL_OVERVIEW.md)
- Demo script (pre-recording checklist + tap-by-tap): [`docs/demo-script.md`](demo-script.md)
- Range-mode product spec: [`docs/range-markets.md`](range-markets.md)
- Release APK build flow: [`docs/build-android.md`](build-android.md)
