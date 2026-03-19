# ViewpointAgent

你输出核心观点，Agent 协作放大。

帮你找到值得回答的知乎问题（兴趣匹配 + 热度上升），Agent 研究观点分布、收集素材，你输出真实观点后，多 Agent 协作打磨并一键发布到知乎。

## 核心流程

```
发现好问题 → 研究观点 → 输出观点 → 协作放大 → 审计发布
```

### 1. 发现好问题（Dashboard）

- 抓取知乎圈子最新讨论，基于用户兴趣标签 + 热度分数做匹配
- 展示话题卡片：标题、圈子来源、作者、点赞数、评论数
- 标记"为你推荐"的话题

### 2. 研究观点（Research）

- Agent 搜索知乎相关讨论，获取高赞回答内容
- 通过 SecondMe Act API 返回结构化数据，前端可视化展示：
  - **观点比例条**：彩色横条显示各立场占比
  - **观点卡片**：每个立场的标签、百分比、一句话概括
  - **关键论据**：主流方 vs 反对方分列展示
  - **用户关联 + 切入建议**：基于用户软记忆生成
- 内嵌 Chat：用户可就研究结果与 Agent 深入讨论

### 3. 输出观点（Write）

- 用户基于研究结果写出自己的真实观点（100 字左右）
- 研究笔记保留在侧栏供参考

### 4. 协作放大（Workshop）

两种创作模式：

| 模式 | Agent 数量 | 输出篇幅 | 耗时 |
|------|-----------|---------|------|
| 闪念模式 | 1（编辑 Agent） | 100-300 字纯文本 | ~30 秒 |
| 深度模式 | 4（Owner + 研究员 + 挑战者 + 编辑） | 600-800 字 | ~3-5 分钟 |

深度模式协作流程：
1. **Owner Agent** — 基于用户观点构建回答框架
2. **研究员 Agent** — 补充数据支撑和案例
3. **挑战者 Agent** — 提出质疑，找出逻辑漏洞
4. **Owner Agent** — 回应质疑，调整论点
5. **编辑 Agent** — 打磨为知乎发布风格

SSE 流式输出，用户实时看到每个 Agent 的产出。

### 5. 审计发布（Publish）

- AI 质量审计：合规检查、质量评分、Hook 检测、知乎风格匹配
- 审计通过后一键发布到知乎圈子（通过知乎开放 API）
- 支持编辑修改 → 重新审计 → 再次发布

## 技术栈

- **Next.js 16** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS v4**
- **Prisma + Turso (libSQL)** — 云端数据库，本地开发自动 fallback 到 SQLite
- **SecondMe API** — OAuth 认证、用户画像、Chat/Act Agent 调用
- **知乎开放 API** — 圈子内容抓取、Pin 发布

## 项目结构

```
src/
├── app/
│   ├── page.tsx              # 首页（产品介绍 + 登录）
│   ├── dashboard/page.tsx    # 选题看板
│   ├── workshop/page.tsx     # 研究观点 → 输出观点 → 协作放大
│   ├── publish/page.tsx      # 审计 + 发布
│   ├── profile/page.tsx      # 个人资料
│   └── api/
│       ├── auth/             # OAuth 登录回调
│       ├── user/info/        # 用户信息
│       ├── sessions/         # SecondMe 会话管理
│       ├── topics/           # 话题列表 + 保存
│       ├── research/         # Agent 研究观点分布（Act API）
│       ├── workshop/         # 多 Agent 协作创作（SSE）
│       ├── audit/            # AI 质量审计（Act API）
│       ├── chat/             # Agent 聊天（SSE）
│       ├── act/              # 通用 Act API 代理
│       ├── articles/         # 文章 CRUD
│       └── publish/          # 发布到知乎
├── components/
│   ├── Navbar.tsx            # 顶部导航
│   └── LoginButton.tsx       # SecondMe OAuth 登录按钮
└── lib/
    ├── auth.ts               # 认证工具
    ├── prisma.ts             # Prisma 客户端
    ├── secondme.ts           # SecondMe API 封装
    └── zhihu.ts              # 知乎开放 API 封装
```

## 开发

```bash
# 安装依赖
npm install

# 初始化本地数据库
npx prisma db push
npx prisma generate

# 启动开发服务器
npm run dev
```

本地开发不需要配置数据库环境变量，自动使用本地 SQLite（`dev.db`）。

## 数据库

- **本地开发**：SQLite 文件（`dev.db`），零配置
- **云端部署**：[Turso](https://turso.tech)（云端 SQLite，免费额度足够）

部署时需配置以下数据库环境变量：

| 变量 | 说明 |
|------|------|
| `TURSO_DATABASE_URL` | Turso 数据库连接地址，如 `libsql://xxx.turso.io` |
| `TURSO_AUTH_TOKEN` | Turso 认证 Token |

首次部署时需要在 Turso 创建表，可运行：

```bash
TURSO_DATABASE_URL=你的地址 TURSO_AUTH_TOKEN=你的token npx tsx -e "
const { createClient } = require('@libsql/client');
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
c.execute(\`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, secondme_user_id TEXT NOT NULL UNIQUE, access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, token_expires_at TEXT NOT NULL, name TEXT, avatar TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)\`);
c.execute(\`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, secondme_session_id TEXT, title TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)\`);
c.execute(\`CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, zhihu_id TEXT, title TEXT NOT NULL, excerpt TEXT, heat_score INTEGER, answer_count INTEGER, category TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)\`);
c.execute(\`CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE, title TEXT NOT NULL, content TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'deep', status TEXT NOT NULL DEFAULT 'draft', audit_result TEXT, published_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)\`);
console.log('Tables created!');
"
```

## 云端部署（EdgeOne Pages 等）

### 构建命令

```bash
npm run build
```

> 已内置 `prisma generate`，无需额外配置。

### 环境变量

需要配置以下环境变量：

| 变量 | 说明 |
|------|------|
| `SECONDME_API_BASE_URL` | SecondMe API 地址 |
| `SECONDME_OAUTH_URL` | OAuth 授权 URL |
| `SECONDME_TOKEN_ENDPOINT` | Token 端点 |
| `SECONDME_REFRESH_ENDPOINT` | Refresh Token 端点 |
| `SECONDME_CLIENT_ID` | SecondMe App Client ID |
| `SECONDME_CLIENT_SECRET` | SecondMe App Client Secret |
| `SECONDME_REDIRECT_URI` | OAuth 回调地址 |
| `ZHIHU_BASE_URL` | 知乎开放 API 地址 |
| `ZHIHU_APP_KEY` | 知乎应用 Key |
| `ZHIHU_APP_SECRET` | 知乎应用 Secret |
| `ZHIHU_RING_ID` | 默认发布圈子 ID |
