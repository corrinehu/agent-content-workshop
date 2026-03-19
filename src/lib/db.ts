import { createClient, type Client } from "@libsql/client";

const globalForDb = globalThis as unknown as { db: Client };

function createDb() {
  const dbUrl = process.env.TURSO_DATABASE_URL || "file:./dev.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;
  return createClient({
    url: dbUrl,
    ...(authToken ? { authToken } : {}),
  });
}

export const db = globalForDb.db || createDb();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;

// Generate a short unique ID (similar to cuid)
export function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const time = Date.now().toString(36);
  let rand = "";
  for (let i = 0; i < 16; i++) {
    rand += chars[Math.floor(Math.random() * chars.length)];
  }
  return time + rand;
}

// ---- User operations ----

export interface DbUser {
  id: string;
  secondme_user_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  name: string | null;
  avatar: string | null;
  created_at: string;
  updated_at: string;
}

export async function findUserById(id: string): Promise<DbUser | null> {
  const result = await db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] });
  return (result.rows[0] as unknown as DbUser) || null;
}

export async function findUserBySecondMeId(secondmeUserId: string): Promise<DbUser | null> {
  const result = await db.execute({ sql: "SELECT * FROM users WHERE secondme_user_id = ?", args: [secondmeUserId] });
  return (result.rows[0] as unknown as DbUser) || null;
}

export async function upsertUser(data: {
  secondmeUserId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  name: string | null;
  avatar: string | null;
}): Promise<DbUser> {
  const existing = await findUserBySecondMeId(data.secondmeUserId);
  const now = new Date().toISOString();

  if (existing) {
    await db.execute({
      sql: `UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ?, name = ?, avatar = ?, updated_at = ? WHERE id = ?`,
      args: [data.accessToken, data.refreshToken, data.tokenExpiresAt.toISOString(), data.name, data.avatar, now, existing.id],
    });
    return { ...existing, access_token: data.accessToken, refresh_token: data.refreshToken, token_expires_at: data.tokenExpiresAt.toISOString(), name: data.name, avatar: data.avatar, updated_at: now };
  }

  const id = generateId();
  await db.execute({
    sql: `INSERT INTO users (id, secondme_user_id, access_token, refresh_token, token_expires_at, name, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, data.secondmeUserId, data.accessToken, data.refreshToken, data.tokenExpiresAt.toISOString(), data.name, data.avatar, now, now],
  });
  return { id, secondme_user_id: data.secondmeUserId, access_token: data.accessToken, refresh_token: data.refreshToken, token_expires_at: data.tokenExpiresAt.toISOString(), name: data.name, avatar: data.avatar, created_at: now, updated_at: now };
}

export async function updateUser(id: string, data: {
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
}): Promise<void> {
  const sets: string[] = [];
  const args: (string | null)[] = [];

  if (data.accessToken !== undefined) { sets.push("access_token = ?"); args.push(data.accessToken); }
  if (data.refreshToken !== undefined) { sets.push("refresh_token = ?"); args.push(data.refreshToken); }
  if (data.tokenExpiresAt !== undefined) { sets.push("token_expires_at = ?"); args.push(data.tokenExpiresAt.toISOString()); }

  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  args.push(new Date().toISOString());
  args.push(id);

  await db.execute({ sql: `UPDATE users SET ${sets.join(", ")} WHERE id = ?`, args });
}

// ---- Topic operations ----

export interface DbTopic {
  id: string;
  user_id: string;
  zhihu_id: string | null;
  title: string;
  excerpt: string | null;
  heat_score: number | null;
  answer_count: number | null;
  category: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function createTopic(data: {
  userId: string;
  title: string;
  zhihuId?: string | null;
  excerpt?: string | null;
  heatScore?: number | null;
  answerCount?: number | null;
  status?: string;
}): Promise<DbTopic> {
  const id = generateId();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO topics (id, user_id, zhihu_id, title, excerpt, heat_score, answer_count, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, data.userId, data.zhihuId || null, data.title, data.excerpt || null, data.heatScore || null, data.answerCount || null, data.status || "pending", now, now],
  });
  return { id, user_id: data.userId, zhihu_id: data.zhihuId || null, title: data.title, excerpt: data.excerpt || null, heat_score: data.heatScore || null, answer_count: data.answerCount || null, category: null, status: data.status || "pending", created_at: now, updated_at: now };
}

export async function findTopicById(id: string): Promise<DbTopic | null> {
  const result = await db.execute({ sql: "SELECT * FROM topics WHERE id = ?", args: [id] });
  return (result.rows[0] as unknown as DbTopic) || null;
}

// ---- Article operations ----

export interface DbArticle {
  id: string;
  user_id: string;
  topic_id: string;
  title: string;
  content: string;
  mode: string;
  status: string;
  audit_result: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function createArticle(data: {
  userId: string;
  topicId: string;
  title: string;
  content: string;
  mode?: string;
}): Promise<DbArticle> {
  const id = generateId();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO articles (id, user_id, topic_id, title, content, mode, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, data.userId, data.topicId, data.title, data.content, data.mode || "deep", "draft", now, now],
  });
  return { id, user_id: data.userId, topic_id: data.topicId, title: data.title, content: data.content, mode: data.mode || "deep", status: "draft", audit_result: null, published_at: null, created_at: now, updated_at: now };
}

export async function findArticleByIdAndUser(id: string, userId: string): Promise<DbArticle | null> {
  const result = await db.execute({ sql: "SELECT * FROM articles WHERE id = ? AND user_id = ?", args: [id, userId] });
  return (result.rows[0] as unknown as DbArticle) || null;
}

export async function findLatestDraft(userId: string): Promise<DbArticle | null> {
  const result = await db.execute({ sql: "SELECT * FROM articles WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1", args: [userId, "draft"] });
  return (result.rows[0] as unknown as DbArticle) || null;
}

export async function findLatestDraftByTitle(userId: string, title: string): Promise<DbArticle | null> {
  const result = await db.execute({ sql: "SELECT * FROM articles WHERE user_id = ? AND title = ? AND status = ? ORDER BY created_at DESC LIMIT 1", args: [userId, title, "draft"] });
  return (result.rows[0] as unknown as DbArticle) || null;
}

export async function updateArticlePublished(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute({ sql: "UPDATE articles SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?", args: [now, now, id] });
}
