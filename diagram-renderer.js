/**
 * DiagramRenderer - 全学科精确图形渲染引擎
 * 将 AI 生成的结构化 DiagramSpec 转换为精确的 SVG/Canvas 图形
 */

/* ============================================================
   全局计数器（用于生成唯一 DOM id）
   ============================================================ */
let _diagramIdCounter = 0;
function nextDiagramId() { return `dia-${++_diagramIdCounter}-${Date.now().toString(36)}`; }

/* ============================================================
   SVG 工具函数
   ============================================================ */
const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgElement(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  }
  return el;
}

function createSvgRoot(width, height, viewBox) {
  const svg = createSvgElement("svg", {
    xmlns: SVG_NS,
    width, height,
    viewBox: viewBox || `0 0 ${width} ${height}`,
    "font-family": "Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif"
  });
  svg.style.display = "block";
  svg.style.maxWidth = "100%";
  return svg;
}

function svgText(x, y, text, opts = {}) {
  return createSvgElement("text", {
    x, y,
    "text-anchor": opts.anchor || "middle",
    "dominant-baseline": opts.baseline || "central",
    "font-size": opts.fontSize || 13,
    fill: opts.fill || "#1e293b",
    "font-weight": opts.bold ? "bold" : "normal",
    "font-style": opts.italic ? "italic" : "normal",
    ...opts.extra
  });
}

function svgLine(x1, y1, x2, y2, opts = {}) {
  return createSvgElement("line", {
    x1, y1, x2, y2,
    stroke: opts.stroke || "#1e293b",
    "stroke-width": opts.strokeWidth || 2,
    "stroke-dasharray": opts.dashed ? "6,4" : undefined,
    "marker-end": opts.arrow ? "url(#arrowhead)" : undefined
  });
}

function svgCircle(cx, cy, r, opts = {}) {
  return createSvgElement("circle", {
    cx, cy, r,
    fill: opts.fill || "none",
    stroke: opts.stroke || "#1e293b",
    "stroke-width": opts.strokeWidth || 2
  });
}

function svgRect(x, y, w, h, opts = {}) {
  return createSvgElement("rect", {
    x, y, width: w, height: h,
    rx: opts.rx || 0,
    fill: opts.fill || "none",
    stroke: opts.stroke || "#1e293b",
    "stroke-width": opts.strokeWidth || 2,
    "stroke-dasharray": opts.dashed ? "6,4" : undefined
  });
}

function svgPolygon(points, opts = {}) {
  return createSvgElement("polygon", {
    points: points.map(p => `${p[0]},${p[1]}`).join(" "),
    fill: opts.fill || "none",
    stroke: opts.stroke || "#1e293b",
    "stroke-width": opts.strokeWidth || 2
  });
}

function svgPath(d, opts = {}) {
  return createSvgElement("path", {
    d,
    fill: opts.fill || "none",
    stroke: opts.stroke || "#1e293b",
    "stroke-width": opts.strokeWidth || 2,
    "stroke-dasharray": opts.dashed ? "6,4" : undefined,
    "marker-end": opts.arrow ? "url(#arrowhead)" : undefined
  });
}

function svgGroup(transform) {
  const g = createSvgElement("g");
  if (transform) g.setAttribute("transform", transform);
  return g;
}

/** 添加箭头 marker 定义 */
function addArrowDef(svg, id = "arrowhead", color = "#1e293b") {
  let defs = svg.querySelector("defs");
  if (!defs) { defs = createSvgElement("defs"); svg.insertBefore(defs, svg.firstChild); }
  if (svg.querySelector(`#${id}`)) return;
  const marker = createSvgElement("marker", {
    id, markerWidth: 10, markerHeight: 7, refX: 9, refY: 3.5, orient: "auto", markerUnits: "strokeWidth"
  });
  const path = createSvgElement("path", { d: "M0,0 L10,3.5 L0,7 Z", fill: color });
  marker.appendChild(path);
  defs.appendChild(marker);
}

/** 添加空心箭头 marker */
function addOpenArrowDef(svg, id = "openarrow", color = "#1e293b") {
  let defs = svg.querySelector("defs");
  if (!defs) { defs = createSvgElement("defs"); svg.insertBefore(defs, svg.firstChild); }
  if (svg.querySelector(`#${id}`)) return;
  const marker = createSvgElement("marker", {
    id, markerWidth: 10, markerHeight: 7, refX: 9, refY: 3.5, orient: "auto", markerUnits: "strokeWidth"
  });
  const path = createSvgElement("path", { d: "M0,0 L10,3.5 L0,7", fill: "none", stroke: color, "stroke-width": 1.5 });
  marker.appendChild(path);
  defs.appendChild(marker);
}

/** 计算两点距离 */
function dist(x1, y1, x2, y2) { return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2); }

/** 计算两点中点 */
function midpoint(x1, y1, x2, y2) { return [(x1 + x2) / 2, (y1 + y2) / 2]; }

/** 角度转弧度 */
function deg2rad(d) { return d * Math.PI / 180; }

/** 弧度转角度 */
function rad2deg(r) { return r * 180 / Math.PI; }

/** 在 SVG text 节点中设置文本 */
function setTextContent(textEl, str) {
  textEl.textContent = str;
  return textEl;
}

/** 安全获取数组 */
function safeArr(v) { return Array.isArray(v) ? v : []; }

/** 安全获取对象 */
function safeObj(v) { return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; }


/* ============================================================
   DiagramRenderer 主类
   ============================================================ */
class DiagramRenderer {
  constructor(container) {
    this.container = container;
  }

  async render(spec) {
    if (!spec || !spec.type) return this.renderError("无图形规格");
    try {
      switch (spec.type) {
        case "geometry":       return this.renderGeometry(spec);
        case "function_graph": return this.renderFunctionGraph(spec);
        case "coordinate":     return this.renderCoordinate(spec);
        case "force":          return this.renderForce(spec);
        case "circuit":        return this.renderCircuit(spec);
        case "optics":         return this.renderOptics(spec);
        case "molecule":       return this.renderMolecule(spec);
        case "reaction":       return this.renderReaction(spec);
        case "apparatus":      return this.renderApparatus(spec);
        case "cell":           return this.renderCell(spec);
        case "process_flow":   return this.renderProcessFlow(spec);
        case "geographic":     return this.renderGeographic(spec);
        case "generic_svg":    return this.renderGenericSVG(spec);
        default:               return this.renderGenericSVG(spec);
      }
    } catch (e) {
      console.error("DiagramRenderer error:", e, spec);
      return this.renderError(spec.data?.description || spec.title || "图形渲染失败");
    }
  }

  renderError(msg) {
    const div = document.createElement("div");
    div.style.cssText = "padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b;font-size:13px;text-align:center;";
    div.textContent = "\u26A0 " + msg;
    this.container.appendChild(div);
  }

