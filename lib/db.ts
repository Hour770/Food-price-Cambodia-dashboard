

const mongoose = require('mongoose');

const connectionPromise = mongoose.connect('mongodb://localhost:27017/Cambodia-Food-Price')
.then(() => {
  console.log("Connected to MongoDB in Docker");
  return mongoose.connection;
})
.catch((err: any) => {
  console.error("Connection error:", err);
  throw err;
});

// Helper to get the mongoose connection (waits for connection to be ready)
async function getDb() {
  await connectionPromise;
  return mongoose.connection.db;
}



export interface PriceRow {
  id: string;
  item: string;
  category: string;
  unit: string;
  price: number;
  currency: string;
  date: string;
  province: string;
  district: string;
  market: string;
}

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


// Helper to get collection by locale
function getCollection(locale: string = 'en') {
  // You may want to use different collections for each locale
  return locale === 'km' ? 'food_prices_kh' : 'food_prices_en';
}



export async function getFilters(locale: string = 'en'): Promise<Filters> {
  const db = await getDb();
  const collection = db.collection(getCollection(locale));
  const provinces = await collection.distinct('admin1', { admin1: { $ne: null } });
  const districts = await collection.aggregate([
    { $match: { admin1: { $ne: null }, admin2: { $ne: null } } },
    { $group: { _id: { admin1: "$admin1", admin2: "$admin2" } } },
    { $sort: { "_id.admin1": 1, "_id.admin2": 1 } }
  ]).toArray();
  const items = await collection.aggregate([
    { $match: { commodity: { $ne: null } } },
    { $group: { _id: { name: "$commodity", unit: "$unit", category: "$category" } } },
    { $sort: { "_id.category": 1, "_id.name": 1 } }
  ]).toArray();
  const provincesWithDistricts = provinces.map((p: string, idx: number) => ({
    id: idx + 1,
    name: p,
    districts: districts
      .filter((d: any) => d._id.admin1 === p)
      .map((d: any, dIdx: number) => ({ id: dIdx + 1, name: d._id.admin2 })),
  }));
  return {
    provinces: provincesWithDistricts,
    items: items.map((i: any, idx: number) => ({
      id: idx + 1,
      name: i._id.name,
      unit: i._id.unit,
      category: i._id.category,
    })),
  };
}

/**
 * Get food items filtered by province and/or district
 * Returns only items that have price records in the specified location
 */
export async function getItemsByLocation(params: {
  provinceId?: number;
  districtId?: number;
  locale?: string;
}): Promise<{ id: number; name: string; unit: string; category: string }[]> {
  const db = await getDb();
  const collection = db.collection(getCollection(params.locale));
  const provinces = await collection.distinct('admin1', { admin1: { $ne: null } });
  const districts = await collection.aggregate([
    { $match: { admin1: { $ne: null }, admin2: { $ne: null } } },
    { $group: { _id: { admin1: "$admin1", admin2: "$admin2" } } },
    { $sort: { "_id.admin1": 1, "_id.admin2": 1 } }
  ]).toArray();
  let match: any = { commodity: { $ne: null } };
  if (params.provinceId) {
    const province = provinces[params.provinceId - 1];
    if (province) match.admin1 = province;
    if (params.districtId) {
      const districtsForProvince = districts.filter((d: any) => d._id.admin1 === province);
      const district = districtsForProvince[params.districtId - 1]?._id.admin2;
      if (district) match.admin2 = district;
    }
  }
  const items = await collection.aggregate([
    { $match: match },
    { $group: { _id: { name: "$commodity", unit: "$unit", category: "$category" } } },
    { $sort: { "_id.category": 1, "_id.name": 1 } }
  ]).toArray();
  return items.map((i: any, idx: number) => ({
    id: idx + 1,
    name: i._id.name,
    unit: i._id.unit,
    category: i._id.category,
  }));
}

