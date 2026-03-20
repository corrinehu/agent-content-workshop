import { NextRequest, NextResponse } from "next/server";
import {
  getSecondMeUser,
  getSecondMeShades,
  getSecondMeSoftMemory,
  sendChatMessage,
  sendActMessage,
  API_BASE_URL,
} from "@/lib/secondme";
import { fetchBillboard, searchGlobal } from "@/lib/zhihu";

// ---- MCP JSON-RPC helpers ----

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function jsonRpcResult(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

// ---- Auth: resolve user from bearer token ----

async function resolveUser(bearerToken: string): Promise<{
  userId: string;
  name: string;
  accessToken: string;
} | null> {
  try {
    const res = await getSecondMeUser(bearerToken);
    if (res.code === 0 && res.data) {
      return {
        userId: res.data.userId || res.data.id || "unknown",
        name: res.data.nickname || res.data.name || "",
        accessToken: bearerToken,
      };
    }
  } catch {
    // Token invalid
  }
  return null;
}

// ---- Collect full chat response (non-streaming) ----

async function collectChatResponse(
  accessToken: string,
  sessionId: string,
  message: string,
): Promise<string> {
  let fullText = "";
  await sendChatMessage(accessToken, sessionId, message, (chunk) => {
    fullText += chunk;
  });
  return fullText;
}

// ---- Tool definitions ----

const TOOLS = [
  {
    name: "search_hot_topics",
    description:
      "获取知乎热榜话题，基于用户兴趣标签智能推荐适合回答的问题。返回话题标题、热度、链接和匹配原因。",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "返回数量，默认10，最大30",
        },
        hours: {
          type: "number",
          description: "时间范围（小时），默认48",
        },
      },
    },
  },
  {
    name: "research_topic",
    description:
      "针对某个知乎话题进行深度研究，搜索知乎相关讨论并分析观点分布。返回结构化研究数据，包括观点比例、关键论据、切入建议。",
    inputSchema: {
      type: "object" as const,
      properties: {
        topic: {
          type: "string",
          description: "要研究的话题或问题标题",
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "polish_content",
    description:
      "将用户的观点打磨成知乎风格的回答内容。支持闪念模式（100-300字短想法）和深度模式（600-800字完整回答）。",
    inputSchema: {
      type: "object" as const,
      properties: {
        topic: {
          type: "string",
          description: "话题或问题标题",
        },
        viewpoint: {
          type: "string",
          description: "用户的核心观点",
        },
        mode: {
          type: "string",
          description: "创作模式：quick（闪念，100-300字）或 deep（深度，600-800字），默认 deep",
          enum: ["quick", "deep"],
        },
      },
      required: ["topic", "viewpoint"],
    },
  },
];

// ---- Tool implementations ----

async function handleSearchHotTopics(
  accessToken: string,
  args: { limit?: number; hours?: number },
) {
  const limit = Math.min(args.limit || 10, 30);
  const hours = args.hours || 48;

  // Fetch billboard
  const items = await fetchBillboard(50, hours);

  // Fetch user interest tags for matching
  let interests: string[] = [];
  try {
    const shadesRes = await getSecondMeShades(accessToken);
    if (shadesRes.code === 0 && shadesRes.data) {
      const shades = Array.isArray(shadesRes.data)
        ? shadesRes.data
        : shadesRes.data.shades || [];
      interests = shades
        .map((s: Record<string, unknown>) =>
          [s.name, s.tag, s.text, s.shadeName].find(
            (k) => typeof k === "string" && k,
          ),
        )
        .filter(Boolean) as string[];
    }
  } catch {
    // Continue without interests
  }

  // Keyword match
  function matchScore(text: string): number {
    const lower = text.toLowerCase();
    return interests.reduce(
      (score, kw) => (kw && lower.includes(kw.toLowerCase()) ? score + 1 : score),
      0,
    );
  }

  // Score and sort
  const scored = items
    .map((item) => ({
      title: item.title,
      link: item.link_url,
      heatScore: item.heat_score,
      publishedTime: item.published_time_str,
      type: item.type,
      answers: item.interaction_info?.vote_up_count || 0,
      comments: item.interaction_info?.comment_count || 0,
      views: item.interaction_info?.pv_count || 0,
      matched: false,
      matchScore: 0,
    }))
    .map((item) => {
      const ms = matchScore(item.title);
      return { ...item, matched: ms > 0, matchScore: ms };
    })
    .sort((a, b) => {
      if (a.matched && !b.matched) return -1;
      if (!a.matched && b.matched) return 1;
      if (a.matched && b.matched)
        return b.matchScore - a.matchScore || b.heatScore - a.heatScore;
      return b.heatScore - a.heatScore;
    });

  const selected = scored.slice(0, limit);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          topics: selected,
          userInterests: interests,
          summary: `共获取 ${items.length} 条热榜话题，推荐 ${selected.length} 条${interests.length > 0 ? `（基于 ${interests.length} 个兴趣标签匹配）` : ""}`,
        }),
      },
    ],
  };
}

