import { NextRequest, NextResponse } from "next/server";
import { getOverview, getAveragesByProvince } from "@/lib/db";

export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provinceId = searchParams.get("province") ? Number(searchParams.get("province")) : undefined;
  const districtId = searchParams.get("district") ? Number(searchParams.get("district")) : undefined;
  const itemId = searchParams.get("item") ? Number(searchParams.get("item")) : undefined;

  const overview = getOverview({ provinceId, districtId, itemId });
  const averages = getAveragesByProvince(itemId);

  return NextResponse.json({ overview, averages });
}
