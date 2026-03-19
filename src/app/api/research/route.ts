import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { sendActMessage, getSecondMeSoftMemory } from "@/lib/secondme";
import { searchGlobal } from "@/lib/zhihu";

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ code: -1, message: "未登录" }, { status: 401 });
  }

  const { title, sessionId } = await request.json();
  if (!title) {
    return NextResponse.json({ code: -1, message: "缺少话题标题" }, { status: 400 });
  }

  try {
    // 1. Search Zhihu for related content
    let searchResults: Awaited<ReturnType<typeof searchGlobal>> = [];
    try {
      searchResults = await searchGlobal(title, 10);
    } catch (err) {
      console.warn("[Research] Zhihu search failed:", err);
    }

    // 2. Fetch user soft memory for context
    let userContext = "";
    try {
      const memRes = await getSecondMeSoftMemory(user.accessToken);
      if (memRes?.data) {
        const memories = Array.isArray(memRes.data)
          ? memRes.data
          : memRes.data.memories || [];
        if (memories.length > 0) {
          userContext = memories
            .slice(0, 5)
            .map((m: { content?: string; text?: string }) => m.content || m.text || "")
            .filter(Boolean)
            .join("\n");
        }
      }
    } catch {
      // Continue without soft memory
    }

    // 3. Build search summary
    const searchSummary = searchResults
      .slice(0, 5)
      .map(
        (r, i) =>
          `${i + 1}. ${r.title}（${r.author_name}，${r.vote_up_count}赞）\n${(r.content_text || "").slice(0, 150)}...`
      )
      .join("\n\n");

    // 4. Use Act API to get structured JSON
    const researchPrompt = `你是一个研究助手。请针对以下知乎话题分析观点分布，并返回结构化 JSON 数据。

话题：${title}

搜索到的相关讨论：
${searchSummary || "未找到相关搜索结果"}

用户背景信息：
${userContext || "暂无背景信息"}

请返回如下 JSON 格式（不要加 markdown 代码块标记）：
{
  "materialNote": "200字以内的研究笔记纯文本，供后续聊天参考",
  "viewpoints": [
    { "stance": "观点标签（如'完全赞同'、'部分反对'）", "percentage": 45, "summary": "一句话概括这个立场的核心主张", "color": "blue" }
  ],
  "keyArguments": {
    "主流方": ["论据1", "论据2"],
    "反对方": ["论据1", "论据2"]
  },
  "userContext": "这个话题与用户背景的关联，一句话说明",
  "suggestion": "用户可以从什么独特角度切入，一句话建议"
}

要求：
- viewpoints 数组 2-5 个，percentage 总和为 100，color 从 ["blue","emerald","amber","purple","rose"] 中选
- materialNote 用简洁的要点格式，中文输出
- keyArguments 每方 2-4 个论据
- 只返回 JSON，不要返回其他文本`;

    let researchData: Record<string, unknown> = {};
    await sendActMessage(
      user.accessToken,
      sessionId || "research",
      researchPrompt,
      {
        type: "object",
        properties: {
          materialNote: { type: "string" },
          viewpoints: {
            type: "array",
            items: {
              type: "object",
              properties: {
                stance: { type: "string" },
                percentage: { type: "number" },
                summary: { type: "string" },
                color: { type: "string" },
              },
            },
          },
          keyArguments: {
            type: "object",
            additionalProperties: { type: "array", items: { type: "string" } },
          },
          userContext: { type: "string" },
          suggestion: { type: "string" },
        },
      },
      (data) => {
        researchData = data;
      }
    );

    if (Object.keys(researchData).length === 0) {
      throw new Error("Agent 未返回数据");
    }

    // Fallback: if raw text was returned instead of structured data
    if (researchData.raw && !researchData.viewpoints) {
      const rawText = String(researchData.raw);
      researchData = {
        materialNote: rawText,
        viewpoints: [
          { stance: "综合观点", percentage: 100, summary: rawText, color: "blue" }
        ],
        keyArguments: { "主流方": [], "反对方": [] },
        userContext: "",
        suggestion: "",
      };
    }

    return NextResponse.json({
      code: 0,
      data: {
        ...researchData,
        searchResults: searchResults.slice(0, 5).map((r) => ({
          title: r.title,
          authorName: r.author_name,
          voteUpCount: r.vote_up_count,
          contentSnippet: (r.content_text || "").slice(0, 100),
        })),
      },
    });
  } catch (err) {
    console.error("[Research] Error:", err);
    return NextResponse.json(
      { code: -1, message: "研究失败: " + String(err) },
      { status: 500 }
    );
  }
}