async function handleResearchTopic(
  accessToken: string,
  args: { topic: string },
) {
  const { topic } = args;

  // 1. Search Zhihu
  let searchResults: Awaited<ReturnType<typeof searchGlobal>> = [];
  try {
    searchResults = await searchGlobal(topic, 10);
  } catch {
    // Continue without search
  }

  const searchSummary = searchResults
    .slice(0, 5)
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}（${r.author_name}，${r.vote_up_count}赞）\n${(r.content_text || "").slice(0, 150)}...`,
    )
    .join("\n\n");

  // 2. Get user context from soft memory
  let userContext = "";
  try {
    const memRes = await getSecondMeSoftMemory(accessToken);
    if (memRes?.data) {
      const memories = Array.isArray(memRes.data)
        ? memRes.data
        : memRes.data.memories || [];
      if (memories.length > 0) {
        userContext = memories
          .slice(0, 5)
          .map(
            (m: Record<string, unknown>) =>
              String(m.content || m.text || ""),
          )
          .filter(Boolean)
          .join("\n");
      }
    }
  } catch {
    // Continue without soft memory
  }

  // 3. Use Act API for structured analysis
  const researchPrompt = `你是一个研究助手。请针对以下知乎话题分析观点分布，并返回结构化 JSON 数据。

话题：${topic}

搜索到的相关讨论：
${searchSummary || "未找到相关搜索结果"}

用户背景信息：
${userContext || "暂无背景信息"}

请返回如下 JSON 格式（不要加 markdown 代码块标记）：
{
  "materialNote": "200字以内的研究笔记纯文本",
  "viewpoints": [
    { "stance": "观点标签", "percentage": 45, "summary": "一句话概括" }
  ],
  "keyArguments": {
    "主流方": ["论据1", "论据2"],
    "反对方": ["论据1"]
  },
  "suggestion": "用户可以从什么独特角度切入，一句话建议"
}

要求：viewpoints 2-5个，percentage总和100，只返回JSON。`;

  let researchData: Record<string, unknown> = {};
  await sendActMessage(
    accessToken,
    `research-${Date.now()}`,
    researchPrompt,
    {
      type: "object",
      properties: {
        materialNote: { type: "string" },
        viewpoints: { type: "array" },
        keyArguments: { type: "object" },
        suggestion: { type: "string" },
      },
    },
    (data) => {
      researchData = data;
    },
  );

  if (Object.keys(researchData).length === 0) {
    researchData = {
      materialNote: searchSummary || "研究暂无结果",
      viewpoints: [],
      keyArguments: {},
      suggestion: "",
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(researchData),
      },
    ],
  };
}

async function handlePolishContent(
  accessToken: string,
  args: { topic: string; viewpoint: string; mode?: string },
) {
  const { topic, viewpoint, mode = "deep" } = args;
  const sessionId = `polish-${Date.now()}`;

  let prompt: string;
  if (mode === "quick") {
    prompt = `你是一位高效的知乎编辑。将用户的观点快速打磨成 100-300 字的知乎想法（Pin）。
要求：有一个吸引人的开头 hook，核心观点清晰，语气真诚自然。
输出纯文本，不要使用 markdown 格式，用空行分段。
直接输出最终版本，不要解释。

话题：${topic}

用户的观点：${viewpoint}`;
  } else {
    prompt = `你是一位资深知乎编辑。将用户的观点打磨成一篇 600-800 字的知乎回答。
要求：先 hook 后论证，语气真诚，结构清晰，有数据或案例支撑。
输出纯文本，不要使用 markdown 格式，用空行分段。
直接输出最终版本，不要解释。

话题：${topic}