  /* ----------------------------------------------------------
     数学 - 几何图形 (geometry)
     ---------------------------------------------------------- */
  renderGeometry(spec) {
    const d = safeObj(spec.data);
    const points = safeArr(d.points);
    const segments = safeArr(d.segments);
    const angles = safeArr(d.angles);
    const labels = safeArr(d.labels);
    const circles = safeArr(d.circles);
    const auxiliary = safeArr(d.auxiliary);

    const ptMap = {};
    points.forEach(p => { ptMap[p.id] = p; });

    let allX = points.map(p => p.x);
    let allY = points.map(p => p.y);
    circles.forEach(c => {
      const center = ptMap[c.center];
      if (center) {
        allX.push(center.x - c.radius, center.x + c.radius);
        allY.push(center.y - c.radius, center.y + c.radius);
      }
    });
    if (allX.length === 0) { allX = [0, 4]; allY = [0, 3]; }

    const minX = Math.min(...allX), maxX = Math.max(...allX);
    const minY = Math.min(...allY), maxY = Math.max(...allY);
    const rangeX = maxX - minX || 4;
    const rangeY = maxY - minY || 3;

    const W = 360, H = 280, pad = 40;
    const scale = Math.min((W - 2 * pad) / rangeX, (H - 2 * pad) / rangeY);
    const tx = (x) => pad + (x - minX) * scale + ((W - 2 * pad) - rangeX * scale) / 2;
    const ty = (y) => H - pad - (y - minY) * scale - ((H - 2 * pad) - rangeY * scale) / 2;

    const svg = createSvgRoot(W, H);
    svg.appendChild(svgRect(0, 0, W, H, { fill: "#fafbfc", stroke: "none", rx: 8 }));
    addArrowDef(svg);

    // 圆
    circles.forEach(c => {
      const center = ptMap[c.center];
      if (!center) return;
      svg.appendChild(svgCircle(tx(center.x), ty(center.y), c.radius * scale, { stroke: c.color || "#2563eb" }));
    });

    // 辅助线
    auxiliary.forEach(a => {
      const p1 = ptMap[a.from], p2 = ptMap[a.to];
      if (!p1 || !p2) return;
      svg.appendChild(svgLine(tx(p1.x), ty(p1.y), tx(p2.x), ty(p2.y), { dashed: true, stroke: "#94a3b8", strokeWidth: 1.5 }));
      if (a.label) {
        const [mx, my] = midpoint(tx(p1.x), ty(p1.y), tx(p2.x), ty(p2.y));
        svg.appendChild(setTextContent(svgText(mx + 8, my, "", { fontSize: 11, fill: "#64748b", italic: true }), a.label));
      }
    });

    // 线段
    segments.forEach(seg => {
      const p1 = ptMap[seg[0]], p2 = ptMap[seg[1]];
      if (!p1 || !p2) return;
      svg.appendChild(svgLine(tx(p1.x), ty(p1.y), tx(p2.x), ty(p2.y)));
    });

    // 角度标记
    angles.forEach(a => {
      const vp = ptMap[a.vertex];
      if (!vp) return;
      const connPts = [];
      segments.forEach(seg => {
        if (seg[0] === a.vertex && ptMap[seg[1]]) connPts.push(ptMap[seg[1]]);
        if (seg[1] === a.vertex && ptMap[seg[0]]) connPts.push(ptMap[seg[0]]);
      });
      auxiliary.forEach(aux => {
        if (aux.from === a.vertex && ptMap[aux.to]) connPts.push(ptMap[aux.to]);
        if (aux.to === a.vertex && ptMap[aux.from]) connPts.push(ptMap[aux.from]);
      });
      if (connPts.length < 2) return;

      const vx = tx(vp.x), vy = ty(vp.y);
      const isRight = a.value && (a.value.includes("90") || a.value === "direct_angle");

      if (a.mark && isRight) {
        const r = 14;
        const dx1 = tx(connPts[0].x) - vx, dy1 = ty(connPts[0].y) - vy;
        const dx2 = tx(connPts[1].x) - vx, dy2 = ty(connPts[1].y) - vy;
        const len1 = Math.sqrt(dx1*dx1+dy1*dy1)||1, len2 = Math.sqrt(dx2*dx2+dy2*dy2)||1;
        const ux1 = dx1/len1*r, uy1 = dy1/len1*r, ux2 = dx2/len2*r, uy2 = dy2/len2*r;
        svg.appendChild(svgPath(`M${vx+ux1},${vy+uy1} L${vx+ux1+ux2},${vy+uy1+uy2} L${vx+ux2},${vy+uy2}`, { stroke: "#475569", strokeWidth: 1.5 }));
      } else if (a.mark) {
        const r = 20;
        const ang1 = Math.atan2(ty(connPts[0].y)-vy, tx(connPts[0].x)-vx);
        const ang2 = Math.atan2(ty(connPts[1].y)-vy, tx(connPts[1].x)-vx);
        const sA = Math.min(ang1,ang2), eA = Math.max(ang1,ang2);
        const sx = vx+r*Math.cos(sA), sy = vy+r*Math.sin(sA);
        const ex = vx+r*Math.cos(eA), ey = vy+r*Math.sin(eA);
        svg.appendChild(svgPath(`M${sx},${sy} A${r},${r} 0 ${(eA-sA>Math.PI)?1:0},1 ${ex},${ey}`, { stroke: "#475569", strokeWidth: 1.5 }));
      }
      if (a.value && a.value !== "direct_angle") {
        const ang1 = Math.atan2(ty(connPts[0].y)-vy, tx(connPts[0].x)-vx);
        const ang2 = Math.atan2(ty(connPts[1].y)-vy, tx(connPts[1].x)-vx);
        const mA = (ang1+ang2)/2, lr = 30;
        svg.appendChild(setTextContent(svgText(vx+lr*Math.cos(mA), vy+lr*Math.sin(mA), "", { fontSize: 11, fill: "#475569" }), a.value));
      }
    });

    // 点和标签
    points.forEach(p => {
      const px = tx(p.x), py = ty(p.y);
      svg.appendChild(svgCircle(px, py, 3, { fill: "#1e293b", stroke: "none" }));
      let offX = 0, offY = -12;
      if (p.y <= minY + rangeY * 0.3) offY = 16;
      if (p.x <= minX + rangeX * 0.2) offX = -10;
      if (p.x >= maxX - rangeX * 0.2) offX = 10;
      svg.appendChild(setTextContent(svgText(px + offX, py + offY, "", { fontSize: 14, bold: true }), p.id));
    });

    // 边长标签
    labels.forEach(l => {
      const p1 = ptMap[l.from], p2 = ptMap[l.to];
      if (!p1 || !p2) return;
      const [mx, my] = midpoint(tx(p1.x), ty(p1.y), tx(p2.x), ty(p2.y));
      const dx = tx(p2.x)-tx(p1.x), dy = ty(p2.y)-ty(p1.y);
      const len = Math.sqrt(dx*dx+dy*dy)||1;
      svg.appendChild(setTextContent(svgText(mx + (-dy/len*14), my + (dx/len*14), "", { fontSize: 12, fill: "#2563eb" }), l.text));
    });

    if (spec.title) svg.appendChild(setTextContent(svgText(W/2, H-8, "", { fontSize: 11, fill: "#94a3b8" }), spec.title));
    this.container.appendChild(svg);
  }

  /* ----------------------------------------------------------
     数学 - 函数图像 (function_graph)
     ---------------------------------------------------------- */
  renderFunctionGraph(spec) {
    const d = safeObj(spec.data);
    const xRange = safeArr(d.xRange).length === 2 ? d.xRange : [-5, 5];
    const yRange = safeArr(d.yRange).length === 2 ? d.yRange : [-5, 5];
    const functions = safeArr(d.functions);
    const pts = safeArr(d.points);
    const asymptotes = safeArr(d.asymptotes);
    const gridStep = d.gridStep || 1;

    const W = 380, H = 300, pad = 40;
    const sx = (W - 2 * pad) / (xRange[1] - xRange[0]);
    const sy = (H - 2 * pad) / (yRange[1] - yRange[0]);
    const tx = (x) => pad + (x - xRange[0]) * sx;
    const ty = (y) => H - pad - (y - yRange[0]) * sy;

    const svg = createSvgRoot(W, H);
    svg.appendChild(svgRect(0, 0, W, H, { fill: '#fafbfc', stroke: 'none', rx: 8 }));
    addArrowDef(svg);

    // 网格
    for (let x = Math.ceil(xRange[0] / gridStep) * gridStep; x <= xRange[1]; x += gridStep) {
      if (Math.abs(x) < 0.001) continue;
      svg.appendChild(svgLine(tx(x), ty(yRange[0]), tx(x), ty(yRange[1]), { stroke: '#e2e8f0', strokeWidth: 0.5 }));
      svg.appendChild(setTextContent(svgText(tx(x), ty(0) + 16, '', { fontSize: 10, fill: '#94a3b8' }), String(x)));
    }
    for (let y = Math.ceil(yRange[0] / gridStep) * gridStep; y <= yRange[1]; y += gridStep) {
      if (Math.abs(y) < 0.001) continue;
      svg.appendChild(svgLine(tx(xRange[0]), ty(y), tx(xRange[1]), ty(y), { stroke: '#e2e8f0', strokeWidth: 0.5 }));
      svg.appendChild(setTextContent(svgText(tx(0) - 16, ty(y), '', { fontSize: 10, fill: '#94a3b8' }), String(y)));
    }

    // 坐标轴
    svg.appendChild(svgLine(tx(xRange[0]), ty(0), tx(xRange[1]), ty(0), { stroke: '#1e293b', strokeWidth: 1.5, arrow: true }));
    svg.appendChild(svgLine(tx(0), ty(yRange[0]), tx(0), ty(yRange[1]), { stroke: '#1e293b', strokeWidth: 1.5, arrow: true }));
    svg.appendChild(setTextContent(svgText(tx(xRange[1]) - 4, ty(0) + 16, '', { fontSize: 12, bold: true }), 'x'));
    svg.appendChild(setTextContent(svgText(tx(0) + 14, ty(yRange[1]) + 4, '', { fontSize: 12, bold: true }), 'y'));
    svg.appendChild(setTextContent(svgText(tx(0) - 10, ty(0) + 14, '', { fontSize: 10, fill: '#94a3b8' }), 'O'));

    // 渐近线
    asymptotes.forEach(a => {
      if (a.type === 'vertical') {
        svg.appendChild(svgLine(tx(a.value), ty(yRange[0]), tx(a.value), ty(yRange[1]), { dashed: true, stroke: '#ef4444', strokeWidth: 1 }));
      } else if (a.type === 'horizontal') {
        svg.appendChild(svgLine(tx(xRange[0]), ty(a.value), tx(xRange[1]), ty(a.value), { dashed: true, stroke: '#ef4444', strokeWidth: 1 }));
      }
    });

    // 安全的数学表达式求值
    function evalExpr(expr, xVal) {
      try {
        const safeExpr = expr
          .replace(/\bsin\b/g, 'Math.sin')
          .replace(/\bcos\b/g, 'Math.cos')
          .replace(/\btan\b/g, 'Math.tan')
          .replace(/\babs\b/g, 'Math.abs')
          .replace(/\bsqrt\b/g, 'Math.sqrt')
          .replace(/\bln\b/g, 'Math.log')
          .replace(/\blog\b/g, 'Math.log10')
          .replace(/\bexp\b/g, 'Math.exp')
          .replace(/\bpi\b/gi, 'Math.PI')
          .replace(/\^/g, '**');
        return new Function('x', 'return ' + safeExpr)(xVal);
      } catch { return NaN; }
    }

    // 绘制函数曲线
    const colors = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c'];
    functions.forEach((fn, fi) => {
      const color = fn.color || colors[fi % colors.length];
      const step = (xRange[1] - xRange[0]) / 300;
      let pathD = '';
      let drawing = false;

      for (let x = xRange[0]; x <= xRange[1]; x += step) {
        const y = evalExpr(fn.expr, x);
        if (isNaN(y) || !isFinite(y) || y < yRange[0] - 10 || y > yRange[1] + 10) {
          drawing = false;
          continue;
        }
        const px = tx(x), py = ty(y);
        if (!drawing) { pathD += 'M' + px + ',' + py + ' '; drawing = true; }
        else { pathD += 'L' + px + ',' + py + ' '; }
      }

      if (pathD) {
        svg.appendChild(svgPath(pathD, {
          stroke: color, strokeWidth: 2.5,
          dashed: fn.style === 'dashed'
        }));
      }

      if (fn.label) {
        const labelX = xRange[1] - (xRange[1] - xRange[0]) * 0.15;
        const labelY = evalExpr(fn.expr, labelX);
        if (isFinite(labelY) && labelY >= yRange[0] && labelY <= yRange[1]) {
          svg.appendChild(setTextContent(svgText(tx(labelX) + fn.label.length * 3.5 + 2, ty(labelY) - 4, '', { fontSize: 11, fill: color, anchor: 'middle' }), fn.label));
        }
      }
    });

    // 特殊点
    pts.forEach(p => {
      const px = tx(p.x), py = ty(p.y);
      if (p.style === 'hollow') {
        svg.appendChild(svgCircle(px, py, 4, { fill: '#fff', stroke: '#1e293b', strokeWidth: 2 }));
      } else {
        svg.appendChild(svgCircle(px, py, 4, { fill: '#1e293b', stroke: 'none' }));
      }
      if (p.label) {
        svg.appendChild(setTextContent(svgText(px + 8, py - 10, '', { fontSize: 11, fill: '#1e293b', anchor: 'start' }), p.label));
      }
    });

    if (spec.title) svg.appendChild(setTextContent(svgText(W/2, H-6, '', { fontSize: 11, fill: '#94a3b8' }), spec.title));
    this.container.appendChild(svg);
  }

