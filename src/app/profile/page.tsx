"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

interface UserState {
  name: string | null;
  avatar: string | null;
}

interface ShadeItem {
  name?: string;
  tag?: string;
  text?: string;
  score?: number;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserState | null>(null);
  const [shades, setShades] = useState<ShadeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [userRes, shadesRes] = await Promise.all([
          fetch("/api/user/info"),
          fetch("/api/user/shades"),
        ]);

        if (userRes.status === 401) { router.push("/"); return; }

        const userData = await userRes.json();
        if (userData.code === 0 && userData.data) {
          setUser({
            name: userData.data.nickname || userData.data.name,
            avatar: userData.data.avatar,
          });
        }

        const shadesData = await shadesRes.json();
        if (shadesData.code === 0 && shadesData.data) {
          const items = Array.isArray(shadesData.data)
            ? shadesData.data
            : shadesData.data.shades || [];
          setShades(items);
        }
      } catch {
        // error
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [router]);

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
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-4 mb-6">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name || ""}
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary-light flex items-center justify-center text-2xl font-bold text-primary">
                {user?.name?.[0]?.toUpperCase() || "?"}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">{user?.name || "未知用户"}</h2>
              <p className="text-sm text-muted">SecondMe 用户</p>
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-3">兴趣标签</h3>
            {shades.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {shades.map((shade, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-primary-light text-primary text-sm rounded-full"
                  >
                    {shade.name || shade.tag || shade.text}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">暂无兴趣标签数据</p>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <h3 className="font-medium mb-2">兴趣标签用途</h3>
            <p className="text-sm text-muted">
              你的兴趣标签用于匹配知乎热榜话题，帮助你找到最值得回答的问题。
              标签来源于你的 SecondMe 个人资料。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
