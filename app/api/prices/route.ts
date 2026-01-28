import { NextRequest, NextResponse } from "next/server";
import { getPriceRows } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provinceId = searchParams.get("province") ? Number(searchParams.get("province")): undefined;
  const districtId = searchParams.get("district") ? Number(searchParams.get("district")) : undefined;
  const itemName = searchParams.get("item") || undefined;
  const locale = searchParams.get("locale") || 'en';

  // Increase limit when no filters applied to get all provinces × all items
  // 25 provinces × 19 items × multiple records per combination = need larger limit
  const limit = (!provinceId && !itemName) ? 5000 : (!provinceId || !districtId) ? 1000 : 500;

  const data = await getPriceRows({ provinceId, districtId, itemName, limit, locale });
  return NextResponse.json({ data });
}