  /* ----------------------------------------------------------
     数学 - 坐标系/向量 (coordinate)
     ---------------------------------------------------------- */
  renderCoordinate(spec) {
    const d = safeObj(spec.data);
    const xRange = safeArr(d.xRange).length === 2 ? d.xRange : [-4, 4];
    const yRange = safeArr(d.yRange).length === 2 ? d.yRange : [-4, 4];
    const vectors = safeArr(d.vectors);
    const pts = safeArr(d.points);
    const lines = safeArr(d.lines);

    const W = 360, H = 300, pad = 40;
    const sx = (W - 2*pad) / (xRange[1]-xRange[0]);
    const sy = (H - 2*pad) / (yRange[1]-yRange[0]);
    const tx = (x) => pad + (x - xRange[0]) * sx;
    const ty = (y) => H - pad - (y - yRange[0]) * sy;

    const svg = createSvgRoot(W, H);
    svg.appendChild(svgRect(0, 0, W, H, { fill: '#fafbfc', stroke: 'none', rx: 8 }));
    addArrowDef(svg);

    // 网格
    for (let x = Math.ceil(xRange[0]); x <= xRange[1]; x++) {
      svg.appendChild(svgLine(tx(x), ty(yRange[0]), tx(x), ty(yRange[1]), { stroke: '#e2e8f0', strokeWidth: 0.5 }));
      if (x !== 0) svg.appendChild(setTextContent(svgText(tx(x), ty(0)+14, '', { fontSize: 10, fill: '#94a3b8' }), String(x)));
    }
    for (let y = Math.ceil(yRange[0]); y <= yRange[1]; y++) {
      svg.appendChild(svgLine(tx(xRange[0]), ty(y), tx(xRange[1]), ty(y), { stroke: '#e2e8f0', strokeWidth: 0.5 }));
      if (y !== 0) svg.appendChild(setTextContent(svgText(tx(0)-14, ty(y), '', { fontSize: 10, fill: '#94a3b8' }), String(y)));
    }

    // 坐标轴
    svg.appendChild(svgLine(tx(xRange[0]), ty(0), tx(xRange[1]), ty(0), { stroke: '#1e293b', strokeWidth: 1.5, arrow: true }));
    svg.appendChild(svgLine(tx(0), ty(yRange[0]), tx(0), ty(yRange[1]), { stroke: '#1e293b', strokeWidth: 1.5, arrow: true }));
    svg.appendChild(setTextContent(svgText(tx(xRange[1])-4, ty(0)+16, '', { fontSize: 12, bold: true }), 'x'));
    svg.appendChild(setTextContent(svgText(tx(0)+14, ty(yRange[1])+4, '', { fontSize: 12, bold: true }), 'y'));
    svg.appendChild(setTextContent(svgText(tx(0)-10, ty(0)+14, '', { fontSize: 10, fill: '#94a3b8' }), 'O'));

    // 直线
    const lineColors = ['#16a34a', '#9333ea', '#ea580c'];
    lines.forEach((l, li) => {
      const color = l.color || lineColors[li % lineColors.length];
      const x1 = xRange[0], x2 = xRange[1];
      const y1 = l.slope * x1 + l.intercept;
      const y2 = l.slope * x2 + l.intercept;
      svg.appendChild(svgLine(tx(x1), ty(y1), tx(x2), ty(y2), { stroke: color, strokeWidth: 1.5, dashed: l.style === 'dashed' }));
      if (l.label) {
        svg.appendChild(setTextContent(svgText(tx(x2)-20, ty(y2)-10, '', { fontSize: 11, fill: color, italic: true }), l.label));
      }
    });

    // 向量
    const vecColors = ['#2563eb', '#dc2626', '#16a34a', '#9333ea'];
    vectors.forEach((v, vi) => {
      const color = v.color || vecColors[vi % vecColors.length];
      const from = safeArr(v.from), to = safeArr(v.to);
      if (from.length < 2 || to.length < 2) return;
      const arrowId = 'arrow_vec_' + vi;
      addArrowDef(svg, arrowId, color);
      const line = svgLine(tx(from[0]), ty(from[1]), tx(to[0]), ty(to[1]), { stroke: color, strokeWidth: 2.5 });
      line.setAttribute('marker-end', 'url(#' + arrowId + ')');
      svg.appendChild(line);
      if (v.label) {
        const [mx, my] = midpoint(tx(from[0]), ty(from[1]), tx(to[0]), ty(to[1]));
        svg.appendChild(setTextContent(svgText(mx+10, my-10, '', { fontSize: 13, fill: color, bold: true }), v.label));
      }
    });

    // 点
    pts.forEach(p => {
      const px = tx(p.x), py = ty(p.y);
      svg.appendChild(svgCircle(px, py, 4, { fill: '#1e293b', stroke: 'none' }));
      if (p.label) svg.appendChild(setTextContent(svgText(px+10, py-10, '', { fontSize: 11, fill: '#1e293b' }), p.label));
    });

    if (spec.title) svg.appendChild(setTextContent(svgText(W/2, H-6, '', { fontSize: 11, fill: '#94a3b8' }), spec.title));
    this.container.appendChild(svg);
  }


