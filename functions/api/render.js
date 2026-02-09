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

function sanitizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\uFEFF/, "")
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function sanitizeSvg(svgInput) {
  if (!svgInput) return "";
  const svg = String(svgInput)
    .replace(/^\uFEFF/, "")
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/```svg/gi, "")
    .replace(/```/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .trim();
  return /<svg[\s>]/i.test(svg) ? svg : "";
}

const SUPERSCRIPT_MAP = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  "n": "ⁿ",
  "i": "ⁱ"
};

const SUBSCRIPT_MAP = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎"
};

function toSuperscriptText(value) {
  return String(value || "").split("").map((char) => SUPERSCRIPT_MAP[char] || char).join("");
}

function toSubscriptText(value) {
  return String(value || "").split("").map((char) => SUBSCRIPT_MAP[char] || char).join("");
}

function normalizeScientificLabel(textInput) {
  let text = sanitizeText(textInput || "");

  const commandMap = [
    [/\\rightleftharpoons|\\leftrightarrow|<=>|<->|⇄/g, "⇌"],
    [/\\longrightarrow|\\rightarrow|\\to|=>|->/g, "→"],
    [/\\uparrow/g, "↑"],
    [/\\downarrow/g, "↓"],
    [/\\times/g, "×"],
    [/\\div/g, "÷"],
    [/\\leq/g, "≤"],
    [/\\geq/g, "≥"],
    [/\\neq/g, "≠"],
    [/\\angle/g, "∠"],
    [/\\Delta/g, "Δ"],
    [/\\alpha/g, "α"],
    [/\\beta/g, "β"],
    [/\\gamma/g, "γ"],
    [/\\lambda/g, "λ"],
    [/\\mu/g, "μ"],
    [/\\omega/g, "ω"],
    [/\\Omega/g, "Ω"],
    [/\\cdot/g, "·"]
  ];

  for (const [pattern, replacement] of commandMap) {
    text = text.replace(pattern, replacement);
  }

  text = text.replace(/\$+/g, "");

  text = text.replace(/\^\{([^{}]+)\}/g, (match, value) => toSuperscriptText(value));
  text = text.replace(/_\{([^{}]+)\}/g, (match, value) => toSubscriptText(value));

  text = text.replace(/\^(?!\{)([A-Za-z0-9+\-=()]+)/g, (match, value) => toSuperscriptText(value));
  text = text.replace(/_(?!\{)([A-Za-z0-9+\-=()]+)/g, (match, value) => toSubscriptText(value));

  text = text.replace(/[ \t]{2,}/g, " ").trim();
  return text;
}

function normalizeSvgTextNodes(svgInput) {
  const safeSvg = sanitizeSvg(svgInput);
  if (!safeSvg) return "";

  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return safeSvg;
  }

  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(safeSvg, "image/svg+xml");
    if (xml.querySelector("parsererror")) {
      return safeSvg;
    }

    xml.querySelectorAll("text, tspan").forEach((node) => {
      const raw = node.textContent || "";
      node.textContent = normalizeScientificLabel(raw);
    });

    const root = xml.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "svg") {
      return safeSvg;
    }

    const serialized = new XMLSerializer().serializeToString(root);
    return sanitizeSvg(serialized) || safeSvg;
  } catch {
    return safeSvg;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function buildGuaranteedDiagramSvg({ subject, mode, figureSpec }) {
  const subjectText = sanitizeText(subject || "综合");
  const modeText = sanitizeText(mode || "svg");
  const description = normalizeScientificLabel(
    sanitizeText(figureSpec?.description || figureSpec?.smiles || figureSpec?.tikz || figureSpec?.python || "")
  ).slice(0, 42);

  if (modeText === "smiles_rdkit") {
    const atoms = (sanitizeText(figureSpec?.smiles || "").match(/Cl|Br|[A-Z][a-z]?/g) || []).slice(0, 6);
    const chain = atoms.length >= 2 ? atoms : ["C", "C", "O"];
    const step = chain.length > 1 ? 220 / (chain.length - 1) : 0;
    const nodes = chain.map((atom, index) => ({
      x: 70 + index * step,
      y: 90 + (index % 2 === 0 ? 0 : -22),
      atom
    }));

    const bonds = nodes.slice(0, -1)
      .map((node, index) => `<line x1="${node.x}" y1="${node.y}" x2="${nodes[index + 1].x}" y2="${nodes[index + 1].y}" stroke="#0f172a" stroke-width="2.5"/>`)
      .join("");

    const atomNodes = nodes
      .map((node) => `<circle cx="${node.x}" cy="${node.y}" r="15" fill="#ffffff" stroke="#1d4ed8" stroke-width="2"/><text x="${node.x}" y="${node.y + 5}" text-anchor="middle" font-size="13" fill="#0f172a" font-family="Arial">${escapeHtml(node.atom)}</text>`)
      .join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="0 0 360 180" role="img" aria-label="化学结构图">
  <rect x="1" y="1" width="358" height="178" rx="10" fill="#f8fafc" stroke="#cbd5e1"/>
  <text x="16" y="24" font-size="14" fill="#334155" font-family="Arial, PingFang SC, Microsoft YaHei">${escapeHtml(subjectText)} · 结构示意</text>
  ${bonds}
  ${atomNodes}
  <text x="16" y="164" font-size="12" fill="#64748b" font-family="Arial, PingFang SC, Microsoft YaHei">${escapeHtml(description || "分子骨架")}</text>
</svg>`;
  }

  if (modeText === "tikz_or_matplotlib") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="0 0 360 180" role="img" aria-label="数学物理图形">
  <rect x="1" y="1" width="358" height="178" rx="10" fill="#f8fafc" stroke="#cbd5e1"/>
  <line x1="48" y1="146" x2="320" y2="146" stroke="#0f172a" stroke-width="2"/>
  <line x1="48" y1="146" x2="48" y2="34" stroke="#0f172a" stroke-width="2"/>
  <polyline points="48,128 112,94 170,62 232,84 300,44" fill="none" stroke="#2563eb" stroke-width="2.4"/>
  <line x1="170" y1="62" x2="215" y2="104" stroke="#dc2626" stroke-width="2"/>
  <text x="221" y="108" font-size="12" fill="#dc2626" font-family="Arial">F</text>
  <text x="328" y="150" font-size="12" fill="#0f172a" font-family="Arial">x</text>
  <text x="40" y="28" font-size="12" fill="#0f172a" font-family="Arial">y</text>
  <text x="16" y="24" font-size="14" fill="#334155" font-family="Arial, PingFang SC, Microsoft YaHei">${escapeHtml(subjectText)} · 坐标示意</text>
  <text x="16" y="164" font-size="12" fill="#64748b" font-family="Arial, PingFang SC, Microsoft YaHei">${escapeHtml(description || "函数/受力关系图")}</text>
</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="0 0 360 180" role="img" aria-label="综合学科示意图">
  <rect x="1" y="1" width="358" height="178" rx="10" fill="#f8fafc" stroke="#cbd5e1"/>
  <ellipse cx="110" cy="90" rx="58" ry="42" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>
  <circle cx="110" cy="90" r="16" fill="#ffffff" stroke="#2563eb" stroke-width="1.8"/>
  <rect x="202" y="48" width="116" height="84" rx="8" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/>
  <line x1="168" y1="90" x2="202" y2="90" stroke="#475569" stroke-width="2" marker-end="url(#arrow)"/>
  <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#475569"/></marker></defs>
  <text x="16" y="24" font-size="14" fill="#334155" font-family="Arial, PingFang SC, Microsoft YaHei">${escapeHtml(subjectText)} · 图形示意</text>
  <text x="16" y="164" font-size="12" fill="#64748b" font-family="Arial, PingFang SC, Microsoft YaHei">${escapeHtml(description || "关键结构关系图")}</text>
</svg>`;
}

function normalizeFigureSpec(input) {
  if (!input || typeof input !== "object") return null;
  const mode = sanitizeText(input.mode || input.type || "svg").toLowerCase();
  const description = sanitizeText(input.description || input.caption || input.prompt || "");

  if (mode.includes("smiles")) {
    const smiles = sanitizeText(input.smiles);
    if (!smiles && !description) return null;
    return {
      mode: "smiles_rdkit",
      smiles,
      style: sanitizeText(input.style || "2d"),
      description
    };
  }

  if (mode.includes("tikz") || mode.includes("matplotlib") || mode.includes("python")) {
    const tikz = sanitizeText(input.tikz || input.latex || "");
    const python = sanitizeText(input.python || input.matplotlib || "");
    if (!tikz && !python && !description) return null;
    return {
      mode: "tikz_or_matplotlib",
      tikz,
      python,
      prefer: sanitizeText(input.prefer || (tikz ? "tikz" : "matplotlib")),
      description
    };
  }

  const svg = sanitizeSvg(input.svg || "");
  if (!svg && !description) return null;
  return { mode: "svg", svg, description };
}

function collectScientificTokens(figureSpec) {
  const sourceParts = [
    sanitizeText(figureSpec?.tikz || ""),
    sanitizeText(figureSpec?.python || ""),
    sanitizeText(figureSpec?.smiles || ""),
    sanitizeText(figureSpec?.description || "")
  ].filter(Boolean);

  const source = sourceParts.join("\n");
  const tokens = new Set();

  const formulaRegex = /([A-Za-z]{1,3}(?:_[0-9]+|\^[0-9+\-]+|[0-9]){1,4})/g;
  const greekRegex = /(alpha|beta|gamma|lambda|mu|omega|Omega)/g;
  const relationRegex = /(<=|>=|!=|->|<->|<=>|\\rightarrow|\\leftrightarrow|\\rightleftharpoons)/g;

  const addMatches = (regex, formatter) => {
    let match;
    while ((match = regex.exec(source)) !== null) {
      const raw = match[0];
      const formatted = formatter ? formatter(raw) : raw;
      if (formatted) tokens.add(formatted);
    }
  };

  addMatches(formulaRegex, (raw) => normalizeScientificLabel(raw));
  addMatches(greekRegex, (raw) => normalizeScientificLabel(`\\${raw}`));
  addMatches(relationRegex, (raw) => normalizeScientificLabel(raw));

  return Array.from(tokens).filter(Boolean).slice(0, 12);
}

function appendScientificHintsToSvg(svgInput, figureSpec) {
  const baseSvg = normalizeSvgTextNodes(svgInput);
  if (!baseSvg) return "";

  const hints = collectScientificTokens(figureSpec);
  if (!hints.length) return baseSvg;

  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return baseSvg;
  }

  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(baseSvg, "image/svg+xml");
    if (xml.querySelector("parsererror")) {
      return baseSvg;
    }

    const root = xml.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "svg") {
      return baseSvg;
    }

    const height = Number(root.getAttribute("height") || 280);

    const defs = xml.createElementNS("http://www.w3.org/2000/svg", "defs");
    const style = xml.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = ".render-hint{font-family:Arial, PingFang SC, Microsoft YaHei; font-size:12px; fill:#334155;}";
    defs.appendChild(style);
    root.insertBefore(defs, root.firstChild);

    const panel = xml.createElementNS("http://www.w3.org/2000/svg", "g");
    panel.setAttribute("transform", `translate(12, ${Math.max(16, height - 16 - hints.length * 14)})`);

    hints.forEach((token, index) => {
      const text = xml.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("class", "render-hint");
      text.setAttribute("x", "0");
      text.setAttribute("y", String(14 * (index + 1)));
      text.textContent = token;
      panel.appendChild(text);
    });

    root.appendChild(panel);

    const serialized = new XMLSerializer().serializeToString(root);
    return sanitizeSvg(serialized) || baseSvg;
  } catch {
    return baseSvg;
  }
}

