import { NextRequest, NextResponse } from "next/server";
import { getOverview, getAveragesByProvince } from "@/lib/db";

export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provinceId = searchParams.get("province") ? Number(searchParams.get("province")) : undefined;
  const districtId = searchParams.get("district") ? Number(searchParams.get("district")) : undefined;
  const itemName = searchParams.get("item") || undefined;
  const locale = searchParams.get("locale") || 'en';

  const overview = getOverview({ provinceId, districtId, itemName, locale });
  const averages = getAveragesByProvince(itemName, locale);

  return NextResponse.json({ overview, averages });
}
