const API_BASE_URL = process.env.SECONDME_API_BASE_URL!;
const OAUTH_URL = process.env.SECONDME_OAUTH_URL!;
const TOKEN_ENDPOINT = process.env.SECONDME_TOKEN_ENDPOINT!;
const REFRESH_ENDPOINT = process.env.SECONDME_REFRESH_ENDPOINT!;
const CLIENT_ID = process.env.SECONDME_CLIENT_ID!;
const CLIENT_SECRET = process.env.SECONDME_CLIENT_SECRET!;
const REDIRECT_URI = process.env.SECONDME_REDIRECT_URI!;

export function getOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "user.info user.info.shades user.info.softmemory chat",
    state,
  });
  return `${OAUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    }),
  });
  return res.json();
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(REFRESH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  return res.json();
}

export async function getSecondMeUser(accessToken: string) {
  const res = await fetch(`${API_BASE_URL}/api/secondme/user/info`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export async function getSecondMeShades(accessToken: string) {
  const res = await fetch(`${API_BASE_URL}/api/secondme/user/shades`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export async function getSecondMeSoftMemory(accessToken: string) {
  const res = await fetch(`${API_BASE_URL}/api/secondme/user/softmemory`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export async function sendChatMessage(
  accessToken: string,
  sessionId: string,
  message: string,
  onChunk: (chunk: string) => void,
) {
  const res = await fetch(`${API_BASE_URL}/api/secondme/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      sessionId,
      message,
    }),
  });

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

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
        if (data.startsWith("event:")) continue;
        try {
          const parsed = JSON.parse(data);
          // SSE format: { choices: [{ delta: { content: "..." } }] }
          if (parsed.choices?.[0]?.delta?.content) {
            onChunk(parsed.choices[0].delta.content);
          } else if (parsed.code === 0 && parsed.data?.content) {
            onChunk(parsed.data.content);
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  }
}

export async function sendActMessage(
  accessToken: string,
  sessionId: string,
  message: string,
  actionControl: Record<string, unknown>,
  onChunk: (data: Record<string, unknown>) => void,
) {
  const res = await fetch(`${API_BASE_URL}/api/secondme/act/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      sessionId,
      message,
      actionControl: JSON.stringify(actionControl),
    }),
  });

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process all complete lines
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();

      // Handle SSE data lines
      if (trimmed.startsWith("data:")) {
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          // Try OpenAI-style: { choices: [{ delta: { content } }] }
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
          }
        } catch {
          // Not JSON, might be raw text content
          if (data.startsWith("{") || data.startsWith("[")) {
            fullContent += data;
          }
        }
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim().startsWith("data:")) {
    const data = buffer.trim().slice(5).trim();
    if (data && data !== "[DONE]") {
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) fullContent += delta;
      } catch {
        if (data.startsWith("{")) fullContent += data;
      }
    }
  }

  console.error("[Act] accumulated content:", fullContent);

  // Parse the accumulated JSON content
  if (fullContent) {
    // Strip markdown code block wrappers
    let stripped = fullContent
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    // Try direct parse
    try {
      const result = JSON.parse(stripped);
      onChunk(result);
      return;
    } catch {}

    // Try extracting JSON using brace counting (handles nested objects)
    const jsonStart = stripped.indexOf("{");
    const arrStart = stripped.indexOf("[");
    let extractFrom = -1;

    if (jsonStart !== -1 && (arrStart === -1 || jsonStart <= arrStart)) {
      extractFrom = jsonStart;
    } else if (arrStart !== -1) {
      extractFrom = arrStart;
    }

    if (extractFrom !== -1) {
      const openChar = stripped[extractFrom];
      const closeChar = openChar === "{" ? "}" : "]";
      let depth = 0;
      for (let i = extractFrom; i < stripped.length; i++) {
        if (stripped[i] === openChar) depth++;
        else if (stripped[i] === closeChar) depth--;
        if (depth === 0) {
          const candidate = stripped.slice(extractFrom, i + 1);
          try {
            const result = JSON.parse(candidate);
            onChunk(result);
            return;
          } catch {}
          break;
        }
      }
    }

    // Last resort: return raw content
    onChunk({ raw: fullContent });
  }
}

export async function getChatSessions(accessToken: string) {
  const res = await fetch(`${API_BASE_URL}/api/secondme/chat/sessions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export { API_BASE_URL, CLIENT_ID, CLIENT_SECRET };
