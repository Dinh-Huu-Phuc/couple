import { adminHandler } from "@/admin/server";
import type { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action: string }> };
export async function GET(request: NextRequest, context: Context) {
  return adminHandler(request, (await context.params).action);
}
export async function POST(request: NextRequest, context: Context) {
  return adminHandler(request, (await context.params).action);
}
