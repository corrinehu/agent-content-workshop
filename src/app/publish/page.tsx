"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";

interface UserState {
  name: string | null;
  avatar: string | null;
}

export default function PublishPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<UserState | null>(null);
  const [content, setContent] = useState("");
  const [articleId, setArticleId] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<Record<string, unknown> | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const urlArticleId = searchParams.get("articleId");

    // Load user info
    fetch("/api/user/info")
      .then((res) => {
        if (res.status === 401) { router.push("/"); throw new Error("unauthorized"); }
        return res.json();
      })
      .then((data) => {
        if (data?.code === 0 && data.data) {
          setUser({ name: data.data.nickname || data.data.name, avatar: data.data.avatar });
        }
      })
      .catch(() => {});

    // Load article content
    const articleUrl = urlArticleId
      ? `/api/articles?articleId=${urlArticleId}`
      : "/api/articles";

    fetch(articleUrl)
      .then((res) => res.json())
      .then((data) => {
        if (data.code === 0 && data.data) {
          setContent(data.data.content || "");
          setArticleId(data.data.id);
        }
      })
      .catch(() => {});
  }, [router, searchParams]);

  const handleAudit = async () => {
    if (!content) return;
    setAuditing(true);
    setAuditError(null);
    setAuditResult(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, sessionId: "audit-session" }),
      });
      const data = await res.json();
      if (data.code === 0 && data.data) {
        setAuditResult(data.data);
      } else {
        setAuditError(data.message || "审计失败，请重试");
      }
    } catch (err) {
      setAuditError("网络错误，请检查连接后重试");
    } finally {
      setAuditing(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: articleId || "latest" }),
      });
      const data = await res.json();
      if (data.code === 0) {
        alert("发布成功！");
      } else {
        alert("发布失败：" + (data.message || "未知错误"));
      }
    } catch {
      alert("发布失败，请重试");
    } finally {
      setPublishing(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar userName={user?.name || undefined} userAvatar={user?.avatar || undefined} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">发布预览</h1>
            <p className="text-sm text-muted">审计通过后发布到知乎</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAudit}
              disabled={auditing || !content}
              className={`px-4 py-2 text-sm rounded-lg transition-colors cursor-pointer ${
                auditing || !content
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-primary text-white hover:bg-secondary"
              }`}
            >
              {auditing ? "审计中..." : "质量审计"}
            </button>
            <button
              onClick={handleCopy}
              disabled={!content}
              className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-card-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copied ? "已复制" : "复制内容"}
            </button>
            <button
              onClick={handlePublish}
              disabled={
                publishing ||
                !content ||
                !auditResult ||
                auditing ||
                auditResult.compliance_passed === false
              }
              className="px-4 py-2 text-sm bg-success text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title={
                !auditResult
                  ? "请先完成质量审计"
                  : auditResult.compliance_passed === false
                    ? "合规检查未通过，无法发布"
                    : undefined
              }
            >
              {publishing ? "发布中..." : "发布到圈子"}
            </button>
          </div>
        </div>

        {/* Publish status hint */}
        {!auditResult && !auditing && content && (
          <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            <span className="shrink-0">&#9888;</span>
            请先点击「质量审计」，审计通过后才能发布
          </div>
        )}
        {auditResult && auditResult.compliance_passed === false && !auditing && (
          <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            <span className="shrink-0">&#10060;</span>
            合规检查未通过，请修改内容后重新审计
          </div>
        )}
        {auditResult && auditResult.compliance_passed === true && !auditing && (
          <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            <span className="shrink-0">&#9989;</span>
            审计通过，可以发布。如有建议可先修改内容，再点击「重新审计」
          </div>
        )}

        {/* Audit section - always visible as a panel */}
        {(auditing || auditResult || auditError) && (
          <div className="mb-6 bg-card rounded-xl border border-border p-4">
            <h3 className="font-medium mb-3">审计报告</h3>

            {/* Loading state */}
            {auditing && (
              <div className="flex flex-col items-center py-8">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm text-muted">AI 正在进行合规检查和质量评估...</p>
                <p className="text-xs text-muted mt-1">通常需要 15-30 秒</p>
              </div>
            )}

            {/* Error state */}
            {auditError && !auditing && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-600 font-medium">审计失败</p>
                <p className="text-sm text-red-500 mt-1">{auditError}</p>
                <button
                  onClick={handleAudit}
                  className="mt-2 text-sm text-primary hover:underline cursor-pointer"
                >
                  重新审计
                </button>
              </div>
            )}

            {/* Success state */}
            {auditResult && !auditing && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {auditResult.compliance_passed !== undefined && (
                    <div className="text-center p-2">
                      <div className={`text-lg font-bold ${auditResult.compliance_passed ? "text-success" : "text-red-500"}`}>
                        {auditResult.compliance_passed ? "通过" : "未通过"}
                      </div>
                      <div className="text-xs text-muted">合规检查</div>
                    </div>
                  )}
                  {auditResult.quality_score !== undefined && (
                    <div className="text-center p-2">
                      <div className="text-lg font-bold">{String(auditResult.quality_score)}/10</div>
                      <div className="text-xs text-muted">质量评分</div>
                    </div>
                  )}
                  {auditResult.has_hook !== undefined && (
                    <div className="text-center p-2">
                      <div className={`text-lg font-bold ${auditResult.has_hook ? "text-success" : "text-warning"}`}>
                        {auditResult.has_hook ? "有" : "无"}
                      </div>
                      <div className="text-xs text-muted">Hook</div>
                    </div>
                  )}
                  {auditResult.style_fit !== undefined && (
                    <div className="text-center p-2">
                      <div className={`text-lg font-bold ${auditResult.style_fit ? "text-success" : "text-warning"}`}>
                        {auditResult.style_fit ? "匹配" : "不匹配"}
                      </div>
                      <div className="text-xs text-muted">知乎风格</div>
                    </div>
                  )}
                </div>
                {Boolean(auditResult.checks) && Array.isArray(auditResult.checks) && (
                  <div className="mt-3 space-y-1">
                    <div className="text-sm font-medium mb-2">合规明细</div>
                    {(auditResult.checks as Array<{dimension: string; status: string; detail: string}>).map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${c.status === "pass" ? "bg-success" : "bg-red-500"}`} />
                        <span className="text-muted">{c.dimension}：</span>
                        <span>{String(c.detail)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {Boolean(auditResult.suggestions) && Array.isArray(auditResult.suggestions) && (
                  <div className="mt-3">
                    <div className="text-sm font-medium mb-2">改进建议</div>
                    <ul className="space-y-1">
                      {(auditResult.suggestions as string[]).map((s, i) => (
                        <li key={i} className="text-sm text-muted flex items-start gap-2">
                          <span className="shrink-0 text-primary mt-0.5">{i + 1}.</span>
                          <span>{String(s)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  onClick={handleAudit}
                  className="mt-3 text-sm text-primary hover:underline cursor-pointer"
                >
                  重新审计
                </button>
              </>
            )}
          </div>
        )}

        {/* Content area - editable */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">文章内容</span>
            {content && (
              <span className="text-xs text-muted">可直接编辑修改，修改后再审计或发布</span>
            )}
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="协作工坊完成后，最终内容将显示在这里。你也可以直接粘贴或编辑内容。"
            className="w-full min-h-[400px] text-sm leading-relaxed p-3 bg-background border border-border rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </main>
    </div>
  );
}
