import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ code: -1, message: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get("articleId");

  if (articleId) {
    const article = await prisma.article.findUnique({
      where: { id: articleId, userId: user.id },
    });
    if (!article) {
      return NextResponse.json({ code: -1, message: "文章不存在" }, { status: 404 });
    }
    return NextResponse.json({ code: 0, data: article });
  }

  // Return latest draft article
  const article = await prisma.article.findFirst({
    where: { userId: user.id, status: "draft" },
    orderBy: { createdAt: "desc" },
  });

  if (!article) {
    return NextResponse.json({ code: 0, data: null });
  }

  return NextResponse.json({ code: 0, data: article });
}
