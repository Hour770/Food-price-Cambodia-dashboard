import { NextRequest, NextResponse } from "next/server";
import { getOverview, getAveragesByProvince } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provinceId = searchParams.get("province") ? Number(searchParams.get("province")) : undefined;
    const districtId = searchParams.get("district") ? Number(searchParams.get("district")) : undefined;
    const itemName = searchParams.get("item") || undefined;
    const locale = searchParams.get("locale") || 'en';

    const [overview, averages] = await Promise.all([
      getOverview({ provinceId, districtId, itemName, locale }),
      getAveragesByProvince(itemName, locale)
    ]);

    return NextResponse.json({ overview, averages });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load overview', details: error instanceof Error ? error.message : error }, { status: 500 });
  }
}
