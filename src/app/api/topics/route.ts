import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createTopic } from "@/lib/db";
import { getSecondMeShades, getSecondMeSoftMemory } from "@/lib/secondme";
import { fetchBillboard } from "@/lib/zhihu";

// Keyword matching
function keywordMatchScore(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((score, kw) => {
    if (kw && lower.includes(kw.toLowerCase())) return score + 1;
    return score;
  }, 0);
}

// Extract meaningful Chinese terms (2-4 chars)
function extractTerms(text: string): string[] {
  const matches = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
  const freq = new Map<string, number>();
  for (const m of matches) {
    freq.set(m, (freq.get(m) || 0) + 1);
  }
  return Array.from(freq.keys());
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ code: -1, message: "未登录" }, { status: 401 });
  }

  try {
    // Fetch user interest tags
    let interests: string[] = [];
    try {
      const shadesResult = await getSecondMeShades(user.accessToken);
      if (shadesResult.code === 0 && shadesResult.data) {
        const shades = Array.isArray(shadesResult.data) ? shadesResult.data : shadesResult.data.shades || [];
        interests = shades.map((s: { name?: string; tag?: string; text?: string }) => s.name || s.tag || s.text || "").filter(Boolean);
      }
    } catch {
      // Continue without interests
    }

    // Fetch user soft memory
    let softMemoryTerms: string[] = [];
    try {
      const memRes = await getSecondMeSoftMemory(user.accessToken);
      if (memRes?.data) {
        const memories = Array.isArray(memRes.data) ? memRes.data : memRes.data.memories || [];
        const memoryText = memories
          .slice(0, 10)
          .map((m: { content?: string; text?: string }) => m.content || m.text || "")
          .filter(Boolean)
          .join(" ");
        softMemoryTerms = extractTerms(memoryText);
      }
    } catch {
      // Continue without soft memory
    }

    // Fetch Zhihu hot billboard
    const billboard = await fetchBillboard(50, 48);

    const allKeywords = [...interests, ...softMemoryTerms];
    const topics = billboard.map((item) => {
      const interestScore = keywordMatchScore(item.title, interests);
      const memoryScore = keywordMatchScore(item.title, softMemoryTerms);
      const totalMatch = interestScore * 3 + memoryScore;

      return {
        zhihuId: item.token || item.link_url || "",
        title: item.title,
        excerpt: item.body || item.title,
        heatScore: item.heat_score,
        matchScore: totalMatch,
        answerCount: item.interaction_info?.comment_count || 0,
        matched: totalMatch > 0,
        source: item.type === "QUESTION" ? "热榜问题" : item.type || "知乎热榜",
        publishedTime: item.published_time_str,
        views: item.interaction_info?.pv_count || 0,
        likes: item.interaction_info?.vote_up_count || 0,
        comments: item.interaction_info?.comment_count || 0,
        linkUrl: item.link_url,
      };
    });

    // Sort: matched first, then by heat
    topics.sort((a, b) => {
      if (a.matched && !b.matched) return -1;
      if (!a.matched && b.matched) return 1;
      if (a.matched && b.matched) return b.matchScore - a.matchScore || b.heatScore - a.heatScore;
      return b.heatScore - a.heatScore;
    });

    return NextResponse.json({
      code: 0,
      data: {
        topics: topics.slice(0, 30),
        interests,
      },
    });
  } catch (err) {
    console.error("[Topics] Fetch failed:", err);
    return NextResponse.json({ code: -1, message: "获取热榜失败: " + String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ code: -1, message: "未登录" }, { status: 401 });
  }

  const { zhihuId, title, excerpt, heatScore, answerCount } = await request.json();

  const topic = await createTopic({
    userId: user.id,
    zhihuId,
    title,
    excerpt,
    heatScore,
    answerCount,
  });

  return NextResponse.json({ code: 0, data: topic });
}
