import Database from "better-sqlite3";
import { existsSync } from "fs";
import path from "path";

export type PriceRow = {
  id: number;
  item: string;
  category: string;
  unit: string;
  price: number;
  currency: string;
  date: string;
  province: string;
  district: string;
  market: string;
};

export type Overview = {
  lastUpdated: string | null;
  totalItems: number;
  totalMarkets: number;
  averagePrice: number | null;
};

export type Filters = {
  provinces: { id: number; name: string; districts: { id: number; name: string }[] }[];
  items: { id: number; name: string; unit: string; category: string }[];
};

const externalDbPath = path.join(process.cwd(), "database", "food_price_kh.sqlite");
const fallbackDbPath = path.join(process.cwd(), "data", "food_prices.db");
const dbPath = existsSync(externalDbPath) ? externalDbPath : fallbackDbPath;

const db = new Database(dbPath);

const candidateTables = ["food_price_kh", "food_price_san"];

function resolveTableName() {
  for (const name of candidateTables) {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name) as
      | { name: string }
      | undefined;
    if (row) return row.name;
  }
  throw new Error(
    `Expected one of the tables (${candidateTables.join(", ")}) in ${dbPath}, but none were found. Place your SQLite file with that table in the database folder.`,
  );
}

const TABLE = resolveTableName();

export function getFilters(): Filters {
  const provinces = db
    .prepare(`SELECT DISTINCT admin1 AS name FROM ${TABLE} WHERE admin1 IS NOT NULL ORDER BY admin1`)
    .all() as { name: string }[];

  const districts = db
    .prepare(
      `SELECT DISTINCT admin1, admin2 FROM ${TABLE} WHERE admin1 IS NOT NULL AND admin2 IS NOT NULL ORDER BY admin1, admin2`,
    )
    .all() as { admin1: string; admin2: string }[];

  const items = db
    .prepare(
      `SELECT DISTINCT commodity AS name, unit, category, MIN(rowid) AS id FROM ${TABLE} WHERE commodity IS NOT NULL GROUP BY commodity, unit, category ORDER BY category, name`,
    )
    .all() as { id: number; name: string; unit: string; category: string }[];

  const provincesWithDistricts = provinces.map((p, idx) => ({
    id: idx + 1,
    name: p.name,
    districts: districts
      .filter((d) => d.admin1 === p.name)
      .map((d, dIdx) => ({ id: dIdx + 1, name: d.admin2 })),
  }));

  return { provinces: provincesWithDistricts, items };
}

/**
 * Get food items filtered by province and/or district
 * Returns only items that have price records in the specified location
 */