用户的观点：${viewpoint}`;
  }

  const result = await collectChatResponse(accessToken, sessionId, prompt);

  return {
    content: [
      {
        type: "text" as const,
        text: result,
      },
    ],
  };
}

// ---- Main handler ----

export async function POST(request: NextRequest) {
  // 1. Auth: extract bearer token
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      jsonRpcError(null, -32001, "Missing or invalid Authorization header"),
      { status: 401 },
    );
  }
  const bearerToken = authHeader.slice(7);
  if (!bearerToken) {
    return NextResponse.json(
      jsonRpcError(null, -32001, "Empty bearer token"),
      { status: 401 },
    );
  }

  // 2. Parse JSON-RPC request
  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      jsonRpcError(null, -32700, "Parse error"),
      { status: 200 },
    );
  }

  // Notifications have no id — handle and return empty
  const isNotification = body.id === undefined || body.id === null;

  // 3. Handle initialize
  if (body.method === "initialize") {
    const result = jsonRpcResult(body.id ?? null, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: {
        name: "viewpoint-agent",
        version: "1.0.0",
      },
    });
    return NextResponse.json(result);
  }

  // 4. Handle notifications/initialized — no response needed
  if (body.method === "notifications/initialized") {
    return new NextResponse(null, { status: 204 });
  }

  // 5. Handle tools/list
  if (body.method === "tools/list") {
    return NextResponse.json(jsonRpcResult(body.id ?? null, { tools: TOOLS }));
  }

  // 6. Handle tools/call — requires auth verification
  if (body.method === "tools/call") {
    const toolName = body.params?.name as string | undefined;
    const toolArgs = (body.params?.arguments || {}) as Record<string, unknown>;

    if (!toolName) {
      return NextResponse.json(
        jsonRpcResult(body.id ?? null, {
          content: [{ type: "text", text: "Missing tool name" }],
          isError: true,
        }),
      );
    }

    // Resolve user (for tools that need user context)
    const user = await resolveUser(bearerToken);
    if (!user) {
      return NextResponse.json(
        jsonRpcResult(body.id ?? null, {
          content: [
            { type: "text", text: "Token 无效或已过期，请重新授权" },
          ],
          isError: true,
        }),
      );
    }

    try {
      let result: { content: { type: string; text: string }[] };

      switch (toolName) {
        case "search_hot_topics":
          result = await handleSearchHotTopics(user.accessToken, {
            limit: toolArgs.limit as number | undefined,
            hours: toolArgs.hours as number | undefined,
          });
          break;

        case "research_topic":
          if (!toolArgs.topic || typeof toolArgs.topic !== "string") {
            return NextResponse.json(
              jsonRpcResult(body.id ?? null, {
                content: [
                  { type: "text", text: "缺少 topic 参数" },
                ],
                isError: true,
              }),
            );
          }
          result = await handleResearchTopic(user.accessToken, {
            topic: toolArgs.topic as string,
          });
          break;

        case "polish_content":
          if (
            !toolArgs.topic ||
            !toolArgs.viewpoint ||
            typeof toolArgs.topic !== "string" ||
            typeof toolArgs.viewpoint !== "string"
          ) {
            return NextResponse.json(
              jsonRpcResult(body.id ?? null, {
                content: [
                  {
                    type: "text",
                    text: "缺少 topic 或 viewpoint 参数",
                  },
                ],
                isError: true,
              }),
            );
          }
          result = await handlePolishContent(user.accessToken, {
            topic: toolArgs.topic as string,
            viewpoint: toolArgs.viewpoint as string,
            mode: (toolArgs.mode as string) || "deep",
          });
          break;

        default:
          return NextResponse.json(
            jsonRpcResult(body.id ?? null, {
              content: [
                { type: "text", text: `Unknown tool: ${toolName}` },
              ],
              isError: true,
            }),
          );
      }

      return NextResponse.json(jsonRpcResult(body.id ?? null, result));
    } catch (err) {
      console.error(`[MCP] Tool ${toolName} error:`, err);
      return NextResponse.json(
        jsonRpcResult(body.id ?? null, {
          content: [
            { type: "text", text: `工具调用失败: ${String(err)}` },
          ],
          isError: true,
        }),
      );
    }
  }

  // 7. Unknown method
  return NextResponse.json(
    jsonRpcResult(body.id ?? null, {
      content: [{ type: "text", text: `Unknown method: ${body.method}` }],
      isError: true,
    }),
  );
}
