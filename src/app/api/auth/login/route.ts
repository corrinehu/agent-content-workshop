import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOAuthUrl } from "@/lib/secondme";

export async function GET() {
  // Use a simple random state for CSRF protection
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("oauth_state", state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
  });

  const oauthUrl = getOAuthUrl(state);
  return NextResponse.redirect(oauthUrl);
}
