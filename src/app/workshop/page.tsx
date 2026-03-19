"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";

interface Message {
  role: string;
  content: string;
}

interface UserState {
  name: string | null;
  avatar: string | null;
}

interface SearchResult {
  title: string;
  authorName: string;
  voteUpCount: number;
  contentSnippet: string;
}

interface Viewpoint {
  stance: string;
  percentage: number;
  summary: string;
  color: string;
}

interface ResearchData {
  materialNote: string;
  viewpoints: Viewpoint[];
  keyArguments: { [key: string]: string[] };
  userContext: string;
  suggestion: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: "Owner Agent", color: "bg-blue-500" },
  researcher: { label: "研究员 Agent", color: "bg-emerald-500" },
  challenger: { label: "挑战者 Agent", color: "bg-amber-500" },
  editor: { label: "编辑 Agent", color: "bg-purple-500" },
  system: { label: "系统", color: "bg-gray-400" },
  error: { label: "错误", color: "bg-red-500" },
};

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  purple: "bg-purple-500",
  rose: "bg-rose-500",
};

const COLOR_TEXT_MAP: Record<string, string> = {
  blue: "text-blue-700",
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  purple: "text-purple-700",
  rose: "text-rose-700",
};

const COLOR_BG_MAP: Record<string, string> = {
  blue: "bg-blue-50 border-blue-200",
  emerald: "bg-emerald-50 border-emerald-200",
  amber: "bg-amber-50 border-amber-200",
  purple: "bg-purple-50 border-purple-200",
  rose: "bg-rose-50 border-rose-200",
};

function WorkshopContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<UserState | null>(null);
  const [step, setStep] = useState<"research" | "write" | "mode" | "collab">("research");
  const [userViewpoint, setUserViewpoint] = useState("");
  const [mode, setMode] = useState<"quick" | "deep">("deep");
  const [messages, setMessages] = useState<Message[]>([]);
  const [running, setRunning] = useState(false);
  const [articleId, setArticleId] = useState<string | null>(null);
  const topicId = searchParams.get("topicId") || "";
  const rawTitle = searchParams.get("title") || "未知话题";
  const topicTitle = decodeURIComponent(rawTitle);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Research state
  const [researchLoading, setResearchLoading] = useState(false);
  const [materialNote, setMaterialNote] = useState("");
  const [researchData, setResearchData] = useState<ResearchData | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [sessionId, setSessionId] = useState("research");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/user/info")
      .then((res) => {
        if (res.status === 401) { router.push("/"); return null; }
        return res.json();
      })
      .then((data) => {
        if (data?.code === 0 && data.data) {
          setUser({ name: data.data.nickname || data.data.name, avatar: data.data.avatar });
        }
      });
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Step 1: Research
  const handleStartResearch = async () => {
    setResearchLoading(true);
    setResearchData(null);
    setChatMessages([]);
    try {
      const sessionsRes = await fetch("/api/sessions");
      const sessionsData = await sessionsRes.json();
      const sid = sessionsData.data?.[0]?.id || sessionsData.data?.sessions?.[0]?.id || "default";
      setSessionId(sid);

      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: topicTitle, sessionId: sid }),
      });
      const data = await res.json();
      if (data.code === 0 && data.data) {
        setMaterialNote(data.data.materialNote || "");
        setSearchResults(data.data.searchResults || []);
        setResearchData({
          materialNote: data.data.materialNote || "",
          viewpoints: data.data.viewpoints || [],
          keyArguments: data.data.keyArguments || {},
          userContext: data.data.userContext || "",
          suggestion: data.data.suggestion || "",
        });
      } else {
        setMaterialNote("研究失败：" + (data.message || "未知错误"));
      }
    } catch (err) {
      setMaterialNote("研究请求失败，你可以直接跳过这一步，基于自己的观点开始创作。");
    } finally {
      setResearchLoading(false);
    }
  };

  // Research chat
  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          sessionId,
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let assistantContent = "";
      let buffer = "";

      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                assistantContent += parsed.content;
                setChatMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                  return updated;
                });
              }
            } catch {}
          }
        }
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "抱歉，回复出错了，请重试。" },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Skip research
  const handleSkipResearch = () => {
    setStep("write");
  };

  // Step 2: Submit viewpoint
  const handleSubmitViewpoint = () => {
    if (!userViewpoint.trim()) return;
    setStep("mode");
  };

  // Step 4: Start A2A collaboration
  const startWorkshop = async () => {
    setRunning(true);
    setMessages([{ role: "system", content: `正在准备 A2A 协作环境... (${mode === "quick" ? "闪念模式" : "深度模式"})` }]);

    try {
      const sessionsRes = await fetch("/api/sessions");
      const sessionsData = await sessionsRes.json();
      const sid = sessionsData.data?.[0]?.id || sessionsData.data?.sessions?.[0]?.id || "default";

      const res = await fetch("/api/workshop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId,
          title: topicTitle,
          materials: userViewpoint,
          sessionId: sid,
          mode,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setMessages((prev) => [...prev, { role: "error", content: `服务端错误 (${res.status}): ${errText}` }]);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.role === "article_id") {
                setArticleId(parsed.content);
              }
              setMessages((prev) => [...prev, { role: parsed.role, content: parsed.content }]);
            } catch {
              setMessages((prev) => [...prev, { role: "system", content: data }]);
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "error", content: String(err) }]);
    } finally {
      setRunning(false);
    }
  };

  // Compute total for proportion bar
  const totalPercentage = researchData?.viewpoints.reduce((s, v) => s + v.percentage, 0) || 100;

  return (
    <div className="min-h-screen bg-background">
      <Navbar userName={user?.name || undefined} userAvatar={user?.avatar || undefined} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">A2A 协作工坊</h1>
          <p className="text-sm text-muted">选题：{topicTitle}</p>
          {/* Step indicator */}
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            {(["research", "write", "mode", "collab"] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <span className="text-border">—</span>}
                <span className={step === s ? "text-primary font-medium" : ""}>
                  {s === "research" && "研究"}
                  {s === "write" && "输出观点"}
                  {s === "mode" && "模式"}
                  {s === "collab" && "协作"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ========== Step 1: Research ========== */}
        {step === "research" && (
          <div className="space-y-4">
            {/* Loading / action buttons (before research) */}
            {researchLoading && (
              <div className="flex flex-col items-center py-12">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm text-muted">Agent 正在搜索知乎并分析观点...</p>
                <p className="text-xs text-muted mt-1">通常需要 10-20 秒</p>
              </div>
            )}

            {!researchLoading && !researchData && (
              <div className="flex gap-3">
                <button
                  onClick={handleStartResearch}
                  className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                >
                  开始研究
                </button>
                <button
                  onClick={handleSkipResearch}
                  className="px-6 py-2 border border-border text-sm rounded-lg hover:bg-card-hover transition-colors cursor-pointer"
                >
                  跳过，直接输出观点
                </button>
              </div>
            )}

            {/* Research results visualization */}
            {researchData && !researchLoading && (
              <div className="space-y-4">
                {/* Viewpoint proportion bar */}
                {researchData.viewpoints.length > 0 && (
                  <div className="bg-card rounded-xl border border-border p-6">
                    <h3 className="text-sm font-medium mb-3">观点分布</h3>
                    {/* Stacked bar */}
                    <div className="flex h-4 rounded-full overflow-hidden mb-4">
                      {researchData.viewpoints.map((vp, i) => (
                        <div
                          key={i}
                          className={`${COLOR_MAP[vp.color] || "bg-blue-500"} transition-all`}
                          style={{ width: `${(vp.percentage / totalPercentage) * 100}%` }}
                          title={`${vp.stance}: ${vp.percentage}%`}
                        />
                      ))}
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-3">
                      {researchData.viewpoints.map((vp, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs">
                          <span className={`w-2.5 h-2.5 rounded-sm ${COLOR_MAP[vp.color] || "bg-blue-500"}`} />
                          <span className="font-medium">{vp.percentage}%</span>
                          <span className="text-muted">{vp.stance}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Viewpoint cards */}
                {researchData.viewpoints.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {researchData.viewpoints.map((vp, i) => (
                      <div key={i} className={`rounded-lg border p-4 ${COLOR_BG_MAP[vp.color] || "bg-blue-50 border-blue-200"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-medium text-sm ${COLOR_TEXT_MAP[vp.color] || "text-blue-700"}`}>
                            {vp.stance}
                          </span>
                          <span className="text-xs font-bold text-foreground">{vp.percentage}%</span>
                        </div>
                        <p className="text-xs text-muted">{vp.summary}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Key arguments */}
                {researchData.keyArguments && Object.keys(researchData.keyArguments).length > 0 && (
                  <div className="bg-card rounded-xl border border-border p-6">
                    <h3 className="text-sm font-medium mb-3">关键论据</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {Object.entries(researchData.keyArguments).map(([side, args]) => (
                        <div key={side}>
                          <h4 className="text-xs font-medium text-muted mb-2">{side}</h4>
                          <ul className="space-y-1.5">
                            {(args as string[]).map((arg, i) => (
                              <li key={i} className="text-xs text-foreground flex items-start gap-2">
                                <span className="shrink-0 text-primary mt-0.5">•</span>
                                {arg}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* User context + suggestion */}
                {(researchData.userContext || researchData.suggestion) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {researchData.userContext && (
                      <div className="bg-card rounded-lg border border-border p-4">
                        <h4 className="text-xs font-medium text-muted mb-1">与你相关</h4>
                        <p className="text-xs text-foreground">{researchData.userContext}</p>
                      </div>
                    )}
                    {researchData.suggestion && (
                      <div className="bg-card rounded-lg border border-border p-4">
                        <h4 className="text-xs font-medium text-muted mb-1">切入建议</h4>
                        <p className="text-xs text-foreground">{researchData.suggestion}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Search results */}
                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted">相关高赞回答</h4>
                    {searchResults.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted bg-card border border-border rounded-lg px-3 py-2">
                        <span className="shrink-0">{r.authorName}</span>
                        <span className="shrink-0 text-primary">{r.voteUpCount}赞</span>
                        <span className="truncate">{r.title}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Chat area */}
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <h4 className="text-sm font-medium">有问题想深入讨论？</h4>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto p-4 space-y-3">
                    {chatMessages.length === 0 && (
                      <p className="text-xs text-muted text-center py-4">
                        输入你的问题，Agent 会基于研究结果回答
                      </p>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] text-sm rounded-lg px-3 py-2 ${
                          msg.role === "user"
                            ? "bg-primary text-white"
                            : "bg-background border border-border text-foreground"
                        }`}>
                          <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="bg-background border border-border rounded-lg px-3 py-2 text-xs text-muted">
                          Agent 正在思考...
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  {/* Chat input */}
                  <div className="border-t border-border p-3 flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                      placeholder="输入问题，深入讨论..."
                      className="flex-1 text-sm px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <button
                      onClick={handleSendChat}
                      disabled={!chatInput.trim() || chatLoading}
                      className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      发送
                    </button>
                  </div>
                  {/* Action buttons */}
                  <div className="px-4 pb-4 flex gap-3">
                    <button
                      onClick={() => setStep("write")}
                      className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                    >
                      我了解了，输出观点
                    </button>
                    <button
                      onClick={handleStartResearch}
                      className="px-4 py-2 border border-border text-sm rounded-lg hover:bg-card-hover transition-colors cursor-pointer"
                    >
                      重新研究
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== Step 2: Write Viewpoint ========== */}
        {step === "write" && (
          <>
            {/* Show material note if available */}
            {materialNote && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-blue-800">研究笔记（供参考）</span>
                  <button
                    onClick={() => setMaterialNote("")}
                    className="text-xs text-blue-500 hover:underline cursor-pointer"
                  >
                    收起
                  </button>
                </div>
                <p className="text-xs text-blue-700 whitespace-pre-wrap line-clamp-3">{materialNote}</p>
              </div>
            )}
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-medium mb-2">输出你的观点</h2>
              <p className="text-sm text-muted mb-4">
                Agent 会基于你的真实观点来扩充和打磨，不会编造。随便写几句就够，100 字左右最佳。
              </p>
              <textarea
                value={userViewpoint}
                onChange={(e) => setUserViewpoint(e.target.value)}
                placeholder={`关于「${topicTitle}」这个问题，我想说的是……（100字左右）`}
                className="w-full min-h-[150px] text-sm leading-relaxed p-3 bg-background border border-border rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <div className="mt-3 flex items-center justify-between">
                <span className={`text-xs ${userViewpoint.length >= 30 && userViewpoint.length <= 200 ? "text-success" : "text-muted"}`}>
                  {userViewpoint.length === 0
                    ? "写什么都行，越真实越好"
                    : userViewpoint.length < 30
                      ? `再写一点，${30 - userViewpoint.length} 字起`
                      : userViewpoint.length <= 200
                        ? `${userViewpoint.length} 字，可以了`
                        : `${userViewpoint.length} 字，可以提交`}
                </span>
                <button
                  onClick={handleSubmitViewpoint}
                  disabled={userViewpoint.length < 30}
                  className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  写好了，下一步
                </button>
              </div>
            </div>
          </>
        )}

        {/* ========== Step 3: Mode Selector ========== */}
        {step === "mode" && (
          <div className="bg-card rounded-xl border border-border p-6">
            {/* User's viewpoint summary */}
            <div className="mb-5 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">你</span>
                <span className="text-sm font-medium text-blue-800">你的观点</span>
                <button
                  onClick={() => setStep("write")}
                  className="text-xs text-blue-500 hover:underline cursor-pointer ml-auto"
                >
                  修改
                </button>
              </div>
              <p className="text-sm text-blue-700 whitespace-pre-wrap line-clamp-3">{userViewpoint}</p>
            </div>

            <h2 className="text-lg font-medium mb-1">选择创作模式</h2>
            <p className="text-sm text-muted mb-4">根据你的需求选择不同的创作深度</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Quick mode */}
              <button
                onClick={() => setMode("quick")}
                className={`text-left p-5 rounded-xl border-2 transition-all cursor-pointer ${
                  mode === "quick"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">💡</span>
                  <span className="font-medium">闪念模式</span>
                </div>
                <div className="text-xs text-muted space-y-1">
                  <p>1 个 Agent 协助包装</p>
                  <p>输出 100-300 字</p>
                  <p>约 30 秒完成</p>
                </div>
                <div className="mt-2 text-xs text-primary">
                  适合：有想法想快速发布
                </div>
              </button>

              {/* Deep mode */}
              <button
                onClick={() => setMode("deep")}
                className={`text-left p-5 rounded-xl border-2 transition-all cursor-pointer ${
                  mode === "deep"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">📝</span>
                  <span className="font-medium">深度模式</span>
                </div>
                <div className="text-xs text-muted space-y-1">
                  <p>4 个 Agent 协作打磨</p>
                  <p>输出 600-1000 字</p>
                  <p>约 3-5 分钟完成</p>
                </div>
                <div className="mt-2 text-xs text-primary">
                  适合：想认真写一篇深度回答
                </div>
              </button>
            </div>

            <button
              onClick={() => setStep("collab")}
              className="mt-5 px-6 py-2 bg-primary text-white rounded-lg hover:bg-secondary transition-colors cursor-pointer"
            >
              开始协作
            </button>
          </div>
        )}

        {/* ========== Step 4: A2A Collaboration ========== */}
        {step === "collab" && (
          <>
            {/* Mode & viewpoint summary */}
            <div className="mb-4 flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-full ${
                mode === "quick" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
              }`}>
                {mode === "quick" ? "💡 闪念模式" : "📝 深度模式"}
              </span>
              <span className="text-xs text-muted">基于你的观点进行协作</span>
            </div>

            <div className="bg-card rounded-xl border border-border overflow-hidden">
              {/* Messages area */}
              <div className="h-[55vh] overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center py-16 text-muted">
                    <p className="mb-4">
                      {mode === "quick"
                        ? "编辑 Agent 将快速包装你的观点"
                        : "4 个 Agent 将协作打磨你的观点"}
                    </p>
                    <button
                      onClick={startWorkshop}
                      className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                    >
                      开始协作
                    </button>
                  </div>
                )}

                {messages.map((msg, i) => {
                  const roleInfo = ROLE_LABELS[msg.role] || ROLE_LABELS.system;
                  return (
                    <div key={i} className="agent-message flex gap-3">
                      <div
                        className={`shrink-0 w-8 h-8 rounded-full ${roleInfo.color} flex items-center justify-center text-white text-xs font-medium`}
                      >
                        {roleInfo.label[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-muted mb-1">
                          {roleInfo.label}
                        </div>
                        <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Bottom bar */}
              <div className="border-t border-border p-4 flex items-center justify-between">
                {!running && messages.length > 0 && (
                  <button
                    onClick={() => router.push(`/publish?articleId=${articleId || ""}&title=${encodeURIComponent(topicTitle)}&mode=${mode}`)}
                    className="px-4 py-2 bg-success text-white text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    查看最终结果
                  </button>
                )}
                {running ? (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    {mode === "quick" ? "闪念生成中..." : "协作进行中..."}
                  </div>
                ) : (
                  <span className="text-xs text-muted">
                    {mode === "quick" ? "1 个 Agent" : "4 个 Agent"} 将参与协作
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function WorkshopPage() {
  return (
    <Suspense>
      <WorkshopContent />
    </Suspense>
  );
}
