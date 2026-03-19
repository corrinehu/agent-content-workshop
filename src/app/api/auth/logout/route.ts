import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  cookieStore.delete("user_id");
  cookieStore.delete("oauth_state");
  return NextResponse.redirect("/");
}
