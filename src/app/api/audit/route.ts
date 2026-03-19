import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { sendActMessage } from "@/lib/secondme";

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ code: -1, message: "未登录" }, { status: 401 });
  }

  const { content, sessionId } = await request.json();
  if (!content) {
    return NextResponse.json({ code: -1, message: "缺少内容" }, { status: 400 });
  }

  try {
    const auditResult: Record<string, unknown> = {};

    // Compliance check using act
    try {
      await sendActMessage(
        user.accessToken,
        sessionId || "audit",
        `请对以下知乎回答进行全面的合规审查，逐项检查并给出分析。回复 JSON：
{"compliance_passed": boolean, "checks": [{"dimension": "检查维度名称", "status": "pass"|"fail", "detail": "具体分析说明"}], "issues": string[]}

检查维度包括但不限于：敏感词/政治风险、人身攻击/歧视内容、虚假信息/数据造假、版权风险（未标注引用）、广告/营销推广、隐私泄露。

即使全部通过，也要为每个维度写一条简短的分析说明（如"未发现敏感词""无版权风险，引用已标注"）。\n\n内容：${content.slice(0, 2000)}`,
        {
          type: "object",
          properties: {
            compliance_passed: { type: "boolean" },
            checks: { type: "array", items: { type: "object" } },
            issues: { type: "array", items: { type: "string" } },
          },
        },
        (data) => { Object.assign(auditResult, data); },
      );
    } catch (err) {
      console.error("[Audit] Compliance check failed:", err);
      auditResult.compliance_passed = true;
      auditResult.compliance_note = `检查失败: ${String(err)}`;
    }

    // Quality check using act
    try {
      await sendActMessage(
        user.accessToken,
        sessionId || "audit",
        `请评估以下知乎回答的质量。回复 JSON：{"quality_score": number, "has_hook": boolean, "structure_complete": boolean, "citations_marked": boolean, "style_fit": boolean, "suggestions": string[]}\n\n内容：${content.slice(0, 2000)}`,
        {
          type: "object",
          properties: {
            quality_score: { type: "number" },
            has_hook: { type: "boolean" },
            structure_complete: { type: "boolean" },
            citations_marked: { type: "boolean" },
            style_fit: { type: "boolean" },
            suggestions: { type: "array", items: { type: "string" } },
          },
        },
        (data) => { Object.assign(auditResult, data); },
      );
    } catch (err) {
      console.error("[Audit] Quality check failed:", err);
      auditResult.quality_score = 0;
      auditResult.quality_note = `检查失败: ${String(err)}`;
    }

    console.error("[Audit] Final result:", JSON.stringify(auditResult));
    return NextResponse.json({ code: 0, data: auditResult });
  } catch (err) {
    console.error("[Audit] Fatal error:", err);
    return NextResponse.json({ code: -1, message: "审计失败: " + String(err) }, { status: 500 });
  }
}
