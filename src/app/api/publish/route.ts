import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ code: -1, message: "未登录" }, { status: 401 });
  }

  const { articleId } = await request.json();

  const article = await prisma.article.findUnique({
    where: { id: articleId, userId: user.id },
  });

  if (!article) {
    return NextResponse.json({ code: -1, message: "文章不存在" }, { status: 404 });
  }

  // Mark as published (actual Zhihu API publishing would go here)
  await prisma.article.update({
    where: { id: articleId },
    data: {
      status: "published",
      publishedAt: new Date(),
    },
  });

  return NextResponse.json({ code: 0, data: { articleId, status: "published" } });
}
