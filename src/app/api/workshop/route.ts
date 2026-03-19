import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendChatMessage } from "@/lib/secondme";

const SYSTEM_PROMPTS = {
  researcher: "你是一位专业的研究员 Agent。为知乎回答补充数据支撑和案例。只补充 2-3 个关键数据点或案例，每个用一两句话说明，保持精炼。不要长篇大论。",
  challenger: "你是一位严格的挑战者 Agent。对知乎回答草稿提出质疑，找出逻辑漏洞。只提出 1-2 个最核心的问题，每个用一两句话说明。回复要简短直接。",
  editor: "你是一位资深知乎编辑 Agent。打磨内容为知乎发布风格：先 hook 后论证，语气真诚。重要：必须输出完整内容，控制在 600-800 字，不要截断，不要省略段落结尾。直接输出最终版本，不要解释你做了什么修改。",
};

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ code: -1, message: "未登录" }, { status: 401 });
  }

  const { topicId, title, materials, sessionId } = await request.json();

  // Try to find topic in DB, fallback to using title directly
  let topicTitle = title || "未知话题";
  try {
    if (topicId) {
      const topic = await prisma.topic.findUnique({ where: { id: topicId } });
      if (topic) topicTitle = topic.title;
    }
  } catch {
    // Continue with title from request
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (role: string, content: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ role, content })}\n\n`));
      };

      try {
        // Step 1: Owner Agent proposes core argument
        sendEvent("system", "开始 A2A 协作创作...");
        sendEvent("owner", `正在让 Owner Agent 基于素材提出核心论点...`);

        let ownerDraft = "";
        await sendChatMessage(
          user.accessToken,
          sessionId,
          `针对知乎问题"${topicTitle}"，以下是一位用户写下的真实观点和经历。请基于这些真实素材来构建回答框架，不要编造用户的经历。控制在 300 字以内。\n\n用户的真实观点：\n${materials}`,
          (chunk) => { ownerDraft += chunk; },
        );
        sendEvent("owner", ownerDraft);

        // Step 2: Researcher supplements data
        sendEvent("system", "研究员 Agent 正在补充数据支撑...");
        let researchDraft = "";
        await sendChatMessage(
          user.accessToken,
          sessionId,
          `${SYSTEM_PROMPTS.researcher}\n\n以下是某人的回答草稿，请补充数据支撑和案例佐证：\n${ownerDraft}\n\n可用素材：${materials}`,
          (chunk) => { researchDraft += chunk; },
        );
        sendEvent("researcher", researchDraft);

        // Step 3: Challenger raises critiques
        sendEvent("system", "挑战者 Agent 正在提出质疑...");
        let critique = "";
        await sendChatMessage(
          user.accessToken,
          sessionId,
          `${SYSTEM_PROMPTS.challenger}\n\n回答草稿：\n${ownerDraft}\n\n补充数据：${researchDraft}`,
          (chunk) => { critique += chunk; },
        );
        sendEvent("challenger", critique);

        // Step 4: Owner responds to critique
        sendEvent("system", "Owner Agent 正在回应质疑...");
        let refinedDraft = "";
        await sendChatMessage(
          user.accessToken,
          sessionId,
          `你的回答被质疑：${critique}\n请回应质疑，调整论点，控制在 300 字以内。`,
          (chunk) => { refinedDraft += chunk; },
        );
        sendEvent("owner", refinedDraft);

        // Step 5: Editor polishes
        sendEvent("system", "编辑 Agent 正在打磨最终版本...");
        let finalDraft = "";
        await sendChatMessage(
          user.accessToken,
          sessionId,
          `${SYSTEM_PROMPTS.editor}\n\n重要：请输出完整版本，不要省略任何段落，不要在中间截断。篇幅控制在 800 字以内，确保每个部分都有开头和结尾。\n\n原文：\n${refinedDraft}`,
          (chunk) => { finalDraft += chunk; },
        );
        sendEvent("editor", finalDraft);
        sendEvent("system", "协作完成！");

        // Save article
        try {
          let articleTopicId = topicId;
          // Ensure topic exists in DB for foreign key
          if (topicId) {
            const existing = await prisma.topic.findUnique({ where: { id: topicId } });
            if (!existing) {
              const newTopic = await prisma.topic.create({
                data: { userId: user.id, title: topicTitle, status: "working" },
              });
              articleTopicId = newTopic.id;
            }
          }
          await prisma.article.create({
            data: {
              userId: user.id,
              topicId: articleTopicId,
              title: topicTitle,
              content: finalDraft,
              status: "draft",
            },
          });
        } catch (err) {
          console.warn("Failed to save article:", err);
          sendEvent("system", "文章已生成，但保存失败，不影响预览和复制。");
        }

        // Fetch the saved article to get its ID
        const savedArticle = await prisma.article.findFirst({
          where: { userId: user.id, title: topicTitle, status: "draft" },
          orderBy: { createdAt: "desc" },
        });
        if (savedArticle) {
          sendEvent("article_id", savedArticle.id);
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        sendEvent("error", String(err));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
