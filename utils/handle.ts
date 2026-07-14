/** Brisk username/handle helpers. Kept in a dependency-free leaf module (like
 *  utils/address.ts) so the Send resolver and the username-setup screen can share
 *  it without an import cycle. A stored handle is bare + lowercase (e.g. `john123`);
 *  the user-facing alias is `john123@brisk`.
 *
 *  Rules (kept in lockstep with the backend validator in backend/src/server.ts):
 *   - 3–20 characters
 *   - lowercase letters, digits, and underscore only (no spaces/symbols/emoji)
 *   - must start with a letter (so it's never all-digits or address-like)
 *   - no trailing underscore, no consecutive underscores
 *   - not a reserved name (prevents impersonation / phishing, e.g. `support@brisk`)
 */

export const BRISK_DOMAIN = "@brisk";
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

const CHARSET_RE = /^[a-z0-9_]+$/;

/** Reserved handles — brand, support/impersonation, and confusing sentinels. */
export const RESERVED_HANDLES = new Set([
  "brisk",
  "admin",
  "administrator",
  "support",
  "help",
  "helpdesk",
  "root",
  "system",
  "official",
  "security",
  "team",
  "staff",
  "mod",
  "moderator",
  "contact",
  "info",
  "noreply",
  "no_reply",
  "payments",
  "payment",
  "wallet",
  "account",
  "null",
  "undefined",
  "me",
  "everyone",
]);

/** Strip a trailing `@brisk`, lowercase, and trim → the bare candidate (NOT
 *  validated — use `handleError`/`normalizeHandle` to validate). */
function toBare(input: string): string {
  let h = input.trim().toLowerCase();
  if (h.endsWith(BRISK_DOMAIN)) h = h.slice(0, -BRISK_DOMAIN.length);
  return h;
}

/** Human-readable reason the handle is invalid, or null when it's valid. Used by
 *  the setup + settings screens to give precise inline feedback. */
export function handleError(input: string): string | null {
  const h = toBare(input);
  if (h.length < HANDLE_MIN) return `At least ${HANDLE_MIN} characters.`;
  if (h.length > HANDLE_MAX) return `At most ${HANDLE_MAX} characters.`;
  if (!CHARSET_RE.test(h)) return "Only lowercase letters, numbers, and _ — no spaces or symbols.";
  if (!/^[a-z]/.test(h)) return "Must start with a letter.";
  if (h.endsWith("_")) return "Can't end with an underscore.";
  if (h.includes("__")) return "No consecutive underscores.";
  if (RESERVED_HANDLES.has(h)) return "That username is reserved.";
  return null;
}

/** The normalized bare handle, or null if it violates any rule. */
export function normalizeHandle(input: string): string | null {
  return handleError(input) === null ? toBare(input) : null;
}

/** The user-facing alias for a bare handle. */
export function formatAlias(handle: string): string {
  return `${handle}${BRISK_DOMAIN}`;
}

/** Cheap branch check for the Send resolver: does this look like a Brisk handle
 *  attempt (handle-ish charset, not an address / `.sui`)? Lenient — the resolver
 *  validates and the backend decides existence. */
export function isBriskHandle(text: string): boolean {
  return CHARSET_RE.test(toBare(text));
}
