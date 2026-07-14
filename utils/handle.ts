/** Brisk username/handle helpers. Kept in a dependency-free leaf module (like
 *  utils/address.ts) so the Send resolver and the username-setup screen can share
 *  it without an import cycle. A stored handle is bare + lowercase (e.g. `john123`);
 *  the user-facing alias is `john123@brisk`. */

export const BRISK_DOMAIN = "@brisk";

/** 3–20 chars: lowercase letters, digits, underscore. */
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

/** Normalize free text to a bare handle (strip a trailing `@brisk`, lowercase,
 *  trim). Returns null when it isn't a valid handle. */
export function normalizeHandle(input: string): string | null {
  let h = input.trim().toLowerCase();
  if (h.endsWith(BRISK_DOMAIN)) h = h.slice(0, -BRISK_DOMAIN.length);
  return HANDLE_RE.test(h) ? h : null;
}

/** The user-facing alias for a bare handle. */
export function formatAlias(handle: string): string {
  return `${handle}${BRISK_DOMAIN}`;
}

/** Cheap branch check for the Send resolver: does this look like a Brisk handle
 *  or alias (with or without the `@brisk` suffix)? */
export function isBriskHandle(text: string): boolean {
  return normalizeHandle(text) !== null;
}
