"use client";

import { useEffect, useState, useRef } from "react";
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

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: "Owner Agent", color: "bg-blue-500" },
  researcher: { label: "研究员 Agent", color: "bg-emerald-500" },
  challenger: { label: "挑战者 Agent", color: "bg-amber-500" },
  editor: { label: "编辑 Agent", color: "bg-purple-500" },
  system: { label: "系统", color: "bg-gray-400" },
  error: { label: "错误", color: "bg-red-500" },
};

export default function WorkshopPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<UserState | null>(null);
  const [step, setStep] = useState<"write" | "collab">("write");
  const [userViewpoint, setUserViewpoint] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [running, setRunning] = useState(false);
  const [articleId, setArticleId] = useState<string | null>(null);
  const topicId = searchParams.get("topicId") || "";
  const rawTitle = searchParams.get("title") || "未知话题";
  const topicTitle = decodeURIComponent(rawTitle);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleSubmitViewpoint = () => {
    if (!userViewpoint.trim()) return;
    setStep("collab");
  };

  const startWorkshop = async () => {
    setRunning(true);
    setMessages([{ role: "system", content: "正在准备 A2A 协作环境..." }]);

    try {
      const sessionsRes = await fetch("/api/sessions");
      const sessionsData = await sessionsRes.json();
      const sessionId = sessionsData.data?.[0]?.id || sessionsData.data?.sessions?.[0]?.id || "default";

      const res = await fetch("/api/workshop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId,
          title: topicTitle,
          materials: userViewpoint,
          sessionId,
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar userName={user?.name || undefined} userAvatar={user?.avatar || undefined} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">A2A 协作工坊</h1>
          <p className="text-sm text-muted">选题：{topicTitle}</p>
        </div>

        {/* Step 1: User writes viewpoint */}
        {step === "write" && (
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-medium mb-2">写下你的观点</h2>
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
                写好了，开始协作
              </button>
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs font-medium text-muted mb-2">不知道怎么写？试试从这些问题开始：</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => setUserViewpoint(prev => prev + (prev ? "\n" : "") + "我的亲身经历是：")}
                  className="text-left text-xs text-muted hover:text-foreground bg-background border border-border rounded-lg px-3 py-2 transition-colors cursor-pointer"
                >
                  我的亲身经历是……
                </button>
                <button
                  onClick={() => setUserViewpoint(prev => prev + (prev ? "\n" : "") + "我觉得这个问题的关键在于：")}
                  className="text-left text-xs text-muted hover:text-foreground bg-background border border-border rounded-lg px-3 py-2 transition-colors cursor-pointer"
                >
                  我觉得这个问题的关键在于……
                </button>
                <button
                  onClick={() => setUserViewpoint(prev => prev + (prev ? "\n" : "") + "我跟别人的看法不太一样，因为：")}
                  className="text-left text-xs text-muted hover:text-foreground bg-background border border-border rounded-lg px-3 py-2 transition-colors cursor-pointer"
                >
                  我跟别人的看法不太一样，因为……
                </button>
                <button
                  onClick={() => setUserViewpoint(prev => prev + (prev ? "\n" : "") + "如果非要给个建议的话，我会说：")}
                  className="text-left text-xs text-muted hover:text-foreground bg-background border border-border rounded-lg px-3 py-2 transition-colors cursor-pointer"
                >
                  如果非要给个建议的话，我会说……
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: A2A Collaboration */}
        {step === "collab" && (
          <>
            {/* User's original viewpoint */}
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">你</span>
                <span className="text-sm font-medium text-blue-800">你的观点</span>
              </div>
              <p className="text-sm text-blue-700 whitespace-pre-wrap">{userViewpoint}</p>
            </div>

            <div className="bg-card rounded-xl border border-border overflow-hidden">
              {/* Messages area */}
              <div className="h-[55vh] overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center py-16 text-muted">
                    <p className="mb-4">Agent 将基于你的观点进行协作创作</p>
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
                    onClick={() => router.push(`/publish?articleId=${articleId || ""}&title=${encodeURIComponent(topicTitle)}`)}
                    className="px-4 py-2 bg-success text-white text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    查看最终结果
                  </button>
                )}
                {running ? (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    协作进行中...
                  </div>
                ) : (
                  <span className="text-xs text-muted">4 个 Agent 将参与协作</span>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
