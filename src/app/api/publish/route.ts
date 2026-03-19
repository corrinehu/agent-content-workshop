import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishPin } from "@/lib/zhihu";

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

  // Publish to Zhihu circle via real API
  let contentToken: string | null = null;
  try {
    const result = await publishPin({
      title: article.title || "Agent 内容工坊",
      content: article.content,
    });
    contentToken = result.content_token;
  } catch (err) {
    console.error("[Publish] Zhihu publish failed:", err);
    return NextResponse.json({ code: -1, message: "知乎发布失败: " + String(err) }, { status: 500 });
  }

  // Mark as published in DB
  await prisma.article.update({
    where: { id: articleId },
    data: {
      status: "published",
      publishedAt: new Date(),
    },
  });

  return NextResponse.json({
    code: 0,
    data: { articleId, status: "published", contentToken },
  });
}
