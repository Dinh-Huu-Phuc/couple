import { NextResponse, type NextRequest } from "next/server";
import { authorizesCron } from "../../../../../../../be/admin/cron-auth.mjs";
import { backend } from "@/admin/server";
import { cleanInactiveAccounts } from "@/admin/inactivity-erasure";
import { cleanAttachments } from "@/admin/attachment-cleanup";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  if (
    !authorizesCron(
      process.env.CRON_SECRET,
      request.headers.get("authorization"),
    )
  )
    return new NextResponse(null, { status: 401 });
  try {
    const result = await cleanInactiveAccounts(backend().client);
    const attachments = await cleanAttachments(backend().client);
    return NextResponse.json({ ...result, attachments }, {
      headers: { "Cache-Control": "no-store" },
      status: result.deferred || attachments.deferred ? 503 : 200,
    });
  } catch {
    return NextResponse.json({ error: "CLEANUP_UNAVAILABLE" }, { status: 503 });
  }
}
