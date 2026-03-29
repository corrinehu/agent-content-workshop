"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

interface Topic {
  zhihuId: string;
  title: string;
  excerpt: string;
  heatScore: number;
  matchScore: number;
  answerCount: number;
  matched: boolean;
  source: string;
  publishedTime: string;
  views: number;
  likes: number;
  comments: number;
  linkUrl: string;
}

interface UserState {
  name: string | null;
  avatar: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserState | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const [userRes, topicsRes] = await Promise.all([
          fetch("/api/user/info"),
          fetch("/api/topics"),
        ]);

        if (userRes.status === 401) {
          router.push("/");
          return;
        }

        const userData = await userRes.json();
        if (userData.code === 0 && userData.data) {
          setUser({
            name: userData.data.nickname || userData.data.name,
            avatar: userData.data.avatar,
          });
        }

        const topicsData = await topicsRes.json();
        if (topicsData.code === 0) {
          setTopics(topicsData.data.topics || []);
          setInterests(topicsData.data.interests || []);
        }
      } catch {
        setError("加载数据失败");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [router]);

  const handleStartResearch = async (topic: Topic) => {
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zhihuId: topic.zhihuId,
          title: topic.title,
          excerpt: topic.excerpt,
          heatScore: topic.heatScore,
          answerCount: topic.answerCount,
        }),
      });
      const data = await res.json();
      const topicId = data.data?.id || data.data?.topicId || "";
      router.push(`/workshop?topicId=${topicId}&title=${encodeURIComponent(topic.title)}`);
    } catch {
      setError("启动研究失败");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar userName={user?.name || undefined} userAvatar={user?.avatar || undefined} />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">选题看板</h1>
          <p className="text-sm text-muted mb-3">
            知乎热榜话题，基于你的兴趣标签智能推荐
          </p>

          {interests.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted">你的兴趣：</span>
              {interests.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 bg-primary-light text-primary text-xs rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4">
          {topics.map((topic, index) => (
            <div
              key={topic.zhihuId}
              className="bg-card rounded-xl border border-border p-5 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {topic.matched && (
                      <span className="px-1.5 py-0.5 bg-success text-white text-xs rounded font-medium">
                        为你推荐
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                      {topic.source}
                    </span>
                  </div>
                  <h3 className="font-medium mb-1 text-foreground">{topic.title}</h3>
                  <p className="text-sm text-muted line-clamp-2">{topic.excerpt}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                    <span>{topic.views > 0 ? `${(topic.views / 10000).toFixed(0)}万浏览` : ""}</span>
                    <span>{topic.likes} 赞</span>
                    <span>{topic.comments} 评论</span>
                    <span>{topic.publishedTime}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleStartResearch(topic)}
                  className="shrink-0 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                >
                  让 Agent 研究一下
                </button>
              </div>
            </div>
          ))}
        </div>

        {topics.length === 0 && !loading && (
          <div className="text-center py-16 text-muted">
            暂无热榜话题，稍后再来看看
          </div>
        )}
      </main>
    </div>
  );
}
