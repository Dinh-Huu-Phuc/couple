import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { serverClient } from "@/lib/supabase/server";
import { safeNext } from "@couple/domain";
import { requestOrigin } from "@/lib/request-origin";
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const hash = params.get("token_hash");
  const type = params.get("type");
  const client = await serverClient();
  let success = false;
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    success = !error;
  } else if (
    hash &&
    type &&
    [
      "signup",
      "recovery",
      "email",
      "invite",
      "email_change",
      "magiclink",
    ].includes(type)
  ) {
    const { error } = await client.auth.verifyOtp({
      token_hash: hash,
      type: type as EmailOtpType,
    });
    success = !error;
  }
  return NextResponse.redirect(
    new URL(
      success
        ? safeNext(
            params.get("next"),
            type === "recovery" ? "/reset-password" : "/home",
          )
        : "/login?error=callback",
      requestOrigin(request),
    ),
  );
}
