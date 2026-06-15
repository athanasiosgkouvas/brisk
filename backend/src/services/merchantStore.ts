import { pool } from "../db.js";

// Merchant directory: maps an on-chain Merchant (and its owner address) to a
// human business name + URL-safe slug, so the app renders names instead of 0x
// addresses everywhere a merchant appears.

export type MerchantProfile = {
  merchantId: string;
  ownerAddr: string;
  businessName: string;
  slug: string;
};

function requirePool() {
  if (!pool) throw new Error("Merchant directory is unavailable (DATABASE_URL not configured)");
  return pool;
}

/** Lowercase, hyphenated slug from a business name + a stable suffix from the
 *  merchant id, so two "Acme Coffee" merchants never collide. */
function makeSlug(name: string, merchantId: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const suffix = merchantId.replace(/^0x/, "").slice(-6);
  return `${base || "merchant"}-${suffix}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProfile(r: any): MerchantProfile {
  return {
    merchantId: r.merchant_id,
    ownerAddr: r.owner_addr,
    businessName: r.business_name,
    slug: r.slug,
  };
}

const SELECT_COLS = `merchant_id, owner_addr, business_name, slug`;

/**
 * Create or update a merchant's profile. The caller must have already verified
 * `ownerAddr` controls `merchantId` (endpoint owner-claim gate). On update, only
 * the row whose owner_addr matches is touched.
 */
export async function upsertProfile(input: {
  merchantId: string;
  ownerAddr: string;
  businessName: string;
}): Promise<MerchantProfile> {
  const db = requirePool();
  const slug = makeSlug(input.businessName, input.merchantId);
  const { rows } = await db.query(
    `INSERT INTO merchant_profiles (merchant_id, owner_addr, business_name, slug)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (merchant_id) DO UPDATE
       SET business_name = EXCLUDED.business_name,
           slug          = EXCLUDED.slug,
           updated_at    = now()
     RETURNING ${SELECT_COLS}`,
    [input.merchantId, input.ownerAddr, input.businessName.trim(), slug],
  );
  return rowToProfile(rows[0]);
}

export async function getProfileByMerchantId(merchantId: string): Promise<MerchantProfile | null> {
  const db = requirePool();
  const { rows } = await db.query(
    `SELECT ${SELECT_COLS} FROM merchant_profiles WHERE merchant_id = $1`,
    [merchantId],
  );
  return rows[0] ? rowToProfile(rows[0]) : null;
}

export async function getProfileByOwner(ownerAddr: string): Promise<MerchantProfile | null> {
  const db = requirePool();
  const { rows } = await db.query(
    `SELECT ${SELECT_COLS} FROM merchant_profiles WHERE owner_addr = $1`,
    [ownerAddr],
  );
  return rows[0] ? rowToProfile(rows[0]) : null;
}

/** Search the directory by business name (for the customer "buy a gift card"
 *  merchant picker). Case-insensitive substring match, capped. */
export async function searchByName(query: string, limit = 20): Promise<MerchantProfile[]> {
  const db = requirePool();
  const q = query.trim();
  if (q.length < 1) return [];
  const { rows } = await db.query(
    `SELECT ${SELECT_COLS} FROM merchant_profiles
       WHERE business_name ILIKE $1 ORDER BY business_name ASC LIMIT $2`,
    [`%${q}%`, limit],
  );
  return rows.map(rowToProfile);
}

/** Batch lookup for name rendering: resolve any of the given merchant ids and/or
 *  owner addresses to profiles. */
export async function lookupProfiles(
  merchantIds: string[],
  addrs: string[],
): Promise<MerchantProfile[]> {
  const db = requirePool();
  if (merchantIds.length === 0 && addrs.length === 0) return [];
  const { rows } = await db.query(
    `SELECT ${SELECT_COLS} FROM merchant_profiles
       WHERE merchant_id = ANY($1::text[]) OR owner_addr = ANY($2::text[])`,
    [merchantIds, addrs],
  );
  return rows.map(rowToProfile);
}
