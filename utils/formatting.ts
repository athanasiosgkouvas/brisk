export function formatAddress(address: string, start = 6, end = 4): string {
  if (!address) return "";
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

export function formatDusdc(amountMicro: number): string {
  return `${(amountMicro / 1_000_000).toFixed(2)} dUSDC`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatTimeLeft(expiryMs: number, nowMs = Date.now()): string {
  const delta = Math.max(0, expiryMs - nowMs);
  const days = Math.floor(delta / 86_400_000);
  const hours = Math.floor((delta % 86_400_000) / 3_600_000);
  const minutes = Math.floor((delta % 3_600_000) / 60_000);
  const seconds = Math.floor((delta % 60_000) / 1_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
