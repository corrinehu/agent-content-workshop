import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSecondMeShades } from "@/lib/secondme";

// Zhihu hot list API (proxy with caching)
const ZHIHU_HOT_LIST = "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total";

interface ZhihuHotItem {
  target: {
    id: number;
    title: string;
    excerpt: string;
    answer_count: number;
  };
  detail_text: string;
}

// Simple in-memory cache
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function fetchHotList(): Promise<ZhihuHotItem[]> {
  const cached = cache.get("hotlist");
  if (cached && cached.expires > Date.now()) {
    return cached.data as ZhihuHotItem[];
  }

  try {
    const res = await fetch(ZHIHU_HOT_LIST, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgentContentWorkshop/1.0)",
      },
      next: { revalidate: 600 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const items: ZhihuHotItem[] = json.data || [];
    if (items.length === 0) throw new Error("Empty data from Zhihu");
    cache.set("hotlist", { data: items, expires: Date.now() + CACHE_TTL });
    return items;
  } catch (err) {
    console.warn("Zhihu hot list fetch failed, using fallback:", err);
    // Fallback demo data when Zhihu API is unreachable
    const fallback: ZhihuHotItem[] = [
      { target: { id: 1, title: "2026年，大模型的推理能力真的能替代程序员吗？", excerpt: "随着Claude、GPT等模型的推理能力持续进化，关于AI是否会取代程序员的讨论再次升温。", answer_count: 126 }, detail_text: "热议中" },
      { target: { id: 2, title: "为什么越来越多年轻人选择「数字游民」生活方式？", excerpt: "远程办公、AI工具普及，让不坐班的自由工作方式成为可能。", answer_count: 89 }, detail_text: "热议中" },
      { target: { id: 3, title: "如何评价 2026 年前端开发的技术趋势？", excerpt: "从React Server Components到AI原生UI，前端领域正在经历巨大变革。", answer_count: 203 }, detail_text: "热议中" },
      { target: { id: 4, title: "AI Agent 会是下一个万亿级赛道吗？", excerpt: "从AutoGPT到多Agent协作，Agent技术正在从概念走向产品化。", answer_count: 312 }, detail_text: "热议中" },
      { target: { id: 5, title: "作为一个AI工程师，你的日常工作流是什么样的？", excerpt: "想了解一线AI工程师真实的工作状态和工具链。", answer_count: 78 }, detail_text: "热议中" },
      { target: { id: 6, title: "为什么说 Prompt Engineering 正在消亡？", excerpt: "随着模型能力提升，精心设计Prompt的重要性是否在降低？", answer_count: 167 }, detail_text: "热议中" },
      { target: { id: 7, title: "如何在工作中高效使用 AI 编程助手？", excerpt: "分享实际使用Claude Code、Copilot等工具提升效率的经验。", answer_count: 245 }, detail_text: "热议中" },
      { target: { id: 8, title: "2026年最值得学习的编程语言是什么？", excerpt: "Python、Rust、Go还是TypeScript？技术选型的讨论从未停止。", answer_count: 198 }, detail_text: "热议中" },
      { target: { id: 9, title: "开源大模型和闭源大模型，你会怎么选？", excerpt: "Llama、DeepSeek vs GPT、Claude，各自的优劣在哪里？", answer_count: 156 }, detail_text: "热议中" },
      { target: { id: 10, title: "如何看待「人人都是开发者」的趋势？", excerpt: "AI编程工具降低了门槛，但专业开发者的价值在哪里？", answer_count: 134 }, detail_text: "热议中" },
    ];
    cache.set("hotlist", { data: fallback, expires: Date.now() + 60 * 1000 }); // shorter cache for fallback
    return fallback;
  }
}

// Simple keyword matching for topic recommendation
function matchScore(topic: string, interests: string[]): number {
  const lower = topic.toLowerCase();
  return interests.reduce((score, interest) => {
    const keywords = interest.toLowerCase().split(/[，,、\s]+/);
    for (const kw of keywords) {
      if (kw && lower.includes(kw)) return score + 1;
    }
    return score;
  }, 0);
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

    // Fetch hot list
    const hotItems = await fetchHotList();

    // Score and sort topics
    const scored = hotItems.slice(0, 50).map((item, index) => {
      const title = item.target?.title || "";
      const score = matchScore(title, interests);
      return {
        zhihuId: String(item.target?.id || index),
        title,
        excerpt: item.target?.excerpt || item.detail_text || "",
        heatScore: (50 - index) + score * 10,
        answerCount: item.target?.answer_count || 0,
        matched: score > 0,
      };
    });

    scored.sort((a, b) => b.heatScore - a.heatScore);

    return NextResponse.json({
      code: 0,
      data: {
        topics: scored.slice(0, 20),
        interests,
      },
    });
  } catch (err) {
    return NextResponse.json({ code: -1, message: "获取热榜失败: " + String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ code: -1, message: "未登录" }, { status: 401 });
  }

  const { zhihuId, title, excerpt, heatScore, answerCount } = await request.json();

  const topic = await prisma.topic.create({
    data: {
      userId: user.id,
      zhihuId,
      title,
      excerpt,
      heatScore,
      answerCount,
      status: "pending",
    },
  });

  return NextResponse.json({ code: 0, data: topic });
}
