const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}

function parseJsonSafe(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export const onRequestOptions = () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
};

export const onRequestPost = async ({ request, env }) => {
  try {
    const apiKey = env.OPENAI_API_KEY;
    const baseURL = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");

    if (!apiKey) {
      return jsonResponse({ error: { message: "缺少 OPENAI_API_KEY 环境变量" } }, 500);
    }

    const payload = await request.json();
    const { model, messages, response_format, ...rest } = payload || {};

    if (!model || !messages) {
      return jsonResponse({ error: { message: "model and messages are required" } }, 400);
    }

    const upstream = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages, response_format, ...rest })
    });

    const result = await upstream.json();

    const content = result?.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonSafe(content);

    return jsonResponse({ ...result, parsed }, upstream.status);
  } catch (error) {
    return jsonResponse(
      {
        error: {
          message: error?.message || "Upstream error"
        }
      },
      500
    );
  }
};