export async function getPriceRows(params: {
  provinceId?: number;
  districtId?: number;
  itemName?: string;
  limit?: number;
  locale?: string;
}): Promise<PriceRow[]> {
  const db = await getDb();
  const collection = db.collection(getCollection(params.locale));
  const provinces = await collection.distinct('admin1', { admin1: { $ne: null } });
  const districts = await collection.aggregate([
    { $match: { admin1: { $ne: null }, admin2: { $ne: null } } },
    { $group: { _id: { admin1: "$admin1", admin2: "$admin2" } } },
    { $sort: { "_id.admin1": 1, "_id.admin2": 1 } }
  ]).toArray();
  
  // Base query: always filter out null commodities
  let query: any = { commodity: { $ne: null } };
  
  if (params.provinceId) {
    const province = provinces[params.provinceId - 1];
    if (province) query.admin1 = province;
    if (params.districtId) {
      const districtsForProvince = districts.filter((d: any) => d._id.admin1 === province);
      const district = districtsForProvince[params.districtId - 1]?._id.admin2;
      if (district) query.admin2 = district;
    }
  }
  if (params.itemName) {
    query.commodity = params.itemName;
  }
  const limit = params.limit ?? 200;
  const rows = await collection.find(query).sort({ date: -1, _id: -1 }).limit(limit).toArray();
  
  return rows.map((r: any) => {
    // Handle price conversion - could be number, string, or null/undefined
    let price = 0;
    if (typeof r.price === 'number') {
      price = r.price;
    } else if (typeof r.price === 'string') {
      const parsed = parseFloat(r.price);
      price = isNaN(parsed) ? 0 : parsed;
    }
    
    return {
      id: r._id.toString(),
      item: r.commodity,
      category: r.category,
      unit: r.unit,
      price,
      currency: r.currency,
      date: r.date,
      province: r.admin1,
      district: r.admin2,
      market: r.market,
    };
  });
}

export async function getOverview(params?: { provinceId?: number; districtId?: number; itemName?: string; locale?: string }): Promise<Overview> {
  const db = await getDb();
  const collection = db.collection(getCollection(params?.locale));
  const provinces = await collection.distinct('admin1', { admin1: { $ne: null } });
  const districts = await collection.aggregate([
    { $match: { admin1: { $ne: null }, admin2: { $ne: null } } },
    { $group: { _id: { admin1: "$admin1", admin2: "$admin2" } } },
    { $sort: { "_id.admin1": 1, "_id.admin2": 1 } }
  ]).toArray();
  let query: any = {};
  if (params?.provinceId) {
    const province = provinces[params.provinceId - 1];
    if (province) query.admin1 = province;
    if (params?.districtId) {
      const districtsForProvince = districts.filter((d: any) => d._id.admin1 === province);
      const district = districtsForProvince[params.districtId - 1]?._id.admin2;
      if (district) query.admin2 = district;
    }
  }
  if (params?.itemName) {
    query.commodity = params.itemName;
  }
  const lastUpdatedRow = await collection.find(query).sort({ date: -1 }).limit(1).toArray();
  const lastUpdated = lastUpdatedRow[0]?.date || null;
  const totalItems = await collection.distinct('commodity', query);
  const totalMarkets = await collection.distinct('market', query);
  const avg = await collection.aggregate([
    { $match: query },
    { $addFields: { priceNum: { $toDouble: "$price" } } },
    { $group: { _id: null, averagePrice: { $avg: "$priceNum" } } }
  ]).toArray();
  return {
    lastUpdated,
    totalItems: totalItems.length,
    totalMarkets: totalMarkets.length,
    averagePrice: avg[0]?.averagePrice ?? null,
  };
}

export async function getAveragesByProvince(itemName?: string, locale?: string) {
  const db = await getDb();
  const collection = db.collection(getCollection(locale));
  let match: any = {};
  if (itemName) match.commodity = itemName;
  console.log("getAveragesByProvince - match:", match, "collection:", getCollection(locale));
  const result = await collection.aggregate([
    { $match: match },
    { $addFields: { priceNum: { $toDouble: "$price" } } },
    { $group: { _id: "$admin1", averagePrice: { $avg: "$priceNum" } } },
    { $sort: { averagePrice: -1 } }
  ]).toArray();
  console.log("getAveragesByProvince - result count:", result.length);
  return result.map((r: any) => ({ province: r._id, averagePrice: r.averagePrice }));
}
