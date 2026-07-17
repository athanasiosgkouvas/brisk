import "./styles.css";

import { formatUsd, LinkError, resolveLink, type ResolvedLink } from "./api";
import { completeLoginFromRedirect, loadSession, startLogin, type WebSession } from "./auth";
import { payLink } from "./tx";
import * as ui from "./ui";

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The link code from the path — served at `/pay/<code>` (Vite base `/pay/`). */
function codeFromPath(): string | null {
  const m = window.location.pathname.match(/\/pay\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

function alreadyPaid(inv: ResolvedLink): boolean {
  return inv.status === "paid" && !inv.reusable;
}

async function payNow(code: string, inv: ResolvedLink, session: WebSession): Promise<void> {
  ui.renderPaying(inv);
  try {
    const digest = await payLink(session, inv, code);
    ui.renderPaid(inv, digest);
  } catch (e) {
    ui.renderError(msg(e), () => void payNow(code, inv, session));
  }
}

async function resolveOrExplain(code: string): Promise<ResolvedLink | null> {
  try {
    return await resolveLink(code);
  } catch (e) {
    if (e instanceof LinkError && e.status === 410) {
      ui.renderMessage(
        "Link no longer valid",
        "This request has expired or was canceled. Ask the merchant for a fresh one.",
        "⌛",
      );
    } else {
      ui.renderMessage("Link not found", "This payment link is invalid.", "🔗");
    }
    return null;
  }
}

async function showReview(code: string): Promise<void> {
  ui.renderLoading("Loading request…");
  const inv = await resolveOrExplain(code);
  if (!inv) return;
  if (alreadyPaid(inv)) {
    ui.renderMessage(
      "Already paid",
      `This request for ${formatUsd(inv.amountMicros)} has been paid.`,
      "✓",
    );
    return;
  }
  ui.renderReview(inv, code, {
    onPay: () => {
      const session = loadSession();
      if (session) void payNow(code, inv, session);
      else void startLogin(code); // redirects to Google, resumes in boot()
    },
  });
}

async function boot(): Promise<void> {
  ui.renderLoading();

  // 1) Returning from Google? Finish zkLogin, then pay the stashed code.
  try {
    const resumed = await completeLoginFromRedirect();
    if (resumed) {
      const inv = await resolveOrExplain(resumed.code);
      if (!inv) return;
      if (alreadyPaid(inv)) {
        ui.renderMessage(
          "Already paid",
          `This request for ${formatUsd(inv.amountMicros)} has been paid.`,
          "✓",
        );
        return;
      }
      history.replaceState(null, "", `/pay/${resumed.code}`);
      await payNow(resumed.code, inv, resumed.session);
      return;
    }
  } catch (e) {
    ui.renderError(msg(e));
    return;
  }

  // 2) Normal load.
  const code = codeFromPath();
  if (!code) {
    ui.renderMessage(
      "No payment request",
      "Open a Brisk payment link or scan a Brisk QR code to pay.",
      "💳",
    );
    return;
  }
  await showReview(code);
}

void boot();