async function renderByMatplotlibScript(pythonCode) {
  const code = sanitizeText(pythonCode);
  if (!code) {
    throw new Error("Matplotlib 脚本为空");
  }

  const payload = {
    python: code,
    width: 720,
    height: 280,
    background: "white"
  };

  const response = await fetch("https://quickchart.io/python", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Matplotlib 渲染失败(${response.status})`);
  }

  const svg = await response.text();
  const safe = sanitizeSvg(svg);
  if (!safe) {
    throw new Error("Matplotlib 渲染结果不是有效 SVG");
  }

  return {
    svg: safe,
    renderer: "quickchart-matplotlib",
    notes: "通过 QuickChart python 接口渲染"
  };
}

async function renderBySmiles(smiles) {
  const safeSmiles = sanitizeText(smiles);
  if (!safeSmiles) {
    throw new Error("SMILES 为空");
  }

  const url = `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(safeSmiles)}/image?format=svg`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`SMILES 渲染失败(${response.status})`);
  }

  const rawSvg = await response.text();
  const safe = sanitizeSvg(rawSvg);
  if (!safe) {
    throw new Error("SMILES 渲染结果不是有效 SVG");
  }

  return {
    svg: safe,
    renderer: "cactus-smiles",
    notes: "通过 NCI Cactus 服务渲染 SMILES"
  };
}

async function callAiSvgRenderer({ client, model, subject, figureSpec }) {
  const prompt = `
你是一个“学科图形渲染适配器”。
任务：根据 figure_spec 产出可直接渲染的单个 SVG 字符串。

要求：
1. 只输出 JSON：{"svg":"<svg ...>...</svg>","renderer":"...","notes":"..."}
2. SVG 必须完整可渲染，不要 markdown，不要解释文本。
3. 数学/物理：优先忠实表达 TikZ/Matplotlib 的坐标与标注。
4. 化学：严格按 SMILES 表达，结构与键型合理。
5. 生物/电路：保持符号规范、连线清晰。
6. 图中文字不要输出 LaTeX 语法（禁止 ^2、_2、\frac 这类未转义文本），请直接输出可显示字符（如 x²、H₂O、SO₄²⁻）。
7. 元素精确映射：figure_spec 中每个元素必须有且仅有一个正确图形对应；禁止漏画、错位、重名、错误连接、擅自增删元素。
8. 空间关系强约束：上下/左右/内外/中间/邻接/相交/重合/接触/包含/平行/垂直必须全部满足；固定点不可漂移，点线面归属必须正确。
9. 物理世界一致性：
   - 力学对象必须位于可接触表面或空间中，禁止“物体嵌入斜面/墙体/地面”等违背真实世界的错误。
   - 电路必须电气连通且极性、方向、开关状态正确，禁止悬空断线。
   - 光学必须满足反射/折射与法线关系，光线路径可追踪且自洽。
   - 化学结构、键型、官能团、装置连接关系必须符合化学常识。
   - 生物与地理图示层级、方向、区域关系必须符合教材规范与客观事实。
10. 输出前自检：逐项核对元素清单、几何/拓扑关系、标注文字与单位；若任一项不满足，必须先修正再输出。

subject: ${sanitizeText(subject)}
figure_spec:
${JSON.stringify(figureSpec)}
`;

  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.1
  });

  const parsed = parseJsonSafe(completion?.choices?.[0]?.message?.content || "");
  const rawSvg = parsed?.svg || "";
  const svg = appendScientificHintsToSvg(rawSvg, figureSpec);
  if (!svg) {
    throw new Error("AI 渲染结果未返回有效 SVG");
  }

  return {
    svg,
    renderer: sanitizeText(parsed?.renderer || "ai-svg-renderer"),
    notes: sanitizeText(parsed?.notes || "")
  };
}

function shouldRetryWithFallbackModel(error) {
  const message = sanitizeText(error?.message || "");
  const status = Number(error?.status || error?.response?.status || 0);
  if (status === 503) return true;
  return /无可用渠道|distributor|model.*unavailable|Service Unavailable/i.test(message);
}

async function callAiSvgRendererWithFallback({
  client,
  model,
  fallbackModel,
  subject,
  figureSpec
}) {
  try {
    const rendered = await callAiSvgRenderer({
      client,
      model,
      subject,
      figureSpec
    });
    return {
      ...rendered,
      modelUsed: model,
      warning: ""
    };
  } catch (error) {
    if (!fallbackModel || fallbackModel === model || !shouldRetryWithFallbackModel(error)) {
      throw error;
    }

    const rendered = await callAiSvgRenderer({
      client,
      model: fallbackModel,
      subject,
      figureSpec
    });

    return {
      ...rendered,
      modelUsed: fallbackModel,
      warning: `主渲染模型 ${model} 不可用，已自动回退到 ${fallbackModel}`
    };
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
    const payload = await request.json();
    const subject = sanitizeText(payload?.subject || "");
    const figureSpec = normalizeFigureSpec(payload?.figure_spec);

    if (!figureSpec) {
      return jsonResponse({ error: { message: "figure_spec 缺失或格式不正确" } }, 400);
    }

    if (figureSpec.mode === "svg" && figureSpec.svg) {
      return jsonResponse({
        ok: true,
        mode: "svg",
        svg: appendScientificHintsToSvg(figureSpec.svg, figureSpec),
        renderer: "passthrough"
      });
    }

    let smilesRenderError = null;
    if (figureSpec.mode === "smiles_rdkit") {
      try {
        const rendered = await renderBySmiles(figureSpec.smiles);
        return jsonResponse({
          ok: true,
          mode: figureSpec.mode,
          svg: appendScientificHintsToSvg(rendered.svg, figureSpec),
          renderer: rendered.renderer,
          notes: rendered.notes
        });
      } catch (error) {
        smilesRenderError = error;
      }
    }

    if (figureSpec.mode === "tikz_or_matplotlib" && figureSpec.python) {
      try {
        const rendered = await renderByMatplotlibScript(figureSpec.python);
        return jsonResponse({
          ok: true,
          mode: figureSpec.mode,
          svg: appendScientificHintsToSvg(rendered.svg, figureSpec),
          renderer: rendered.renderer,
          notes: rendered.notes
        });
      } catch {
        // 失败后继续走 AI 渲染或降级逻辑
      }
    }

    const apiKey = env.OPENAI_API_KEY;
    const baseURL = normalizeOpenAIBaseURL(env.OPENAI_BASE_URL);
    const model = sanitizeText(env.RENDERER_MODEL || env.OPENAI_RENDERER_MODEL || env.OPENAI_MODEL || "gemini-3-flash-preview");
    const fallbackModel = sanitizeText(env.RENDERER_FALLBACK_MODEL || "gemini-3-flash-preview");

    if (!apiKey) {
      return jsonResponse({
        ok: true,
        mode: figureSpec.mode,
        svg: buildGuaranteedDiagramSvg({ subject, mode: figureSpec.mode, figureSpec }),
        renderer: "guaranteed-no-api-key",
        warning: smilesRenderError
          ? `SMILES 直连渲染失败，且未配置 OPENAI_API_KEY，已使用后端保证示意图：${smilesRenderError?.message || "未知错误"}`
          : "未配置 OPENAI_API_KEY，已使用后端保证示意图"
      });
    }

    const client = new OpenAI({ apiKey, baseURL });
    let rendered = null;
    try {
      rendered = await callAiSvgRendererWithFallback({
        client,
        model,
        fallbackModel,
        subject,
        figureSpec
      });
    } catch (renderError) {
      return jsonResponse({
        ok: true,
        mode: figureSpec.mode,
        svg: buildGuaranteedDiagramSvg({ subject, mode: figureSpec.mode, figureSpec }),
        renderer: "guaranteed-on-render-error",
        warning: `AI 渲染失败，已切换后端保证示意图：${renderError?.message || "未知错误"}`,
        ...(smilesRenderError
          ? { smiles_warning: `SMILES 直连渲染失败：${smilesRenderError?.message || "未知错误"}` }
          : {})
      });
    }

    return jsonResponse({
      ok: true,
      mode: figureSpec.mode,
      svg: appendScientificHintsToSvg(rendered.svg, figureSpec),
      renderer: rendered.renderer,
      notes: rendered.notes,
      model: rendered.modelUsed,
      ...(smilesRenderError ? { warning: `SMILES 直连渲染失败，已切换 AI 渲染：${smilesRenderError?.message || "未知错误"}` } : {}),
      ...(rendered.warning ? { model_warning: rendered.warning } : {})
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: {
          message: error?.message || "后端渲染失败"
        }
      },
      error?.status || 500
    );
  }
};