  /* ----------------------------------------------------------
     物理 - 力学图 (force)
     ---------------------------------------------------------- */
  renderForce(spec) {
    const d = safeObj(spec.data);
    const obj = safeObj(d.object);
    const surface = safeObj(d.surface);
    const forces = safeArr(d.forces);
    const annotations = safeArr(d.annotations);

    const W = 360, H = 280;
    const svg = createSvgRoot(W, H);
    svg.appendChild(svgRect(0, 0, W, H, { fill: '#fafbfc', stroke: 'none', rx: 8 }));
    addArrowDef(svg, 'arrowforce', '#dc2626');

    const cx = W / 2, cy = H / 2;
    const surfaceType = surface.type || 'flat';
    const inclineAngle = surface.angle || 0;
    const inclineRad = deg2rad(inclineAngle);

    if (surfaceType === 'incline' && inclineAngle > 0) {
      const baseLen = 240;
      const h = baseLen * Math.tan(inclineRad);
      const bx = W/2 - baseLen/2 + 20;
      const by = H - 50;
      svg.appendChild(svgPolygon([[bx, by], [bx + baseLen, by], [bx, by - h]], { fill: '#f1f5f9', stroke: '#475569', strokeWidth: 2 }));
      for (let i = 20; i < baseLen; i += 18) {
        svg.appendChild(svgLine(bx + i, by, bx + i - 8, by + 8, { stroke: '#94a3b8', strokeWidth: 1 }));
      }
      const arcR = 30;
      svg.appendChild(svgPath('M' + (bx + baseLen - arcR) + ',' + by + ' A' + arcR + ',' + arcR + ' 0 0,0 ' + (bx + baseLen - arcR * Math.cos(inclineRad)) + ',' + (by - arcR * Math.sin(inclineRad)), { stroke: '#475569', strokeWidth: 1.5 }));
      svg.appendChild(setTextContent(svgText(bx + baseLen - arcR - 16, by - 12, '', { fontSize: 12, fill: '#475569' }), inclineAngle + '\u00B0'));

      const objW = 50, objH = 36;
      const slopeMidX = bx + baseLen * 0.45;
      const slopeMidY = by - h * 0.55;
      const g = svgGroup('translate(' + slopeMidX + ',' + slopeMidY + ') rotate(' + (-inclineAngle) + ')');
      g.appendChild(svgRect(-objW/2, -objH, objW, objH, { fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2, rx: 3 }));
      g.appendChild(setTextContent(svgText(0, -objH/2, '', { fontSize: 12, fill: '#1e293b', bold: true }), obj.label || 'm'));
      svg.appendChild(g);

      const forceLen = { small: 40, medium: 60, large: 80 };
      forces.forEach(f => {
        const len = forceLen[f.magnitude] || 60;
        let fx = slopeMidX, fy = slopeMidY - objH/2;
        let dx = 0, dy = 0;
        const dir = f.direction || '';
        if (dir === 'down' || dir === 'gravity') { dx = 0; dy = len; }
        else if (dir === 'up') { dx = 0; dy = -len; }
        else if (dir === 'normal') { dx = -len * Math.sin(inclineRad); dy = -len * Math.cos(inclineRad); }
        else if (dir.includes('friction_up')) { dx = -len * Math.cos(inclineRad); dy = len * Math.sin(inclineRad); }
        else if (dir.includes('friction_down')) { dx = len * Math.cos(inclineRad); dy = -len * Math.sin(inclineRad); }
        else if (dir === 'left') { dx = -len; dy = 0; }
        else if (dir === 'right') { dx = len; dy = 0; }
        if (dx === 0 && dy === 0) return;
        const arrow = svgLine(fx, fy, fx + dx, fy + dy, { stroke: '#dc2626', strokeWidth: 2.5 });
        arrow.setAttribute('marker-end', 'url(#arrowforce)');
        svg.appendChild(arrow);
        svg.appendChild(setTextContent(svgText(fx + dx + (dx > 0 ? 8 : -8), fy + dy + (dy > 0 ? 14 : -6), '', { fontSize: 13, fill: '#dc2626', bold: true, italic: true }), f.label || ''));
      });
    } else {
      svg.appendChild(svgLine(40, cy + 40, W - 40, cy + 40, { stroke: '#475569', strokeWidth: 2 }));
      for (let i = 50; i < W - 40; i += 14) {
        svg.appendChild(svgLine(i, cy + 40, i - 6, cy + 48, { stroke: '#94a3b8', strokeWidth: 1 }));
      }
      const objW = 60, objH = 44;
      svg.appendChild(svgRect(cx - objW/2, cy + 40 - objH, objW, objH, { fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2, rx: 4 }));
      svg.appendChild(setTextContent(svgText(cx, cy + 40 - objH/2, '', { fontSize: 13, fill: '#1e293b', bold: true }), obj.label || 'm'));

      const forceLen = { small: 40, medium: 60, large: 80 };
      forces.forEach(f => {
        const len = forceLen[f.magnitude] || 60;
        const objTop = cy + 40 - objH;
        let fx = cx, fy = objTop;
        let dx = 0, dy = 0;
        const dir = f.direction || '';
        if (dir === 'down' || dir === 'gravity') { fy = cy + 40; dx = 0; dy = len; }
        else if (dir === 'up' || dir === 'normal') { dx = 0; dy = -len; }
        else if (dir === 'left' || dir.includes('friction_left')) { fy = cy + 40 - objH/2; dx = -len; dy = 0; }
        else if (dir === 'right' || dir.includes('friction_right') || dir === 'applied') { fy = cy + 40 - objH/2; dx = len; dy = 0; }
        if (dx === 0 && dy === 0) return;
        const arrow = svgLine(fx, fy, fx + dx, fy + dy, { stroke: '#dc2626', strokeWidth: 2.5 });
        arrow.setAttribute('marker-end', 'url(#arrowforce)');
        svg.appendChild(arrow);
        svg.appendChild(setTextContent(svgText(fx + dx + (dx > 0 ? 10 : dx < 0 ? -10 : 8), fy + dy + (dy > 0 ? 16 : dy < 0 ? -8 : 0), '', { fontSize: 13, fill: '#dc2626', bold: true, italic: true }), f.label || ''));
      });
    }

    annotations.forEach((a, i) => {
      svg.appendChild(setTextContent(svgText(W - 20, 20 + i * 18, '', { fontSize: 11, fill: '#64748b', anchor: 'end' }), a));
    });
    if (spec.title) svg.appendChild(setTextContent(svgText(W/2, H-8, '', { fontSize: 11, fill: '#94a3b8' }), spec.title));
    this.container.appendChild(svg);
  }

  /* ----------------------------------------------------------
     物理 - 电路图 (circuit)
     ---------------------------------------------------------- */
  renderCircuit(spec) {
    const d = safeObj(spec.data);
    const components = safeArr(d.components);

    const W = 400, H = 280;
    const svg = createSvgRoot(W, H);
    svg.appendChild(svgRect(0, 0, W, H, { fill: '#fafbfc', stroke: 'none', rx: 8 }));

    const drawComp = (type, cx, cy, label) => {
      const g = svgGroup('translate(' + cx + ',' + cy + ')');
      switch (type) {
        case 'battery':
          g.appendChild(svgLine(-20, 0, -8, 0, { stroke: '#1e293b', strokeWidth: 2 }));
          g.appendChild(svgLine(-8, -14, -8, 14, { stroke: '#1e293b', strokeWidth: 2.5 }));
          g.appendChild(svgLine(-2, -8, -2, 8, { stroke: '#1e293b', strokeWidth: 1.5 }));
          g.appendChild(svgLine(4, -14, 4, 14, { stroke: '#1e293b', strokeWidth: 2.5 }));
          g.appendChild(svgLine(10, -8, 10, 8, { stroke: '#1e293b', strokeWidth: 1.5 }));
          g.appendChild(svgLine(10, 0, 20, 0, { stroke: '#1e293b', strokeWidth: 2 }));
          break;
        case 'resistor':
          g.appendChild(svgLine(-25, 0, -15, 0, { stroke: '#1e293b', strokeWidth: 2 }));
          g.appendChild(svgRect(-15, -8, 30, 16, { stroke: '#1e293b', strokeWidth: 2 }));
          g.appendChild(svgLine(15, 0, 25, 0, { stroke: '#1e293b', strokeWidth: 2 }));
          break;
        case 'capacitor':
          g.appendChild(svgLine(-20, 0, -4, 0, { stroke: '#1e293b', strokeWidth: 2 }));
          g.appendChild(svgLine(-4, -12, -4, 12, { stroke: '#1e293b', strokeWidth: 2.5 }));
          g.appendChild(svgLine(4, -12, 4, 12, { stroke: '#1e293b', strokeWidth: 2.5 }));
          g.appendChild(svgLine(4, 0, 20, 0, { stroke: '#1e293b', strokeWidth: 2 }));
          break;
        case 'switch':
          g.appendChild(svgLine(-20, 0, -6, 0, { stroke: '#1e293b', strokeWidth: 2 }));
          g.appendChild(svgCircle(-6, 0, 3, { fill: '#1e293b', stroke: 'none' }));
          g.appendChild(svgCircle(14, 0, 3, { fill: '#1e293b', stroke: 'none' }));
          g.appendChild(svgLine(-6, 0, 12, -12, { stroke: '#1e293b', strokeWidth: 2 }));
          g.appendChild(svgLine(14, 0, 20, 0, { stroke: '#1e293b', strokeWidth: 2 }));
          break;
        case 'ammeter':
          g.appendChild(svgLine(-20, 0, -12, 0, { stroke: '#1e293b', strokeWidth: 2 }));
          g.appendChild(svgCircle(0, 0, 12, { stroke: '#1e293b', strokeWidth: 2 }));
          g.appendChild(setTextContent(svgText(0, 0, '', { fontSize: 12, bold: true }), 'A'));
          g.appendChild(svgLine(12, 0, 20, 0, { stroke: '#1e293b', strokeWidth: 2 }));
          break;
        case 'voltmeter':
          g.appendChild(svgLine(-20, 0, -12, 0, { stroke: '#1e293b', strokeWidth: 2 }));
          g.appendChild(svgCircle(0, 0, 12, { stroke: '#1e293b', strokeWidth: 2 }));
          g.appendChild(setTextContent(svgText(0, 0, '', { fontSize: 12, bold: true }), 'V'));
          g.appendChild(svgLine(12, 0, 20, 0, { stroke: '#1e293b', strokeWidth: 2 }));
          break;
        case 'bulb': case 'lamp':
          g.appendChild(svgLine(-20, 0, -10, 0, { stroke: '#1e293b', strokeWidth: 2 }));
          g.appendChild(svgCircle(0, 0, 10, { stroke: '#1e293b', strokeWidth: 2 }));
          g.appendChild(svgLine(-7, -7, 7, 7, { stroke: '#1e293b', strokeWidth: 1.5 }));
          g.appendChild(svgLine(-7, 7, 7, -7, { stroke: '#1e293b', strokeWidth: 1.5 }));
          g.appendChild(svgLine(10, 0, 20, 0, { stroke: '#1e293b', strokeWidth: 2 }));
          break;
        default:
          g.appendChild(svgRect(-15, -10, 30, 20, { stroke: '#1e293b', strokeWidth: 2, rx: 3 }));
          g.appendChild(setTextContent(svgText(0, 0, '', { fontSize: 10 }), type));
      }
      if (label) g.appendChild(setTextContent(svgText(0, -22, '', { fontSize: 12, fill: '#1e293b' }), label));
      return g;
    };

    if (components.length > 0) {
      const margin = 60;
      const innerW = W - 2 * margin, innerH = H - 2 * margin;
      const n = components.length;
      const positions = [];
      const sides = [
        [margin + innerW/2, margin],
        [margin + innerW, margin + innerH/2],
        [margin + innerW/2, margin + innerH],
        [margin, margin + innerH/2]
      ];
      for (let i = 0; i < n; i++) positions.push(sides[i % 4]);

      const corners = [[margin, margin], [margin + innerW, margin], [margin + innerW, margin + innerH], [margin, margin + innerH]];
      svg.appendChild(svgPolygon(corners, { stroke: '#475569', strokeWidth: 2 }));

      components.forEach((comp, i) => {
        if (i < positions.length) {
          const [px, py] = positions[i];
          svg.appendChild(svgRect(px - 28, py - 20, 56, 40, { fill: '#fafbfc', stroke: 'none' }));
          svg.appendChild(drawComp(comp.type, px, py, comp.label));
        }
      });
    }

    if (spec.title) svg.appendChild(setTextContent(svgText(W/2, H-8, '', { fontSize: 11, fill: '#94a3b8' }), spec.title));
    this.container.appendChild(svg);
  }

