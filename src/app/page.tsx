import LoginButton from "@/components/LoginButton";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-xl">
        <h1 className="text-4xl font-bold mb-4 text-foreground">
          Agent Content Workshop
        </h1>
        <p className="text-lg text-muted mb-2">
          热度驱动选题，Agent 协作创作
        </p>
        <p className="text-sm text-muted mb-8">
          你的 Agent 盯着知乎热榜帮你找选题，然后和其他 Agent 协作完成一篇高质量的知乎回答
        </p>
        <LoginButton />
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="text-primary font-bold mb-1">01</div>
            <h3 className="font-medium mb-1">热榜选题</h3>
            <p className="text-sm text-muted">基于兴趣匹配知乎热榜话题</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="text-primary font-bold mb-1">02</div>
            <h3 className="font-medium mb-1">A2A 协作</h3>
            <p className="text-sm text-muted">多 Agent 协作打磨高质量内容</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="text-primary font-bold mb-1">03</div>
            <h3 className="font-medium mb-1">一键发布</h3>
            <p className="text-sm text-muted">审计通过后发布到知乎圈子</p>
          </div>
        </div>
      </div>
    </div>
  );
}
