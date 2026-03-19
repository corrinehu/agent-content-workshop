import LoginButton from "@/components/LoginButton";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-xl">
        <h1 className="text-5xl font-bold mb-4 text-foreground">
          ViewpointAgent
        </h1>
        <p className="text-lg text-muted mb-2">
          你输出核心观点，Agent 协作放大
        </p>
        <p className="text-sm text-muted mb-8">
          帮你找到值得回答的知乎问题 — 和你兴趣匹配、热度正在上升
        </p>
        <LoginButton />
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-4 gap-4 text-left">
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="text-primary font-bold mb-1">01</div>
            <h3 className="font-medium mb-1">发现好问题</h3>
            <p className="text-sm text-muted">兴趣匹配 + 热度上升，找到你最有能力回答的问题</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="text-primary font-bold mb-1">02</div>
            <h3 className="font-medium mb-1">研究观点</h3>
            <p className="text-sm text-muted">Agent 搜索知乎讨论，收集素材，可视化展示观点分布</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="text-primary font-bold mb-1">03</div>
            <h3 className="font-medium mb-1">输出观点</h3>
            <p className="text-sm text-muted">基于研究，写出你的真实观点和独特角度</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="text-primary font-bold mb-1">04</div>
            <h3 className="font-medium mb-1">协作放大</h3>
            <p className="text-sm text-muted">多 Agent 协作打磨你的观点，审计后一键发布</p>
          </div>
        </div>
      </div>
    </div>
  );
}
