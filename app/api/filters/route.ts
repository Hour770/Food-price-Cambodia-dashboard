import { NextRequest, NextResponse } from "next/server";
import { getFilters, getItemsByLocation } from "@/lib/db";

/**
 * GET /api/filters
 * Returns filter options for the dashboard
 * - provinces: List of provinces with nested districts
 * - items: Food items (optionally filtered by province/district)
 * 
 * Query params:
 * - province: Province ID to filter items
 * - district: District ID to filter items (requires province)
 */
export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provinceId = searchParams.get("province") ? Number(searchParams.get("province")) : undefined;
  const districtId = searchParams.get("district") ? Number(searchParams.get("district")) : undefined;

  // Get base filters (provinces with districts)
  const filters = getFilters();

  // If province or district is specified, get filtered items
  if (provinceId || districtId) {
    const filteredItems = getItemsByLocation({ provinceId, districtId });
    return NextResponse.json({
      provinces: filters.provinces,
      items: filteredItems,
    });
  }

  return NextResponse.json(filters);
}