  /* ----------------------------------------------------------
     物理 - 光学图 (optics)
     ---------------------------------------------------------- */
  renderOptics(spec) {
    const d = safeObj(spec.data);
    const elements = safeArr(d.elements);
    const axisRange = safeArr(d.axisRange).length === 2 ? d.axisRange : [-30, 30];
    const showRays = d.rays !== false;

    const W = 400, H = 240, pad = 30;
    const sx = (W - 2 * pad) / (axisRange[1] - axisRange[0]);
    const tx = (x) => pad + (x - axisRange[0]) * sx;
    const cy = H / 2;

    const svg = createSvgRoot(W, H);
    svg.appendChild(svgRect(0, 0, W, H, { fill: '#fafbfc', stroke: 'none', rx: 8 }));
    addArrowDef(svg, 'arrowray', '#dc2626');

    svg.appendChild(svgLine(pad, cy, W - pad, cy, { stroke: '#94a3b8', strokeWidth: 1, dashed: true }));

    let lensX = null, focalLen = null, objX = null, objH = null;

    elements.forEach(el => {
      const px = tx(el.position || 0);
      if (el.type === 'convex_lens') {
        lensX = px; focalLen = (el.focalLength || 10) * sx;
        const lensH = 70;
        svg.appendChild(svgPath('M' + px + ',' + (cy - lensH) + ' Q' + (px + 12) + ',' + cy + ' ' + px + ',' + (cy + lensH), { stroke: '#2563eb', strokeWidth: 2.5 }));
        svg.appendChild(svgPath('M' + px + ',' + (cy - lensH) + ' Q' + (px - 12) + ',' + cy + ' ' + px + ',' + (cy + lensH), { stroke: '#2563eb', strokeWidth: 2.5 }));
        svg.appendChild(setTextContent(svgText(px - focalLen, cy + 16, '', { fontSize: 10, fill: '#2563eb' }), 'F'));
        svg.appendChild(svgCircle(px - focalLen, cy, 3, { fill: '#2563eb', stroke: 'none' }));
        svg.appendChild(setTextContent(svgText(px + focalLen, cy + 16, '', { fontSize: 10, fill: '#2563eb' }), "F'"));
        svg.appendChild(svgCircle(px + focalLen, cy, 3, { fill: '#2563eb', stroke: 'none' }));
      }
      if (el.type === 'concave_lens') {
        lensX = px; focalLen = (el.focalLength || 10) * sx;
        const lensH = 70;
        svg.appendChild(svgPath('M' + px + ',' + (cy - lensH) + ' Q' + (px - 10) + ',' + cy + ' ' + px + ',' + (cy + lensH), { stroke: '#2563eb', strokeWidth: 2.5 }));
        svg.appendChild(svgPath('M' + px + ',' + (cy - lensH) + ' Q' + (px + 10) + ',' + cy + ' ' + px + ',' + (cy + lensH), { stroke: '#2563eb', strokeWidth: 2.5 }));
      }
      if (el.type === 'object') {
        objX = px; objH = (el.height || 3) * sx * 0.5;
        svg.appendChild(svgLine(px, cy, px, cy - objH, { stroke: '#16a34a', strokeWidth: 2.5 }));
        svg.appendChild(svgPolygon([[px, cy - objH], [px - 5, cy - objH + 10], [px + 5, cy - objH + 10]], { fill: '#16a34a', stroke: 'none' }));
        svg.appendChild(setTextContent(svgText(px - 10, cy - objH - 8, '', { fontSize: 11, fill: '#16a34a', bold: true }), '\u7269'));
      }
    });

    if (showRays && lensX !== null && focalLen !== null && objX !== null && objH !== null) {
      const u = lensX - objX;
      if (Math.abs(u) > 1 && Math.abs(u - focalLen) > 1) {
        const v = (focalLen * u) / (u - focalLen);
        const imgH = -(v / u) * objH;
        const imgX = lensX + v;
        if (imgX > pad && imgX < W - pad) {
          svg.appendChild(svgLine(imgX, cy, imgX, cy - imgH, { stroke: '#ea580c', strokeWidth: 2, dashed: v < 0 }));
          svg.appendChild(setTextContent(svgText(imgX + 10, cy - imgH, '', { fontSize: 11, fill: '#ea580c', bold: true }), '\u50CF'));
        }
        const objTop = cy - objH;
        svg.appendChild(svgLine(objX, objTop, lensX, objTop, { stroke: '#dc2626', strokeWidth: 1.5 }));
        if (v > 0) svg.appendChild(svgLine(lensX, objTop, imgX, cy - imgH, { stroke: '#dc2626', strokeWidth: 1.5 }));
        const ray2slope = (objTop - cy) / (objX - lensX);
        const ray2endX = v > 0 ? imgX : lensX + (lensX - objX);
        const ray2endY = cy + ray2slope * (ray2endX - lensX);
        svg.appendChild(svgLine(objX, objTop, ray2endX, ray2endY, { stroke: '#dc2626', strokeWidth: 1.5 }));
      }
    }

    if (spec.title) svg.appendChild(setTextContent(svgText(W/2, H-8, '', { fontSize: 11, fill: '#94a3b8' }), spec.title));
    this.container.appendChild(svg);
  }


  /* ----------------------------------------------------------
     化学 - 分子结构 (molecule) - 使用 SmilesDrawer
     ---------------------------------------------------------- */
  renderMolecule(spec) {
    const d = safeObj(spec.data);
    const smiles = d.smiles || '';
    const name = d.name || '';

    if (!smiles) {
      return this.renderError('SMILES 为空，无法渲染分子结构');
    }

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'text-align:center;padding:12px;background:#fafbfc;border-radius:8px;border:1px solid #e2e8f0;';

    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 260;
    canvas.style.cssText = 'display:block;margin:0 auto;max-width:100%;';
    wrapper.appendChild(canvas);

    if (name) {
      const label = document.createElement('div');
      label.style.cssText = 'margin-top:8px;font-size:13px;color:#475569;font-weight:bold;';
      label.textContent = name;
      wrapper.appendChild(label);
    }

    this.container.appendChild(wrapper);

    // SmilesDrawer 渲染
    if (typeof SmilesDrawer !== 'undefined') {
      try {
        const smilesDrawer = new SmilesDrawer.Drawer({ width: 360, height: 260, bondThickness: 1.5, fontSizeLarge: 12, fontSizeSmall: 8, padding: 20 });
        SmilesDrawer.parse(smiles, function(tree) {
          smilesDrawer.draw(tree, canvas, 'light');
        }, function(err) {
          console.error('SmilesDrawer parse error:', err);
          canvas.style.display = 'none';
          const fallback = document.createElement('div');
          fallback.style.cssText = 'padding:20px;color:#991b1b;font-size:13px;';
          fallback.textContent = 'SMILES: ' + smiles + ' (解析失败)';
          wrapper.insertBefore(fallback, wrapper.firstChild);
        });
      } catch (e) {
        console.error('SmilesDrawer error:', e);
      }
    } else {
      // SmilesDrawer 未加载，显示文本
      canvas.style.display = 'none';
      const fallback = document.createElement('div');
      fallback.style.cssText = 'padding:20px;color:#64748b;font-size:14px;font-family:monospace;';
      fallback.textContent = 'SMILES: ' + smiles;
      wrapper.insertBefore(fallback, wrapper.firstChild);
    }
  }

