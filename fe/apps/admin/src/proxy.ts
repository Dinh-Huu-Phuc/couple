import { NextResponse, type NextRequest } from "next/server";

// The admin deployment is bound to its dedicated hostname. Missing production
// configuration fails closed, including on the default *.vercel.app URL.
export function proxy(request: NextRequest) {
  // Vercel Cron uses the deployment hostname. This single route has its own
  // bearer authentication; no admin UI/API is opened on alternate hosts.
  if (request.nextUrl.pathname === "/api/inactivity-cleanup")
    return NextResponse.next();
  const expected = process.env.ADMIN_HOST?.toLowerCase();
  const host = request.headers.get("host")?.split(":", 1)[0]?.toLowerCase();
  const local =
    process.env.NODE_ENV !== "production" &&
    (host === "localhost" || host === "127.0.0.1");
  if (!local && (!expected || host !== expected)) {
    return new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
