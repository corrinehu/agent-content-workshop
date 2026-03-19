import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSecondMeShades, getSecondMeSoftMemory } from "@/lib/secondme";
import { fetchRingDetail, type RingContent, type RingInfo } from "@/lib/zhihu";

// The two hackathon circles
const RING_IDS = ["2001009660925334090", "2015023739549529606"];

// In-memory cache
interface CachedRingData {
  ringInfo: RingInfo;
  contents: RingContent[];
  ringId: string;
}
const cache = new Map<string, { data: CachedRingData[]; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedRingContents(): Promise<CachedRingData[]> {
  const cached = cache.get("rings");
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const results: CachedRingData[] = [];
  for (const ringId of RING_IDS) {
    try {
      const detail = await fetchRingDetail(ringId, 1, 20);
      results.push({ ringInfo: detail.ring_info, contents: detail.contents || [], ringId });
    } catch (err) {
      console.warn(`[Topics] Failed to fetch ring ${ringId}:`, err);
    }
  }

  cache.set("rings", { data: results, expires: Date.now() + CACHE_TTL });
  return results;
}

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

    // Fetch circle contents
    const ringData = await getCachedRingContents();

    // Flatten all circle contents into topic cards
    const allKeywords = [...interests, ...softMemoryTerms];
    const topics: {
      zhihuId: string;
      title: string;
      excerpt: string;
      heatScore: number;
      matchScore: number;
      answerCount: number;
      matched: boolean;
      ringName: string;
      ringId: string;
      authorName: string;
      likeNum: number;
      commentNum: number;
    }[] = [];

    for (const ring of ringData) {
      const ringName = ring.ringInfo?.ring_name || "未知圈子";
      for (const item of ring.contents) {
        // Strip HTML tags for display
        const cleanContent = item.content.replace(/<[^>]*>/g, "").trim();
        // Use first sentence or first 50 chars as title
        const title = cleanContent.length > 50 ? cleanContent.slice(0, 50) + "..." : cleanContent;
        const combined = `${item.author_name} ${cleanContent}`;

        const interestScore = keywordMatchScore(combined, interests);
        const memoryScore = keywordMatchScore(combined, softMemoryTerms);
        const totalMatch = interestScore * 3 + memoryScore;

        topics.push({
          zhihuId: String(item.pin_id),
          title,
          excerpt: cleanContent.slice(0, 120),
          heatScore: (item.like_num || 0) + (item.comment_num || 0) * 2 + (item.fav_num || 0) * 3,
          matchScore: totalMatch,
          answerCount: item.comment_num || 0,
          matched: totalMatch > 0,
          ringName,
          ringId: ring.ringId,
          authorName: item.author_name || "匿名",
          likeNum: item.like_num || 0,
          commentNum: item.comment_num || 0,
        });
      }
    }

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
        rings: ringData.map(r => ({
          id: r.ringId,
          name: r.ringInfo?.ring_name,
          members: r.ringInfo?.membership_num,
          discussions: r.ringInfo?.discussion_num,
        })),
      },
    });
  } catch (err) {
    console.error("[Topics] Fetch failed:", err);
    return NextResponse.json({ code: -1, message: "获取圈子内容失败: " + String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ code: -1, message: "未登录" }, { status: 401 });
  }

  const { zhihuId, title, excerpt, heatScore, answerCount, ringId, ringName } = await request.json();

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
