import { formatUsd, type ResolvedLink } from "./api";
import { CONFIG } from "./config";

const root = (): HTMLElement => document.getElementById("app")!;

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function shell(inner: string): void {
  root().innerHTML = `<main class="card">${inner}</main>`;
}

export function renderLoading(message = "Loading…"): void {
  shell(
    `<div class="spinner" aria-hidden="true"></div><p class="muted">${escapeHtml(message)}</p>`,
  );
}

export function renderReview(
  inv: ResolvedLink,
  code: string,
  handlers: { onPay: () => void },
): void {
  shell(`
    <div class="label">Payment request</div>
    <div class="amt">${formatUsd(inv.amountMicros)}</div>
    <div class="merchant">to ${escapeHtml(inv.merchant)}</div>
    <button id="pay" class="btn primary">Pay with Google</button>
    <a class="btn ghost" href="brisk://pay?code=${encodeURIComponent(code)}">Open in the Brisk app</a>
    <p class="fine">Sign in with Google to authorize a one-time USDC payment. No gas fees, powered by Sui zkLogin.</p>
  `);
  document.getElementById("pay")!.addEventListener("click", handlers.onPay);
}

export function renderPaying(inv: ResolvedLink): void {
  shell(`
    <div class="label">Paying</div>
    <div class="amt">${formatUsd(inv.amountMicros)}</div>
    <div class="merchant">to ${escapeHtml(inv.merchant)}</div>
    <div class="spinner" aria-hidden="true"></div>
    <p class="muted">Settling on Sui…</p>
  `);
}

export function renderPaid(inv: ResolvedLink, digest: string): void {
  const explorer = `https://suiscan.xyz/${CONFIG.suiNetwork}/tx/${encodeURIComponent(digest)}`;
  shell(`
    <div class="check">✓</div>
    <div class="label">Paid</div>
    <div class="amt">${formatUsd(inv.amountMicros)}</div>
    <div class="merchant">to ${escapeHtml(inv.merchant)}</div>
    <p class="fine">Settled on Sui in seconds — zero gas.</p>
    <a class="digest" href="${explorer}" target="_blank" rel="noopener">View transaction ↗</a>
  `);
}

export function renderMessage(title: string, sub: string, emoji = "🔗"): void {
  shell(
    `<div class="glyph">${emoji}</div><h2>${escapeHtml(title)}</h2><p class="muted">${escapeHtml(sub)}</p>`,
  );
}

export function renderError(message: string, onRetry?: () => void): void {
  shell(`
    <div class="glyph">⚠️</div>
    <h2>Something went wrong</h2>
    <p class="muted">${escapeHtml(message)}</p>
    ${onRetry ? '<button id="retry" class="btn primary">Try again</button>' : ""}
  `);
  if (onRetry) document.getElementById("retry")!.addEventListener("click", onRetry);
}