  /* ----------------------------------------------------------
     化学 - 反应方程式 (reaction)
     ---------------------------------------------------------- */
  renderReaction(spec) {
    const d = safeObj(spec.data);
    const steps = safeArr(d.steps);

    const W = 420, H = 60 + steps.length * 56;
    const svg = createSvgRoot(W, Math.max(H, 100));
    svg.appendChild(svgRect(0, 0, W, Math.max(H, 100), { fill: '#fafbfc', stroke: 'none', rx: 8 }));
    addArrowDef(svg);

    steps.forEach((step, si) => {
      const y = 40 + si * 56;
      const reactants = safeArr(step.reactants).join(' + ');
      const products = safeArr(step.products).join(' + ');
      const conditions = safeArr(step.conditions).join(', ');

      // 反应物
      const rText = setTextContent(svgText(20, y, '', { fontSize: 15, fill: '#1e293b', anchor: 'start' }), reactants);
      svg.appendChild(rText);

      // 箭头
      const arrowX = 180;
      svg.appendChild(svgLine(arrowX, y, arrowX + 60, y, { stroke: '#1e293b', strokeWidth: 2, arrow: true }));

      // 条件标注
      if (conditions) {
        svg.appendChild(setTextContent(svgText(arrowX + 30, y - 12, '', { fontSize: 10, fill: '#64748b' }), conditions));
      }

      // 生成物
      const pText = setTextContent(svgText(arrowX + 70, y, '', { fontSize: 15, fill: '#1e293b', anchor: 'start' }), products);
      svg.appendChild(pText);
    });

    if (spec.title) svg.appendChild(setTextContent(svgText(W/2, Math.max(H, 100) - 8, '', { fontSize: 11, fill: '#94a3b8' }), spec.title));
    this.container.appendChild(svg);
  }

  /* ----------------------------------------------------------
     化学 - 实验装置 (apparatus)
     ---------------------------------------------------------- */
  renderApparatus(spec) {
    const d = safeObj(spec.data);
    const equipment = safeArr(d.equipment);

    const W = 420, H = 280;
    const svg = createSvgRoot(W, H);
    svg.appendChild(svgRect(0, 0, W, H, { fill: '#fafbfc', stroke: 'none', rx: 8 }));
    addArrowDef(svg);

    const drawEquip = (type, cx, cy, label, content) => {
      const g = svgGroup('translate(' + cx + ',' + cy + ')');
      switch (type) {
        case 'flask':
        case 'round_flask': {
          // 圆底烧瓶
          g.appendChild(svgPath('M-8,-40 L-8,-20 Q-8,-10 -25,5 Q-35,20 -30,35 Q-25,50 0,52 Q25,50 30,35 Q35,20 25,5 Q8,-10 8,-20 L8,-40', { stroke: '#475569', strokeWidth: 2 }));
          g.appendChild(svgLine(-8, -40, 8, -40, { stroke: '#475569', strokeWidth: 2 }));
          if (content) g.appendChild(setTextContent(svgText(0, 25, '', { fontSize: 10, fill: '#2563eb' }), content));
          break;
        }
        case 'beaker': {
          g.appendChild(svgRect(-25, -35, 50, 70, { stroke: '#475569', strokeWidth: 2, rx: 2 }));
          g.appendChild(svgLine(-25, -35, -30, -30, { stroke: '#475569', strokeWidth: 2 }));
          if (content) {
            g.appendChild(svgRect(-23, 0, 46, 33, { fill: '#dbeafe', stroke: 'none' }));
            g.appendChild(setTextContent(svgText(0, 16, '', { fontSize: 10, fill: '#2563eb' }), content));
          }
          break;
        }
        case 'tube':
        case 'test_tube': {
          g.appendChild(svgPath('M-8,-35 L-8,20 Q-8,35 0,35 Q8,35 8,20 L8,-35', { stroke: '#475569', strokeWidth: 2 }));
          if (content) g.appendChild(setTextContent(svgText(0, 10, '', { fontSize: 9, fill: '#2563eb' }), content));
          break;
        }
        case 'alcohol_lamp': {
          g.appendChild(svgPath('M-18,0 Q-20,-15 -12,-20 L12,-20 Q20,-15 18,0 Z', { stroke: '#475569', strokeWidth: 2, fill: '#fef3c7' }));
          g.appendChild(svgLine(0, -20, 0, -30, { stroke: '#475569', strokeWidth: 1.5 }));
          g.appendChild(svgPath('M-4,-30 Q0,-40 4,-30', { stroke: '#ea580c', strokeWidth: 2, fill: '#fbbf24' }));
          break;
        }
        case 'funnel': {
          g.appendChild(svgPath('M-20,-20 L-5,15 L-5,35 L5,35 L5,15 L20,-20 Z', { stroke: '#475569', strokeWidth: 2 }));
          break;
        }
        case 'gas_jar':
        case 'collecting_bottle': {
          g.appendChild(svgRect(-22, -35, 44, 70, { stroke: '#475569', strokeWidth: 2, rx: 4 }));
          g.appendChild(svgLine(-15, -35, 15, -35, { stroke: '#475569', strokeWidth: 3 }));
          if (content) g.appendChild(setTextContent(svgText(0, 5, '', { fontSize: 10, fill: '#2563eb' }), content));
          break;
        }
        default: {
          g.appendChild(svgRect(-20, -25, 40, 50, { stroke: '#475569', strokeWidth: 2, rx: 4 }));
          g.appendChild(setTextContent(svgText(0, 0, '', { fontSize: 10, fill: '#475569' }), type));
        }
      }
      if (label) g.appendChild(setTextContent(svgText(0, 52, '', { fontSize: 11, fill: '#1e293b' }), label));
      return g;
    };

    // 自动布局
    const n = equipment.length;
    const spacing = W / (n + 1);
    equipment.forEach((eq, i) => {
      const cx = spacing * (i + 1);
      const cy = H / 2 - 10;
      svg.appendChild(drawEquip(eq.type, cx, cy, eq.label, eq.content));
      // 连接线
      if (i < n - 1) {
        svg.appendChild(svgLine(cx + 35, cy - 10, cx + spacing - 35, cy - 10, { stroke: '#475569', strokeWidth: 2 }));
      }
    });

    if (spec.title) svg.appendChild(setTextContent(svgText(W/2, H-8, '', { fontSize: 11, fill: '#94a3b8' }), spec.title));
    this.container.appendChild(svg);
  }


