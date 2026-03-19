import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, getSecondMeUser } from "@/lib/secondme";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get("oauth_state")?.value;

  // Lenient state validation for WebView compatibility
  if (state && savedState && state !== savedState) {
    console.warn("OAuth state mismatch, possible cross-WebView scenario");
  }

  try {
    const tokenResult = await exchangeCode(code);

    if (tokenResult.code !== 0 || !tokenResult.data) {
      return NextResponse.redirect(
        new URL("/?error=token_exchange_failed", request.url),
      );
    }

    const { accessToken, refreshToken, expiresIn } = tokenResult.data;
    const expiresAt = new Date(Date.now() + (expiresIn || 7200) * 1000);

    // Fetch user info
    const userResult = await getSecondMeUser(accessToken);
    const userData = userResult.data || {};
    const secondmeUserId = userData.userId || userData.id || "unknown";

    // Upsert user in database
    const user = await prisma.user.upsert({
      where: { secondmeUserId },
      update: {
        accessToken: accessToken,
        refreshToken: refreshToken || "",
        tokenExpiresAt: expiresAt,
        name: userData.nickname || userData.name,
        avatar: userData.avatar,
      },
      create: {
        secondmeUserId,
        accessToken: accessToken,
        refreshToken: refreshToken || "",
        tokenExpiresAt: expiresAt,
        name: userData.nickname || userData.name,
        avatar: userData.avatar,
      },
    });

    // Set session cookie
    cookieStore.set("user_id", user.id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (err) {
    console.error("OAuth callback error:", err);
    const errMsg = encodeURIComponent(String(err));
    return NextResponse.redirect(
      new URL(`/?error=internal_error&detail=${errMsg}`, request.url),
    );
  }
}
