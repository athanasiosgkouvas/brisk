import { pool } from "../db.js";

// Merchant directory: maps an on-chain Merchant (and its owner address) to a
// human business name + URL-safe slug, so the app renders names instead of 0x
// addresses everywhere a merchant appears.

export type MerchantProfile = {
  merchantId: string;
  ownerAddr: string;
  businessName: string;
  slug: string;
  // Optional directory metadata (null until the merchant fills them in).
  vatId: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  logoUrl: string | null;
};

/** The optional metadata fields a caller may set on a profile. */
export type MerchantProfileFields = {
  vatId?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  category?: string | null;
  logoUrl?: string | null;
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
    vatId: r.vat_id ?? null,
    city: r.city ?? null,
    country: r.country ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    category: r.category ?? null,
    logoUrl: r.logo_url ?? null,
  };
}

const SELECT_COLS = `merchant_id, owner_addr, business_name, slug,
            vat_id, city, country, phone, email, category, logo_url`;

/**
 * Create or update a merchant's profile. The caller must have already verified
 * `ownerAddr` controls `merchantId` (endpoint owner-claim gate). On update, only
 * the row whose owner_addr matches is touched.
 */
export async function upsertProfile(
  input: {
    merchantId: string;
    ownerAddr: string;
    businessName: string;
  } & MerchantProfileFields,
): Promise<MerchantProfile> {
  const db = requirePool();
  const slug = makeSlug(input.businessName, input.merchantId);
  // Empty string → NULL (an explicit clear); trim otherwise.
  const nz = (v: string | null | undefined) => (v == null ? null : v.trim() || null);

  // Only optional fields the caller actually PROVIDED (key present, i.e. not
  // `undefined`) are written on update; omitted fields are preserved. This lets
  // a name-only rename keep the rest, while the details editor can clear a field
  // by sending "" (→ NULL). On first insert, omitted fields default to NULL.
  const optionalKeys = [
    "vatId",
    "city",
    "country",
    "phone",
    "email",
    "category",
    "logoUrl",
  ] as const;
  const colFor: Record<(typeof optionalKeys)[number], string> = {
    vatId: "vat_id",
    city: "city",
    country: "country",
    phone: "phone",
    email: "email",
    category: "category",
    logoUrl: "logo_url",
  };
  const provided = optionalKeys.filter((k) => input[k] !== undefined);

  const insertCols = ["merchant_id", "owner_addr", "business_name", "slug"];
  const values: (string | null)[] = [
    input.merchantId,
    input.ownerAddr,
    input.businessName.trim(),
    slug,
  ];
  for (const k of provided) {
    insertCols.push(colFor[k]);
    values.push(nz(input[k]));
  }
  const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
  const updateSet = [
    "business_name = EXCLUDED.business_name",
    "slug = EXCLUDED.slug",
    "updated_at = now()",
    ...provided.map((k) => `${colFor[k]} = EXCLUDED.${colFor[k]}`),
  ].join(", ");

  const { rows } = await db.query(
    `INSERT INTO merchant_profiles (${insertCols.join(", ")})
     VALUES (${placeholders})
     ON CONFLICT (merchant_id) DO UPDATE SET ${updateSet}
     RETURNING ${SELECT_COLS}`,
    values,
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

/** All merchants (newest-relevant browse), alphabetical, capped — powers the
 *  gift-card picker's "browse everything" state when no query is typed. */
export async function listAll(limit = 100): Promise<MerchantProfile[]> {
  const db = requirePool();
  const { rows } = await db.query(
    `SELECT ${SELECT_COLS} FROM merchant_profiles ORDER BY business_name ASC LIMIT $1`,
    [limit],
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

/**
 * Resolve till object addresses to their merchant's business profile, keyed by
 * the TILL address (merchantId + ownerAddr overwritten to the till id). Lets the
 * activity feed show the business name/logo for a payment INTO a till (business
 * context), while a direct transfer to a personal address stays the alias.
 */
export async function lookupTillBusinesses(addrs: string[]): Promise<MerchantProfile[]> {
  const db = requirePool();
  if (addrs.length === 0) return [];
  const { rows } = await db.query(
    `SELECT t.till_id AS merchant_id, t.till_id AS owner_addr,
            m.business_name, m.slug, m.vat_id, m.city, m.country, m.phone,
            m.email, m.category, m.logo_url
       FROM tills t JOIN merchant_profiles m ON m.merchant_id = t.merchant_id
      WHERE t.till_id = ANY($1::text[])`,
    [addrs],
  );
  return rows.map(rowToProfile);
}