  /* ----------------------------------------------------------
     生物 - 细胞结构图 (cell)
     ---------------------------------------------------------- */
  renderCell(spec) {
    const d = safeObj(spec.data);
    const cellType = d.cellType || 'animal';
    const structures = safeArr(d.structures);
    const highlighted = safeArr(d.highlighted);
    const showLabels = d.labels !== false;

    const W = 380, H = 300;
    const svg = createSvgRoot(W, H);
    svg.appendChild(svgRect(0, 0, W, H, { fill: '#fafbfc', stroke: 'none', rx: 8 }));

    const cx = W / 2, cy = H / 2 - 10;

    // 细胞壁（植物）
    if (cellType === 'plant') {
      svg.appendChild(svgRect(cx - 130, cy - 95, 260, 190, { stroke: '#16a34a', strokeWidth: 3, rx: 8, fill: '#f0fdf4' }));
    }

    // 细胞膜
    if (structures.includes('cell_membrane') || structures.length === 0) {
      if (cellType === 'plant') {
        svg.appendChild(svgRect(cx - 120, cy - 85, 240, 170, { stroke: '#2563eb', strokeWidth: 2, rx: 6, fill: '#eff6ff', dashed: true }));
      } else {
        svg.appendChild(createSvgElement('ellipse', { cx, cy, rx: 130, ry: 90, fill: '#eff6ff', stroke: '#2563eb', 'stroke-width': 2 }));
      }
    }

    // 细胞核
    const hasNucleus = structures.includes('nucleus') || structures.length === 0;
    if (hasNucleus) {
      const isHL = highlighted.includes('nucleus');
      svg.appendChild(svgCircle(cx - 20, cy, 35, { fill: isHL ? '#fef3c7' : '#e0e7ff', stroke: isHL ? '#d97706' : '#4f46e5', strokeWidth: 2 }));
      svg.appendChild(svgCircle(cx - 20, cy, 10, { fill: isHL ? '#fbbf24' : '#818cf8', stroke: 'none' }));
      if (showLabels) svg.appendChild(setTextContent(svgText(cx - 20, cy + 48, '', { fontSize: 10, fill: '#4f46e5' }), '\u7EC6\u80DE\u6838'));
    }

    // 线粒体
    if (structures.includes('mitochondria')) {
      const isHL = highlighted.includes('mitochondria');
      const mx = cx + 60, my = cy - 30;
      svg.appendChild(createSvgElement('ellipse', { cx: mx, cy: my, rx: 22, ry: 12, fill: isHL ? '#fef3c7' : '#dcfce7', stroke: isHL ? '#d97706' : '#16a34a', 'stroke-width': 2 }));
      // 内膜嵴
      svg.appendChild(svgPath('M' + (mx-12) + ',' + (my-4) + ' Q' + mx + ',' + (my-10) + ' ' + (mx+12) + ',' + (my-4), { stroke: isHL ? '#d97706' : '#16a34a', strokeWidth: 1 }));
      svg.appendChild(svgPath('M' + (mx-10) + ',' + (my+4) + ' Q' + mx + ',' + (my+10) + ' ' + (mx+10) + ',' + (my+4), { stroke: isHL ? '#d97706' : '#16a34a', strokeWidth: 1 }));
      if (showLabels) svg.appendChild(setTextContent(svgText(mx, my + 22, '', { fontSize: 10, fill: '#16a34a' }), '\u7EBF\u7C92\u4F53'));
    }

    // 核糖体
    if (structures.includes('ribosome')) {
      const isHL = highlighted.includes('ribosome');
      const positions = [[cx + 40, cy + 20], [cx + 55, cy + 10], [cx + 30, cy + 35], [cx + 50, cy + 30]];
      positions.forEach(([rx, ry]) => {
        svg.appendChild(svgCircle(rx, ry, 3, { fill: isHL ? '#fbbf24' : '#6366f1', stroke: 'none' }));
      });
      if (showLabels) svg.appendChild(setTextContent(svgText(cx + 55, cy + 45, '', { fontSize: 10, fill: '#6366f1' }), '\u6838\u7CD6\u4F53'));
    }

    // 内质网
    if (structures.includes('endoplasmic_reticulum')) {
      const isHL = highlighted.includes('endoplasmic_reticulum');
      const erX = cx - 70, erY = cy - 20;
      svg.appendChild(svgPath('M' + erX + ',' + erY + ' Q' + (erX+15) + ',' + (erY-15) + ' ' + (erX+30) + ',' + erY + ' Q' + (erX+45) + ',' + (erY+15) + ' ' + (erX+60) + ',' + erY, { stroke: isHL ? '#d97706' : '#a855f7', strokeWidth: 1.5 }));
      svg.appendChild(svgPath('M' + erX + ',' + (erY+12) + ' Q' + (erX+15) + ',' + (erY-3) + ' ' + (erX+30) + ',' + (erY+12) + ' Q' + (erX+45) + ',' + (erY+27) + ' ' + (erX+60) + ',' + (erY+12), { stroke: isHL ? '#d97706' : '#a855f7', strokeWidth: 1.5 }));
      if (showLabels) svg.appendChild(setTextContent(svgText(erX + 30, erY + 30, '', { fontSize: 10, fill: '#a855f7' }), '\u5185\u8D28\u7F51'));
    }

    // 高尔基体
    if (structures.includes('golgi')) {
      const isHL = highlighted.includes('golgi');
      const gx = cx + 70, gy = cy + 10;
      for (let i = 0; i < 4; i++) {
        svg.appendChild(svgPath('M' + (gx-18) + ',' + (gy + i*6) + ' Q' + gx + ',' + (gy + i*6 - 5) + ' ' + (gx+18) + ',' + (gy + i*6), { stroke: isHL ? '#d97706' : '#ea580c', strokeWidth: 1.5 }));
      }
      if (showLabels) svg.appendChild(setTextContent(svgText(gx, gy + 32, '', { fontSize: 10, fill: '#ea580c' }), '\u9AD8\u5C14\u57FA\u4F53'));
    }

    // 叶绿体（植物）
    if (structures.includes('chloroplast')) {
      const isHL = highlighted.includes('chloroplast');
      const clx = cx - 80, cly = cy + 30;
      svg.appendChild(createSvgElement('ellipse', { cx: clx, cy: cly, rx: 25, ry: 14, fill: isHL ? '#fef3c7' : '#bbf7d0', stroke: isHL ? '#d97706' : '#15803d', 'stroke-width': 2 }));
      // 基粒
      for (let i = -1; i <= 1; i++) {
        svg.appendChild(svgRect(clx + i * 12 - 4, cly - 6, 8, 12, { fill: isHL ? '#fbbf24' : '#15803d', stroke: 'none', rx: 2 }));
      }
      if (showLabels) svg.appendChild(setTextContent(svgText(clx, cly + 24, '', { fontSize: 10, fill: '#15803d' }), '\u53F6\u7EFF\u4F53'));
    }

    // 液泡（植物）
    if (structures.includes('vacuole')) {
      const isHL = highlighted.includes('vacuole');
      svg.appendChild(createSvgElement('ellipse', { cx: cx + 20, cy: cy + 20, rx: 40, ry: 25, fill: isHL ? '#fef3c7' : '#e0f2fe', stroke: isHL ? '#d97706' : '#0284c7', 'stroke-width': 1.5, 'stroke-dasharray': '4,3' }));
      if (showLabels) svg.appendChild(setTextContent(svgText(cx + 20, cy + 55, '', { fontSize: 10, fill: '#0284c7' }), '\u6DB2\u6CE1'));
    }

    // 标题
    if (cellType === 'plant') {
      svg.appendChild(setTextContent(svgText(W/2, 18, '', { fontSize: 12, fill: '#16a34a', bold: true }), '\u690D\u7269\u7EC6\u80DE\u7ED3\u6784\u56FE'));
    } else {
      svg.appendChild(setTextContent(svgText(W/2, 18, '', { fontSize: 12, fill: '#2563eb', bold: true }), '\u52A8\u7269\u7EC6\u80DE\u7ED3\u6784\u56FE'));
    }

    if (spec.title) svg.appendChild(setTextContent(svgText(W/2, H-8, '', { fontSize: 11, fill: '#94a3b8' }), spec.title));
    this.container.appendChild(svg);
  }

  /* ----------------------------------------------------------
     生物 - 流程图 (process_flow) - 使用 Mermaid 或自建
     ---------------------------------------------------------- */
  renderProcessFlow(spec) {
    const d = safeObj(spec.data);
    const nodes = safeArr(d.nodes);
    const edges = safeArr(d.edges);

    if (nodes.length === 0) return this.renderError('流程图节点为空');

    // 尝试使用 Mermaid
    if (typeof mermaid !== 'undefined') {
      const mermaidDiv = document.createElement('div');
      mermaidDiv.style.cssText = 'text-align:center;padding:12px;background:#fafbfc;border-radius:8px;border:1px solid #e2e8f0;';
      const id = nextDiagramId();
      mermaidDiv.id = id;

      let mermaidCode = 'graph LR\n';
      nodes.forEach(n => {
        const shape = n.shape === 'diamond' ? '{' + n.text + '}' : n.shape === 'circle' ? '((' + n.text + '))' : '[' + n.text + ']';
        mermaidCode += '  ' + n.id + shape + '\n';
      });
      edges.forEach(e => {
        const label = e.label ? '|' + e.label + '|' : '';
        mermaidCode += '  ' + e.from + ' -->' + label + ' ' + e.to + '\n';
      });

      mermaidDiv.textContent = mermaidCode;
      this.container.appendChild(mermaidDiv);

      try {
        mermaid.run({ nodes: [mermaidDiv] });
      } catch (e) {
        console.warn('Mermaid render failed, using SVG fallback:', e);
        this.container.removeChild(mermaidDiv);
        this._renderProcessFlowSVG(nodes, edges, spec);
      }
      return;
    }

    this._renderProcessFlowSVG(nodes, edges, spec);
  }

  _renderProcessFlowSVG(nodes, edges, spec) {
    const n = nodes.length;
    const nodeW = 90, nodeH = 36, gap = 50;
    const W = Math.max(400, n * (nodeW + gap) + 40);
    const H = 120;

    const svg = createSvgRoot(W, H);
    svg.appendChild(svgRect(0, 0, W, H, { fill: '#fafbfc', stroke: 'none', rx: 8 }));
    addArrowDef(svg);

    const nodeMap = {};
    nodes.forEach((nd, i) => {
      const cx = 40 + i * (nodeW + gap) + nodeW / 2;
      const cy = H / 2;
      nodeMap[nd.id] = { cx, cy };

      if (nd.shape === 'diamond') {
        const pts = [[cx, cy - nodeH/2 - 4], [cx + nodeW/2, cy], [cx, cy + nodeH/2 + 4], [cx - nodeW/2, cy]];
        svg.appendChild(svgPolygon(pts, { fill: '#eff6ff', stroke: '#2563eb', strokeWidth: 2 }));
      } else if (nd.shape === 'circle') {
        svg.appendChild(svgCircle(cx, cy, nodeH/2 + 2, { fill: '#f0fdf4', stroke: '#16a34a', strokeWidth: 2 }));
      } else {
        svg.appendChild(svgRect(cx - nodeW/2, cy - nodeH/2, nodeW, nodeH, { fill: '#eff6ff', stroke: '#2563eb', strokeWidth: 2, rx: 6 }));
      }
      svg.appendChild(setTextContent(svgText(cx, cy, '', { fontSize: 12, fill: '#1e293b', bold: true }), nd.text || nd.id));
    });

    edges.forEach(e => {
      const from = nodeMap[e.from], to = nodeMap[e.to];
      if (!from || !to) return;
      const x1 = from.cx + nodeW/2 + 2, x2 = to.cx - nodeW/2 - 2;
      svg.appendChild(svgLine(x1, from.cy, x2, to.cy, { stroke: '#475569', strokeWidth: 2, arrow: true }));
      if (e.label) {
        const mx = (x1 + x2) / 2;
        svg.appendChild(setTextContent(svgText(mx, from.cy - 14, '', { fontSize: 10, fill: '#64748b' }), e.label));
      }
    });

    if (spec.title) svg.appendChild(setTextContent(svgText(W/2, H-8, '', { fontSize: 11, fill: '#94a3b8' }), spec.title));
    this.container.appendChild(svg);
  }


