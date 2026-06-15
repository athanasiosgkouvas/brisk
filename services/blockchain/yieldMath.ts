import { microsToUsd } from "@/services/blockchain/paymentTx";

/**
 * Yield math — the single client-side mirror of the on-chain accrual, used for
 * the live-ticking counter and projections. The on-chain `exchange_rate` grows at
 * the supplier-NET rate (gross APY × (1 − reserve factor)) and is linear since the
 * last accrual, so interpolating the displayed value the same way matches
 * `current_value` between refreshes (we re-sync to the chain on every refresh).
 */

export const MS_PER_YEAR = 31_536_000_000;
const MS_PER_DAY = 86_400_000;
const BPS = 10_000;

/** US national-average savings APY (~0.42%), for the "vs a bank" comparison. */
export const NATIONAL_AVG_APY_BPS = 42;

/** Supplier net APY after the protocol reserve factor: gross × (1 − rf). */
export function netApyBps(grossApyBps: number, reserveFactorBps: number): number {
  return Math.floor((grossApyBps * (BPS - reserveFactorBps)) / BPS);
}

/** Interest accrued on `baseMicros` over `elapsedMs` at `apyBps` (linear). */
export function accruedMicros(baseMicros: number, apyBps: number, elapsedMs: number): number {
  if (baseMicros <= 0 || apyBps <= 0 || elapsedMs <= 0) return 0;
  return (baseMicros * apyBps * elapsedMs) / (BPS * MS_PER_YEAR);
}

/** Projected earnings per day on `baseMicros` at `apyBps`. */
export function perDayMicros(baseMicros: number, apyBps: number): number {
  return accruedMicros(baseMicros, apyBps, MS_PER_DAY);
}

/** Projected earnings per year on `baseMicros` at `apyBps`. */
export function perYearMicros(baseMicros: number, apyBps: number): number {
  return (baseMicros * apyBps) / BPS;
}

/** APY as a display string, e.g. 900 → "9%", 925 → "9.25%". */
export function formatApy(apyBps: number): string {
  const pct = apyBps / 100;
  return `${Number.isInteger(pct) ? pct.toString() : pct.toFixed(2)}%`;
}

/**
 * Like formatUsd but with extra decimal places so the live earned counter shows
 * sub-cent motion (cents alone barely move at single-digit APY on small balances).
 */
export function formatUsdPrecise(micros: number, dp = 4): string {
  const [int, dec] = microsToUsd(micros).toFixed(dp).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${grouped}.${dec}`;
}
