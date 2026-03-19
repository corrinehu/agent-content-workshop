import crypto from "crypto";

const ZHIHU_BASE_URL = process.env.ZHIHU_BASE_URL || "https://openapi.zhihu.com";
const ZHIHU_APP_KEY = process.env.ZHIHU_APP_KEY || "";
const ZHIHU_APP_SECRET = process.env.ZHIHU_APP_SECRET || "";

function generateSignature(timestamp: string, logId: string): string {
  const signStr = `app_key:${ZHIHU_APP_KEY}|ts:${timestamp}|logid:${logId}|extra_info:`;
  const hmac = crypto.createHmac("sha256", ZHIHU_APP_SECRET);
  hmac.update(signStr);
  return hmac.digest("base64");
}

function buildHeaders(logId?: string): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const logIdVal = logId || `log_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  return {
    "X-App-Key": ZHIHU_APP_KEY,
    "X-Timestamp": timestamp,
    "X-Log-Id": logIdVal,
    "X-Sign": generateSignature(timestamp, logIdVal),
    "X-Extra-Info": "",
  };
}

export interface BillboardItem {
  title: string;
  body: string;
  link_url: string;
  published_time: number;
  published_time_str: string;
  state: string;
  heat_score: number;
  token: string;
  type: string;
  interaction_info: {
    vote_up_count: number;
    like_count: number;
    comment_count: number;
    favorites: number;
    pv_count: number;
  };
}

export interface SearchItem {
  title: string;
  content_type: string;
  content_id: string;
  content_text: string;
  url: string;
  comment_count: number;
  vote_up_count: number;
  author_name: string;
  author_avatar: string;
  edit_time: number;
  authority_level: string;
}

export async function fetchBillboard(topCnt = 50, publishInHours = 48): Promise<BillboardItem[]> {
  const url = `${ZHIHU_BASE_URL}/openapi/billboard/list?top_cnt=${topCnt}&publish_in_hours=${publishInHours}`;
  const res = await fetch(url, {
    headers: buildHeaders(),
    next: { revalidate: 600 }, // 10 min cache
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Zhihu billboard API ${res.status}: ${errText}`);
  }

  const json = await res.json();
  if (json.status !== 0) {
    throw new Error(`Zhihu billboard error: ${json.msg || json.status}`);
  }

  return json.data?.list || [];
}

export async function searchGlobal(query: string, count = 10): Promise<SearchItem[]> {
  const encoded = encodeURIComponent(query);
  const url = `${ZHIHU_BASE_URL}/openapi/search/global?query=${encoded}&count=${count}`;
  const res = await fetch(url, {
    headers: buildHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Zhihu search API ${res.status}`);
  }

  const json = await res.json();
  if (json.status !== 0) {
    throw new Error(`Zhihu search error: ${json.msg || json.status}`);
  }

  return json.data?.items || [];
}

export interface RingContent {
  pin_id: number;
  content: string;
  author_name: string;
  images: string[];
  publish_time: number;
  like_num: number;
  comment_num: number;
  share_num: number;
  fav_num: number;
}

export interface RingInfo {
  ring_id: string;
  ring_name: string;
  ring_desc: string;
  ring_avatar: string;
  membership_num: number;
  discussion_num: number;
}

export interface RingDetail {
  ring_info: RingInfo;
  contents: RingContent[];
}

export async function fetchRingDetail(ringId: string, pageNum = 1, pageSize = 20): Promise<RingDetail> {
  const url = `${ZHIHU_BASE_URL}/openapi/ring/detail?ring_id=${ringId}&page_num=${pageNum}&page_size=${pageSize}`;
  const res = await fetch(url, {
    headers: buildHeaders(),
    next: { revalidate: 300 }, // 5 min cache
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Zhihu ring API ${res.status}: ${errText}`);
  }

  const json = await res.json();
  if (json.status !== 0) {
    throw new Error(`Zhihu ring error: ${json.msg || json.status}`);
  }

  return json.data;
}

export async function publishPin(params: {
  title: string;
  content: string;
  ringId?: string;
  imageUrls?: string[];
}): Promise<{ content_token: string }> {
  const ringId = params.ringId || process.env.ZHIHU_RING_ID || "2001009660925334090";
  const url = `${ZHIHU_BASE_URL}/openapi/publish/pin`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...buildHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: params.title,
      content: params.content,
      ring_id: ringId,
      image_urls: params.imageUrls || [],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Zhihu publish API ${res.status}: ${errText}`);
  }

  const json = await res.json();
  if (json.status !== 0) {
    throw new Error(`Zhihu publish error: ${json.msg || json.status}`);
  }

  return json.data;
}