  /* ----------------------------------------------------------
     地理 - 气候图等 (geographic) - 使用 Chart.js
     ---------------------------------------------------------- */
  renderGeographic(spec) {
    const d = safeObj(spec.data);
    const subtype = d.subtype || 'climate_chart';

    if (subtype === 'climate_chart') {
      return this._renderClimateChart(d, spec);
    }
    // 其他地理图形用通用 SVG
    return this.renderGenericSVG({ type: 'generic_svg', data: { description: d.description || '地理图形', elements: safeArr(d.elements) } });
  }

  _renderClimateChart(d, spec) {
    const chart = safeObj(d.climate_chart);
    const city = chart.city || '';
    const months = safeArr(chart.months).length ? chart.months : [1,2,3,4,5,6,7,8,9,10,11,12];
    const temp = safeArr(chart.temperature);
    const precip = safeArr(chart.precipitation);

    if (typeof Chart === 'undefined') {
      // Chart.js 未加载，用 SVG 简易绘制
      return this._renderClimateChartSVG(city, months, temp, precip, spec);
    }

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'padding:12px;background:#fafbfc;border-radius:8px;border:1px solid #e2e8f0;max-width:420px;';
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 260;
    wrapper.appendChild(canvas);
    this.container.appendChild(wrapper);

    const labels = months.map(m => m + '\u6708');

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'line',
            label: '\u6C14\u6E29 (\u2103)',
            data: temp,
            borderColor: '#dc2626',
            backgroundColor: 'rgba(220,38,38,0.1)',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.3,
            yAxisID: 'y1',
            order: 1
          },
          {
            type: 'bar',
            label: '\u964D\u6C34\u91CF (mm)',
            data: precip,
            backgroundColor: 'rgba(37,99,235,0.6)',
            borderColor: '#2563eb',
            borderWidth: 1,
            yAxisID: 'y2',
            order: 2
          }
        ]
      },
      options: {
        responsive: false,
        plugins: {
          title: { display: !!city, text: city + ' \u6C14\u5019\u56FE', font: { size: 14 } },
          legend: { position: 'bottom', labels: { font: { size: 11 } } }
        },
        scales: {
          y1: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: '\u6C14\u6E29 (\u2103)', font: { size: 11 } },
            grid: { drawOnChartArea: false }
          },
          y2: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: '\u964D\u6C34\u91CF (mm)', font: { size: 11 } },
            beginAtZero: true
          }
        }
      }
    });
  }

  _renderClimateChartSVG(city, months, temp, precip, spec) {
    const W = 400, H = 280, pad = 50;
    const plotW = W - 2 * pad, plotH = H - 2 * pad - 20;
    const svg = createSvgRoot(W, H);
    svg.appendChild(svgRect(0, 0, W, H, { fill: '#fafbfc', stroke: 'none', rx: 8 }));

    if (city) svg.appendChild(setTextContent(svgText(W/2, 18, '', { fontSize: 13, bold: true, fill: '#1e293b' }), city + ' \u6C14\u5019\u56FE'));

    const n = months.length;
    const barW = plotW / n * 0.6;
    const maxP = Math.max(...precip, 1);
    const minT = Math.min(...temp, 0) - 5;
    const maxT = Math.max(...temp, 0) + 5;

    // 降水柱状图
    precip.forEach((p, i) => {
      const x = pad + (i + 0.5) * plotW / n - barW / 2;
      const h = (p / maxP) * plotH;
      svg.appendChild(svgRect(x, pad + 20 + plotH - h, barW, h, { fill: 'rgba(37,99,235,0.5)', stroke: '#2563eb', strokeWidth: 1 }));
    });

    // 气温折线
    let pathD = '';
    temp.forEach((t, i) => {
      const x = pad + (i + 0.5) * plotW / n;
      const y = pad + 20 + plotH - ((t - minT) / (maxT - minT)) * plotH;
      pathD += (i === 0 ? 'M' : 'L') + x + ',' + y + ' ';
      svg.appendChild(svgCircle(x, y, 3, { fill: '#dc2626', stroke: '#fff', strokeWidth: 1 }));
    });
    svg.appendChild(svgPath(pathD, { stroke: '#dc2626', strokeWidth: 2 }));

    // X 轴标签
    months.forEach((m, i) => {
      const x = pad + (i + 0.5) * plotW / n;
      svg.appendChild(setTextContent(svgText(x, H - 12, '', { fontSize: 9, fill: '#64748b' }), m + ''));
    });

    if (spec.title) svg.appendChild(setTextContent(svgText(W/2, H-2, '', { fontSize: 10, fill: '#94a3b8' }), spec.title));
    this.container.appendChild(svg);
  }

  /* ----------------------------------------------------------
     通用 SVG 兜底 (generic_svg)
     ---------------------------------------------------------- */
  renderGenericSVG(spec) {
    const d = safeObj(spec.data);
    const elements = safeArr(d.elements);
    const description = d.description || '';

    if (elements.length === 0 && description) {
      const div = document.createElement('div');
      div.style.cssText = 'padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#475569;font-size:13px;text-align:center;';
      div.textContent = '\u56FE\u793A: ' + description;
      this.container.appendChild(div);
      return;
    }

    const W = 400, H = 240;
    const svg = createSvgRoot(W, H);
    svg.appendChild(svgRect(0, 0, W, H, { fill: '#fafbfc', stroke: 'none', rx: 8 }));
    addArrowDef(svg);

    elements.forEach(el => {
      const shape = el.shape || 'rect';
      switch (shape) {
        case 'rect':
          svg.appendChild(svgRect(el.x || 0, el.y || 0, el.width || 80, el.height || 40, { fill: el.fill || '#eff6ff', stroke: el.stroke || '#2563eb', strokeWidth: 2, rx: el.rx || 4 }));
          if (el.label) svg.appendChild(setTextContent(svgText((el.x||0) + (el.width||80)/2, (el.y||0) + (el.height||40)/2, '', { fontSize: 12, fill: '#1e293b' }), el.label));
          break;
        case 'circle':
          svg.appendChild(svgCircle(el.cx || 0, el.cy || 0, el.r || 20, { fill: el.fill || '#f0fdf4', stroke: el.stroke || '#16a34a', strokeWidth: 2 }));
          if (el.label) svg.appendChild(setTextContent(svgText(el.cx || 0, el.cy || 0, '', { fontSize: 12, fill: '#1e293b' }), el.label));
          break;
        case 'ellipse':
          svg.appendChild(createSvgElement('ellipse', { cx: el.cx||0, cy: el.cy||0, rx: el.rx||30, ry: el.ry||20, fill: el.fill||'#eff6ff', stroke: el.stroke||'#2563eb', 'stroke-width': 2 }));
          if (el.label) svg.appendChild(setTextContent(svgText(el.cx||0, el.cy||0, '', { fontSize: 12, fill: '#1e293b' }), el.label));
          break;
        case 'line':
          svg.appendChild(svgLine(el.x1||0, el.y1||0, el.x2||100, el.y2||0, { stroke: el.stroke||'#475569', strokeWidth: 2 }));
          break;
        case 'arrow': {
          const from = safeArr(el.from), to = safeArr(el.to);
          if (from.length >= 2 && to.length >= 2) {
            svg.appendChild(svgLine(from[0], from[1], to[0], to[1], { stroke: el.stroke||'#475569', strokeWidth: 2, arrow: true }));
            if (el.label) {
              const [mx, my] = midpoint(from[0], from[1], to[0], to[1]);
              svg.appendChild(setTextContent(svgText(mx, my - 10, '', { fontSize: 10, fill: '#64748b' }), el.label));
            }
          }
          break;
        }
        case 'text':
          svg.appendChild(setTextContent(svgText(el.x||0, el.y||0, '', { fontSize: el.fontSize||13, fill: el.fill||'#1e293b', bold: el.bold, anchor: el.anchor||'start' }), el.text||''));
          break;
      }
    });

    if (description) svg.appendChild(setTextContent(svgText(W/2, H-10, '', { fontSize: 10, fill: '#94a3b8' }), description.slice(0, 50)));
    if (spec.title) svg.appendChild(setTextContent(svgText(W/2, 16, '', { fontSize: 11, fill: '#94a3b8' }), spec.title));
    this.container.appendChild(svg);
  }

} // end class DiagramRenderer

/* ============================================================
   全局渲染入口函数
   ============================================================ */
async function renderAllDiagrams() {
  const containers = document.querySelectorAll('.diagram-container[data-diagram]');
  for (const el of containers) {
    if (el.dataset.rendered === 'true') continue;
    try {
      const spec = JSON.parse(el.dataset.diagram);
      const renderer = new DiagramRenderer(el);
      await renderer.render(spec);
      el.dataset.rendered = 'true';
    } catch (e) {
      console.error('Diagram render failed:', e);
      el.innerHTML = '<div style="padding:12px;color:#991b1b;font-size:12px;text-align:center;">\u56FE\u5F62\u6E32\u67D3\u5931\u8D25</div>';
    }
  }
}

/* Mermaid 初始化 */
if (typeof mermaid !== 'undefined') {
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
}
