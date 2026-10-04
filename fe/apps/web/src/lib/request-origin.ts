import type { NextRequest } from "next/server";
// Next.js can normalize request.url to localhost even when the browser uses 127.0.0.1.
// Keep the local host so auth cookies and the redirect stay on the same origin.
export function requestOrigin(request: NextRequest) {
  const host = request.headers.get("host");
  if (host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))
    return `http://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
}
