import { NextRequest, NextResponse } from "next/server";
import { getPriceRows } from "@/lib/db";
import { getDefinedNamedExports } from "next/dist/build/utils";

export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provinceId = searchParams.get("province") ? Number(searchParams.get("province")): undefined;
  const districtId = searchParams.get("district") ? Number(searchParams.get("district")) : undefined;
  const itemId = searchParams.get("item") ? Number(searchParams.get("item")) : undefined;

  const data = getPriceRows({ provinceId, districtId, itemId, limit: 300 });
  return NextResponse.json({ data });
}
