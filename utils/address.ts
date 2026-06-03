/** Sui address validation. Kept in a dependency-free leaf module so both the
 *  wallet/send path and the NFC invoice parser can validate addresses without
 *  creating an import cycle. */

/** Sui addresses are 0x + up to 64 hex chars. */
export function isValidSuiAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(addr.trim());
}