export function getItemsByLocation(params: {
  provinceId?: number;
  districtId?: number;
}): { id: number; name: string; unit: string; category: string }[] {
  const conditions: string[] = ["commodity IS NOT NULL"];
  const values: Record<string, unknown> = {};

  // Get province and district lookups
  const provinceLookup = db
    .prepare(`SELECT DISTINCT admin1 FROM ${TABLE} WHERE admin1 IS NOT NULL ORDER BY admin1`)
    .all() as { admin1: string }[];
  const districtLookup = db
    .prepare(`SELECT DISTINCT admin1, admin2 FROM ${TABLE} WHERE admin2 IS NOT NULL ORDER BY admin1, admin2`)
    .all() as { admin1: string; admin2: string }[];

  // Filter by province if specified
  if (params.provinceId) {
    const province = provinceLookup[params.provinceId - 1]?.admin1;
    if (province) {
      conditions.push("admin1 = @province");
      values.province = province;
    }
  }

  // Filter by district if specified (requires province)
  if (params.districtId && params.provinceId) {
    const districtsForProvince = districtLookup.filter(
      (d) => d.admin1 === provinceLookup[params.provinceId! - 1]?.admin1
    );
    const district = districtsForProvince[params.districtId - 1]?.admin2;
    if (district) {
      conditions.push("admin2 = @district");
      values.district = district;
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT DISTINCT commodity AS name, unit, category, MIN(rowid) AS id
    FROM ${TABLE}
    ${where}
    GROUP BY commodity, unit, category
    ORDER BY category, name
  `;

  return db.prepare(sql).all(values) as { id: number; name: string; unit: string; category: string }[];
}

export function getPriceRows(params: {
  provinceId?: number;  // Made optional to allow fetching all provinces
  districtId?: number;
  itemId?: number;
  limit?: number;
}): PriceRow[] {
  const conditions: string[] = [];
  const values: Record<string, unknown> = {};

  const provinceLookup = db
    .prepare(`SELECT DISTINCT admin1 FROM ${TABLE} WHERE admin1 IS NOT NULL ORDER BY admin1`)
    .all() as { admin1: string }[];
  const districtLookup = db
    .prepare(`SELECT DISTINCT admin1, admin2 FROM ${TABLE} WHERE admin2 IS NOT NULL ORDER BY admin1, admin2`)
    .all() as { admin1: string; admin2: string }[];
  const itemLookup = db
    .prepare(`SELECT DISTINCT commodity, unit, category FROM ${TABLE} WHERE commodity IS NOT NULL ORDER BY category, commodity`)
    .all() as { commodity: string; unit: string; category: string }[];

  if (params.provinceId) {
    const province = provinceLookup[params.provinceId - 1]?.admin1;
    if (province) {
      conditions.push("admin1 = @province");
      values.province = province;
    }
  }

  if (params.districtId && params.provinceId) {
    const districtsForProvince = provinceLookup[params.provinceId - 1]?.admin1
      ? districtLookup.filter((d) => d.admin1 === provinceLookup[params.provinceId! - 1].admin1)
      : districtLookup;
    const district = districtsForProvince[params.districtId - 1]?.admin2;
    if (district) {
      conditions.push("admin2 = @district");
      values.district = district;
    }
  }

  if (params.itemId) {
    const item = itemLookup[params.itemId - 1];
    if (item) {
      conditions.push("commodity = @commodity");
      values.commodity = item.commodity;
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = params.limit ?? 200;

  const sql = `
    SELECT rowid as id,
           date,
           admin1,
           admin2,
           market,
           category,
           commodity,
           unit,
           priceType,
           currency,
           price
    FROM ${TABLE}
    ${where}
    ORDER BY date DESC, id DESC
    LIMIT ${limit};
  `;

  const rows = db.prepare(sql).all(values) as {
    id: number;
    date: string;
    admin1: string;
    admin2: string;
    market: string;
    category: string;
    commodity: string;
    unit: string;
    priceType?: string;
    currency: string;
    price: number;
  }[];

  return rows.map((r, idx) => ({
    id: r.id ?? idx,
    item: r.commodity,
    category: r.category,
    unit: r.unit,
    price: r.price,
    currency: r.currency,
    date: r.date,
    province: r.admin1,
    district: r.admin2,
    market: r.market,
  }));
}

export function getOverview(params?: { provinceId?: number; districtId?: number; itemId?: number }): Overview {
  const conditions: string[] = [];
  const values: Record<string, unknown> = {};
  const provinceLookup = db
    .prepare(`SELECT DISTINCT admin1 FROM ${TABLE} WHERE admin1 IS NOT NULL ORDER BY admin1`)
    .all() as { admin1: string }[];
  const districtLookup = db
    .prepare(`SELECT DISTINCT admin1, admin2 FROM ${TABLE} WHERE admin2 IS NOT NULL ORDER BY admin1, admin2`)
    .all() as { admin1: string; admin2: string }[];
  const itemLookup = db
    .prepare(`SELECT DISTINCT commodity FROM ${TABLE} WHERE commodity IS NOT NULL ORDER BY commodity`)
    .all() as { commodity: string }[];

  if (params?.provinceId) {
    const province = provinceLookup[params.provinceId - 1]?.admin1;
    if (province) {
      conditions.push("admin1 = @province");
      values.province = province;
    }
  }
  if (params?.districtId) {
    const district = districtLookup[params.districtId - 1]?.admin2;
    if (district) {
      conditions.push("admin2 = @district");
      values.district = district;
    }
  }
  if (params?.itemId) {
    const commodity = itemLookup[params.itemId - 1]?.commodity;
    if (commodity) {
      conditions.push("commodity = @commodity");
      values.commodity = commodity;
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const lastUpdatedRow = db
    .prepare(`SELECT MAX(date) as lastUpdated FROM ${TABLE} ${where}`)
    .get(values) as { lastUpdated: string | null };

  const totalItemsRow = db
    .prepare(`SELECT COUNT(DISTINCT commodity) as totalItems FROM ${TABLE} ${where}`)
    .get(values) as { totalItems: number };

  const totalMarketsRow = db
    .prepare(`SELECT COUNT(DISTINCT market) as totalMarkets FROM ${TABLE} ${where}`)
    .get(values) as { totalMarkets: number };

  const averagePriceRow = db
    .prepare(`SELECT AVG(price) as averagePrice FROM ${TABLE} ${where}`)
    .get(values) as { averagePrice: number | null };

  return {
    lastUpdated: lastUpdatedRow.lastUpdated,
    totalItems: totalItemsRow.totalItems,
    totalMarkets: totalMarketsRow.totalMarkets,
    averagePrice: averagePriceRow.averagePrice,
  };
}

export function getAveragesByProvince(itemId?: number) {
  const conditions: string[] = [];
  const values: Record<string, unknown> = {};

  if (itemId) {
    const itemLookup = db
      .prepare(`SELECT DISTINCT commodity FROM ${TABLE} WHERE commodity IS NOT NULL ORDER BY commodity`)
      .all() as { commodity: string }[];
    const commodity = itemLookup[itemId - 1]?.commodity;
    if (commodity) {
      conditions.push("commodity = @commodity");
      values.commodity = commodity;
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT admin1 as province,
           AVG(price) as averagePrice
    FROM ${TABLE}
    ${where}
    GROUP BY admin1
    ORDER BY averagePrice DESC;
  `;

  return db.prepare(sql).all(values) as { province: string; averagePrice: number }[];
}
