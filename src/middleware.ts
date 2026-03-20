import { NextRequest, NextResponse } from "next/server";

const REDIRECT_FROM = "agent-content-workshop.vercel.app";
const REDIRECT_TO = "https://labubu.dpdns.org";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  if (host === REDIRECT_FROM) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = REDIRECT_TO.replace("https://", "");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
