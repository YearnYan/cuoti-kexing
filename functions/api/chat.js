import OpenAI from "openai";

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

function normalizeOpenAIBaseURL(rawBaseURL) {
  const fallback = "https://api.openai.com/v1";
  const normalized = (rawBaseURL || fallback).trim().replace(/\/+$/, "");
  const completionsSuffix = "/chat/completions";
  if (normalized.endsWith(completionsSuffix)) {
    return normalized.slice(0, -completionsSuffix.length);
  }
  return normalized;
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
    const baseURL = normalizeOpenAIBaseURL(env.OPENAI_BASE_URL);

    if (!apiKey) {
      return jsonResponse({ error: { message: "缺少 OPENAI_API_KEY 环境变量" } }, 500);
    }

    const payload = await request.json();
    const { model, messages, response_format, ...rest } = payload || {};

    if (!model || !messages) {
      return jsonResponse({ error: { message: "model and messages are required" } }, 400);
    }

    const client = new OpenAI({
      apiKey,
      baseURL
    });

    const completion = await client.chat.completions.create({
      model,
      messages,
      response_format,
      ...rest
    });

    const content = completion?.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonSafe(content);

    return jsonResponse({ ...completion, parsed }, 200);
  } catch (error) {
    const status = error?.status || error?.response?.status || 500;
    const message = error?.error?.message || error?.message || "Upstream error";
    return jsonResponse(
      {
        error: {
          message
        }
      },
      status
    );
  }
};
