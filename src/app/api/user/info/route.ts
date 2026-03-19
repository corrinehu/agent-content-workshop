import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getSecondMeUser } from "@/lib/secondme";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ code: -1, message: "未登录" }, { status: 401 });
  }

  try {
    const result = await getSecondMeUser(user.accessToken);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ code: -1, message: "获取用户信息失败" }, { status: 500 });
  }
}
