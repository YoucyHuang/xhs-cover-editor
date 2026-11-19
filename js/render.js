/* 画面绘制：编辑预览和导出用的是同一套绘制代码，所以“看到的 = 导出的” */
const W = 1242, H = 1656;
const INK = '#22221F';

// 模板 = 栏目：决定色块 / 标签的颜色和左上角标签文字
const TEMPLATES = {
  vlog:      { name: 'VLOG',     tag: 'VLOG · 01',     color: '#B8C7D6', colorName: '雾霾蓝' },
  knowledge: { name: '知识口播', tag: '搞钱笔记 · 01', color: '#E8D7A8', colorName: '奶油黄' },
  collab:    { name: '合作',     tag: '合作 · 品牌名', color: '#D3C3CF', colorName: '藕荷紫' },
  life:      { name: '生活',     tag: '生活 · 01',     color: '#C4CFB7', colorName: '鼠尾草绿' },
};

// 版式：决定各元素的位置和样式（文字、照片在版式之间共用）
const LAYOUTS = {
  classic: { name: '经典', desc: '照片铺满 + 半透明标题色块' },
  index:   { name: '色场编号', desc: '照片在上 + 纯色块在下 + 大编号' },
};
// 跟着版式走的元素（位置、字体、颜色等；不含文字内容和图片）
const LAYOUT_KEYS = ['block', 'tag', 'title', 'subtitle', 'num', 'chips', 'rule', 'place', 'sign'];

const BOX_TEXT = ['title', 'subtitle', 'num', 'place'];   // 有固定宽度、会自动换行、可对齐
const AUTO_TEXT = ['tag', 'chips'];                       // 宽度跟着文字走
const TEXT_IDS = BOX_TEXT.concat(AUTO_TEXT);

// ---------------------------------------------------------------- 色块形状
// 上边、下边各 5 个控制点（横向等分），值 = 相对色块上边 / 下边的上下偏移（px，正数往下）
const SHAPE_N = 5;
function flatShape() { return { top: [0, 0, 0, 0, 0], bot: [0, 0, 0, 0, 0] }; }
const SHAPE_PRESETS = [
  { id: 'flat',  name: '平直',   top: [0, 0, 0, 0, 0] },
  { id: 'arch',  name: '拱形',   top: [110, 30, 0, 30, 110] },
  { id: 'bowl',  name: '下凹',   top: [0, 60, 85, 60, 0] },
  { id: 'wave',  name: '波浪',   top: [40, -20, 40, 100, 40] },
  { id: 'wave2', name: '大波浪', top: [90, -40, 60, -20, 110] },
  { id: 'slant', name: '斜切',   top: [0, 35, 70, 105, 140] },
  { id: 'hill',  name: '山丘',   top: [80, 0, 60, -30, 70] },
];
function blockShape(b) { return b.shape || flatShape(); }
function isFlat(b) { const s = blockShape(b); return s.top.every(v => !v) && s.bot.every(v => !v); }

/** Catmull-Rom 曲线：第 k 段用到的 4 个值（两端补外延点） */
function crSeg(arr, k) {
  const n = arr.length;
  const g = i => (i < 0 ? 2 * arr[0] - arr[1] : i >= n ? 2 * arr[n - 1] - arr[n - 2] : arr[i]);
  return [g(k - 1), g(k), g(k + 1), g(k + 2)];
}
/** u ∈ [0,1]：边上某个横向位置的偏移量 */
function edgeOffset(arr, u) {
  const n = arr.length - 1;
  const k = Math.max(0, Math.min(n - 1, Math.floor(u * n)));
  const t = u * n - k;
  const [p0, p1, p2, p3] = crSeg(arr, k);
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
function blockTopY(b, u) { return b.y + edgeOffset(blockShape(b).top, u); }
function blockBotY(b, u) { return b.y + b.h + edgeOffset(blockShape(b).bot, u); }

/** 色块路径：平直时用圆角矩形，有形状时用平滑曲线 */
function blockPath(ctx, b) {
  if (isFlat(b)) { roundRectPath(ctx, b.x, b.y, b.w, b.h, b.radius); return; }
  const s = blockShape(b), n = SHAPE_N - 1, dx = b.w / n, yb = b.y + b.h;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + s.top[0]);
  for (let k = 0; k < n; k++) {
    const [p0, p1, p2, p3] = crSeg(s.top, k);
    const x1 = b.x + dx * k;
    ctx.bezierCurveTo(x1 + dx / 3, b.y + p1 + (p2 - p0) / 6, x1 + dx * 2 / 3, b.y + p2 - (p3 - p1) / 6, x1 + dx, b.y + p2);
  }
  ctx.lineTo(b.x + b.w, yb + s.bot[n]);
  for (let k = n - 1; k >= 0; k--) {   // 下边从右往左走
    const [p0, p1, p2, p3] = crSeg(s.bot, k);
    const x1 = b.x + dx * k;
    ctx.bezierCurveTo(x1 + dx * 2 / 3, yb + p2 - (p3 - p1) / 6, x1 + dx / 3, yb + p1 + (p2 - p0) / 6, x1, yb + p1);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------- 金闪 / 泡泡 / 碎光点
function defaultDeco() {
  return {
    visible: true, locked: false, area: 'edge', front: false, seed: 7,
    sparkle: { count: 0, size: 56, color: '#E6C36A' },
    bubble: { count: 0, size: 64, opacity: 75 },
    glitter: { count: 0, size: 6, color: '#FFF1C2' },
  };
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 每颗装饰的位置：同一个种子 → 位置永远一样（预览 = 导出）；加数量只会在后面加新的，前面的不动 */
function decoPoint(st, rnd, spread) {
  const b = st.block, area = st.deco.area;
  const u = rnd(), v = rnd(), w = rnd();
  if (!b.visible || area === 'all') return { x: u * W, y: v * H };
  const x = b.x + u * b.w;
  if (area === 'inside') {
    const t = blockTopY(b, u), bt = blockBotY(b, u);
    return { x, y: t + v * Math.max(0, bt - t) };
  }
  // edge：沿着色块上边撒，大多落在边线上方一点
  return { x, y: blockTopY(b, u) + (v + w - 1) * spread - spread * 0.35 };
}

function drawSparkle(ctx, x, y, r, color, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const v = r, hz = r * 0.72, k = r * 0.1;
  ctx.beginPath();
  ctx.moveTo(0, -v);
  ctx.quadraticCurveTo(k, -k, hz, 0);
  ctx.quadraticCurveTo(k, k, 0, v);
  ctx.quadraticCurveTo(-k, k, -hz, 0);
  ctx.quadraticCurveTo(-k, -k, 0, -v);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, v);
  g.addColorStop(0, '#FFFDF4');
  g.addColorStop(0.3, '#FFF4D2');
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 0.7;
  ctx.fill();
  ctx.restore();
}
function drawBubble(ctx, x, y, r, alpha) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,0.04)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.93, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0.75)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  const lg = ctx.createLinearGradient(x - r, y - r, x + r, y + r);   // 彩虹边
  lg.addColorStop(0, 'rgba(255,190,220,0.55)');
  lg.addColorStop(0.5, 'rgba(255,245,200,0.35)');
  lg.addColorStop(1, 'rgba(170,215,255,0.6)');
  ctx.strokeStyle = lg;
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';                          // 高光
  ctx.beginPath(); ctx.ellipse(x - r * 0.42, y - r * 0.42, r * 0.2, r * 0.11, -Math.PI / 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y, r * 0.78, Math.PI * 0.15, Math.PI * 0.38); ctx.stroke();
  ctx.restore();
}
function drawDeco(ctx, st) {
  const d = st.deco;
  if (!d || !d.visible) return;
  // 三种装饰各用自己的随机序列，互不影响
  const rb = mulberry32(d.seed * 7919 + 2);
  for (let i = 0; i < d.bubble.count; i++) {
    const r = d.bubble.size * (0.3 + 0.7 * Math.pow(rb(), 1.4));
    const p = decoPoint(st, rb, d.bubble.size * 2.2);
    drawBubble(ctx, p.x, p.y, r, d.bubble.opacity / 100);
  }
  const rg = mulberry32(d.seed * 7919 + 3);
  for (let i = 0; i < d.glitter.count; i++) {
    const r = d.glitter.size * (0.35 + 0.65 * rg());
    const white = rg() < 0.35, a = 0.55 + 0.45 * rg();
    const p = decoPoint(st, rg, 160);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = white ? '#FFFFFF' : d.glitter.color;
    ctx.shadowColor = d.glitter.color;
    ctx.shadowBlur = r * 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  const rs = mulberry32(d.seed * 7919 + 1);
  for (let i = 0; i < d.sparkle.count; i++) {
    const r = d.sparkle.size * (0.3 + 0.7 * Math.pow(rs(), 1.6));
    const rot = (rs() - 0.5) * 0.35;
    const p = decoPoint(st, rs, d.sparkle.size * 2.4);
    drawSparkle(ctx, p.x, p.y, r, d.sparkle.color, rot);
  }
}

// ---------------------------------------------------------------- 色系（单色系：莫兰蒂 / 多巴胺）
// 颜色可以写成 '@light' '@deep' '@accent' '@mid'，表示“跟随色系”，换色系时一起变
const PALETTES = {
  rose:   { name: '灰粉', fam: '莫兰蒂', bg: ['#E9DAD7', '#CBAEAA', '#957572'], deep: '#4F3A38', light: '#F7EFED', accent: '#B48580' },
  mist:   { name: '雾蓝', fam: '莫兰蒂', bg: ['#DCE2E6', '#AAB8C2', '#73858F'], deep: '#34424C', light: '#F2F5F7', accent: '#8CA1B0' },
  sage:   { name: '灰绿', fam: '莫兰蒂', bg: ['#DFE3D8', '#B1BAA2', '#7A866B'], deep: '#3C4433', light: '#F3F5EF', accent: '#94A182' },
  oat:    { name: '燕麦', fam: '莫兰蒂', bg: ['#F0E8DA', '#D6C5AA', '#A48E74'], deep: '#4F3F30', light: '#FBF7F0', accent: '#BFA482' },
  mauve:  { name: '灰紫', fam: '莫兰蒂', bg: ['#E4DDE5', '#BEB0C2', '#88778D'], deep: '#43384A', light: '#F6F2F7', accent: '#A595AB' },
  clay:   { name: '陶土', fam: '莫兰蒂', bg: ['#EEDCCF', '#CFA68C', '#996B53'], deep: '#523424', light: '#FAF0E9', accent: '#BE8666' },
  lemon:  { name: '柠檬黄', fam: '多巴胺', bg: ['#FFF8C4', '#FFE55E', '#FFC800'], deep: '#4D3A00', light: '#FFFDEB', accent: '#FFB000' },
  orange: { name: '橘子橙', fam: '多巴胺', bg: ['#FFE3C7', '#FFAE5F', '#FF7514'], deep: '#4F2200', light: '#FFF5EB', accent: '#FF6A00' },
  berry:  { name: '草莓粉', fam: '多巴胺', bg: ['#FFDCEA', '#FF8CB7', '#FF4888'], deep: '#5E0B30', light: '#FFF1F6', accent: '#FF2E77' },
  mint:   { name: '薄荷绿', fam: '多巴胺', bg: ['#D6FCEC', '#78ECC2', '#18C994'], deep: '#034A38', light: '#EFFFF8', accent: '#00B184' },
  volt:   { name: '电光蓝', fam: '多巴胺', bg: ['#D8E8FF', '#7AAEFF', '#2C66FF'], deep: '#08256B', light: '#EFF5FF', accent: '#1E57FF' },
  grape:  { name: '葡萄紫', fam: '多巴胺', bg: ['#ECDFFF', '#B78AFF', '#7638FF'], deep: '#290C63', light: '#F7F1FF', accent: '#6A28FF' },
};
for (const p of Object.values(PALETTES)) p.mid = p.bg[1];
const COLOR_ROLES = { light: '浅色', mid: '中间色', accent: '强调色', deep: '深色' };
let CUR_ST = null;   // drawScene 正在画的那份 state（解析 @颜色 用）
/** 当前生效的色系：自己选的 > 版式自带的 > 跟随模板颜色 */
function palOf(st) {
  st = st || CUR_ST;
  const L = st && LAYOUTS[st.layout];
  const k = (st && st.palette) || (L && L.pal);
  if (k && PALETTES[k]) return PALETTES[k];
  const t = st ? tplColor(st) : '#B8C7D6';
  return { light: '#FFFFFF', deep: INK, accent: t, mid: t, bg: [(st && st.bg) || '#E9E6E0', t, t] };
}
function col(c, st) {
  if (typeof c === 'string' && c[0] === '@') return palOf(st)[c.slice(1)] || INK;
  return c || INK;
}
function blockColor(st) {
  const b = st.block;
  if (b.color) return col(b.color, st);
  return st.palette ? palOf(st).mid : tplColor(st);
}

// 描边 / 投影的默认值（strokeW = 0 表示不描边）
const TEXT_FX = { strokeW: 0, strokeColor: '#FFFFFF', shadow: false, shadowColor: '#000000', shadowOpacity: 35, shadowBlur: 14, shadowX: 0, shadowY: 6 };
function txt(o) { return Object.assign({ italic: false, color: '@deep', align: 'left', vertical: false, visible: true, locked: false }, TEXT_FX, o); }

function layoutDefaults(id) {
  if (LAYOUTS[id] && LAYOUTS[id].defaults) return LAYOUTS[id].defaults();
  const tag = txt({ x: 72, y: 72, font: 'Noto Sans SC', size: 34, weight: 700, lineHeight: 1.25, letterSpacing: 4, radius: 0, bgOpacity: 100 });
  if (id === 'index') {
    return {
      block: { x: 0, y: 1040, w: W, h: H - 1040, opacity: 100, radius: 0, shape: flatShape(), color: null, glass: false, blur: 30, edge: true, visible: true, locked: false },
      tag: { ...tag, visible: false },
      chips: txt({ x: 80, y: 1092, font: 'Inter', size: 22, weight: 600, lineHeight: 1.2, letterSpacing: 6 }),
      num: txt({ x: 640, y: 870, w: 532, font: 'Bodoni Moda', size: 330, weight: 400, italic: true, lineHeight: 1, letterSpacing: -6, align: 'right' }),
      title: txt({ x: 80, y: 1188, w: 1082, font: 'Noto Serif SC', size: 116, weight: 900, lineHeight: 1.2, letterSpacing: 4 }),
      rule: { x: 80, y: 1494, w: 1082, thick: 1.5, color: INK, visible: true, locked: false },
      subtitle: txt({ x: 80, y: 1514, w: 760, font: 'Noto Sans SC', size: 32, weight: 400, lineHeight: 1.5, letterSpacing: 3 }),
      place: txt({ x: 862, y: 1512, w: 300, font: 'Cormorant Garamond', size: 34, weight: 500, italic: true, lineHeight: 1.5, letterSpacing: 1, align: 'right' }),
      sign: { x: 900, y: 1300, w: 240, opacity: 100, visible: true, locked: false },
      photoView: { scale: 1, ox: 0, oy: 0 }, grain: 20, photoSoft: true, texture: noTexture(),
    };
  }
  const idx = layoutDefaults('index');
  return {
    block: { x: 0, y: 1104, w: W, h: 552, opacity: 82, radius: 0, shape: flatShape(), color: null, glass: false, blur: 30, edge: true, visible: true, locked: false },
    tag,
    title: txt({ x: 90, y: 1188, w: 1062, font: 'Noto Serif SC', size: 108, weight: 900, lineHeight: 1.28, letterSpacing: 2 }),
    subtitle: txt({ x: 90, y: 1500, w: 1062, font: 'Noto Sans SC', size: 44, weight: 400, lineHeight: 1.4, letterSpacing: 6 }),
    num: { ...idx.num, visible: false }, chips: { ...idx.chips, visible: false },
    rule: { ...idx.rule, visible: false }, place: { ...idx.place, visible: false },
    sign: { x: 942, y: 1430, w: 240, opacity: 100, visible: true, locked: false },
    photoView: { scale: 1, ox: 0, oy: 0 }, grain: 0, photoSoft: false, texture: noTexture(),
  };
}
function noTexture() { return { type: 'none', strength: 60, seed: 7 }; }

/** 把一套版式设置套到 state 上（保留文字内容和图片） */
function applyLayout(st, L) {
  for (const k of LAYOUT_KEYS) if (L[k]) st[k] = Object.assign({}, st[k], L[k]);
  if (L.photoView) Object.assign(st.photo, L.photoView);
  st.grain = L.grain; st.photoSoft = L.photoSoft;
  st.texture = Object.assign(noTexture(), L.texture || {});
}
/** 从 state 里取出当前版式的设置 */
function pickLayout(st) {
  const out = {};
  for (const k of LAYOUT_KEYS) {
    const { text, assetId, ...rest } = st[k];
    out[k] = JSON.parse(JSON.stringify(rest));
  }
  out.photoView = { scale: st.photo.scale, ox: st.photo.ox, oy: st.photo.oy };
  out.grain = st.grain; out.photoSoft = st.photoSoft;
  out.texture = Object.assign({}, st.texture || noTexture());
  return out;
}

// 中文排版：这些标点不放在行首
const NO_LINE_START = '，。！？、；：）》」』】”’…—～,.!?;:)]}%';

function tplColor(st) { return st.templateColors[st.template]; }
function textOf(st, id) { return id === 'tag' ? st.tagTexts[st.template] : st[id].text; }
function fontString(el) { return `${el.italic ? 'italic ' : ''}${el.weight} ${el.size}px "${el.font}", "Noto Sans SC", sans-serif`; }

function applyFont(ctx, el) {
  ctx.font = fontString(el);
  ctx.letterSpacing = (el.letterSpacing || 0) + 'px';
  ctx.fontKerning = 'normal';
}

/** 排版：按 \n 分段，超过宽度自动换行（maxW 为 null 时不自动换行） */
function layoutText(ctx, el, text, maxW) {
  applyFont(ctx, el);
  const ls = el.letterSpacing || 0;
  const vis = s => (s.length ? ctx.measureText(s).width - ls : 0);
  const lines = [];
  for (const para of String(text).split('\n')) {
    if (maxW == null) { lines.push(para); continue; }
    const chars = [...para];
    let cur = '';
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (cur && vis(cur + ch) > maxW && !NO_LINE_START.includes(ch)) {
        // 英文单词尽量不拆开
        if (/[A-Za-z0-9]/.test(ch) && /[A-Za-z0-9]$/.test(cur)) {
          const sp = cur.lastIndexOf(' ');
          if (sp > 0) { lines.push(cur.slice(0, sp)); cur = cur.slice(sp + 1) + ch; continue; }
        }
        lines.push(cur);
        cur = ch === ' ' ? '' : ch;
      } else {
        cur += ch;
      }
    }
    lines.push(cur);
  }
  const lh = el.size * el.lineHeight;
  const widths = lines.map(vis);
  return { lines, widths, lh, h: lines.length * lh, maxLineW: Math.max(0, ...widths) };
}

// 竖排时要转 90° 的标点
const V_ROTATE = '「」『』（）()《》〈〉【】—…～-~';
/** 竖排：每一段（\n）是一列，从右往左排 */
function layoutV(ctx, el, text) {
  applyFont(ctx, el);
  const cols = String(text).split('\n').map(c => [...c]);
  const step = el.size + (el.letterSpacing || 0);
  const colW = el.size * el.lineHeight;
  const rows = Math.max(1, ...cols.map(c => c.length));
  return { cols, step, colW, w: Math.max(colW, cols.length * colW), h: rows * step };
}
function drawVText(ctx, el, text, x, y) {
  const L = layoutV(ctx, el, text);
  ctx.save();
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  L.cols.forEach((chars, i) => {
    const cx = x + L.w - L.colW * (i + 0.5);
    chars.forEach((ch, j) => {
      const cy = y + L.step * (j + 0.5);
      if (V_ROTATE.includes(ch)) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 2);
        paintText(ctx, el, [{ t: ch, x: 0, y: 0, fill: el.color }]);
        ctx.restore();
      } else if ('，。、．'.includes(ch)) {
        paintText(ctx, el, [{ t: ch, x: cx + el.size * 0.32, y: cy - el.size * 0.3, fill: el.color }]);
      } else {
        paintText(ctx, el, [{ t: ch, x: cx, y: cy, fill: el.color }]);
      }
    });
  });
  ctx.restore();
  return L;
}

function tagPadding(el) { return { x: el.size * 0.62, y: el.size * 0.36 }; }

/** 小标签组：用 / 分隔，每段一个小框，第一个是实心的 */
function chipsLayout(ctx, el, text) {
  applyFont(ctx, el);
  const parts = String(text).split(/\s*[\/／|｜\n]\s*/).map(s => s.trim()).filter(Boolean);
  const padX = el.size * 0.64, h = el.size * 1.75, gap = el.size * 0.72;
  let x = 0;
  const items = parts.map(t => {
    const w = ctx.measureText(t).width + padX * 2;
    const it = { t, x, w };
    x += w + gap;
    return it;
  });
  return { items, w: items.length ? x - gap : el.size * 3, h, padX };
}

/** 照片显示的区域：经典版式铺满整个画布；色场编号版式只占色块上方 */
function photoFrame(st) {
  if (st.layout === 'index') return { x: 0, y: 0, w: W, h: Math.max(200, Math.min(H, Math.round(st.block.y + Math.max(0, ...blockShape(st.block).top)))) };
  return { x: 0, y: 0, w: W, h: H };
}

/** 每个元素在画布上的范围（1242×1656 坐标） */
function elementBounds(ctx, st, assets, id) {
  const el = st[id];
  if (BOX_TEXT.includes(id)) {
    if (el.vertical) { const V = layoutV(ctx, el, textOf(st, id)); return { x: el.x, y: el.y, w: V.w, h: V.h }; }
    const L = layoutText(ctx, el, textOf(st, id), el.w);
    return { x: el.x, y: el.y, w: el.w, h: Math.max(L.h, el.size * el.lineHeight) };
  }
  switch (id) {
    case 'photo': return photoFrame(st);
    case 'block': {
      const s = blockShape(el);
      const y0 = el.y + Math.min(0, ...s.top), y1 = el.y + el.h + Math.max(0, ...s.bot);
      return { x: el.x, y: y0, w: el.w, h: y1 - y0 };
    }
    case 'rule': return { x: el.x, y: el.y, w: el.w, h: Math.max(el.thick, 2) };
    case 'tag': {
      const L = layoutText(ctx, el, textOf(st, id), null);
      const p = tagPadding(el);
      return { x: el.x, y: el.y, w: L.maxLineW + p.x * 2, h: L.h + p.y * 2 };
    }
    case 'chips': {
      const L = chipsLayout(ctx, el, textOf(st, id));
      return { x: el.x, y: el.y, w: L.w, h: L.h };
    }
    case 'sign': {
      const a = el.assetId && assets[el.assetId];
      const ratio = a && a.img ? a.img.naturalHeight / a.img.naturalWidth : 0.45;
      return { x: el.x, y: el.y, w: el.w, h: el.w * ratio };
    }
  }
  return null;
}

function photoRect(st, assets) {
  const p = st.photo;
  const a = p.assetId && assets[p.assetId];
  if (!a || !a.img) return null;
  const f = photoFrame(st);
  const iw = a.img.naturalWidth, ih = a.img.naturalHeight;
  const s = Math.max(f.w / iw, f.h / ih) * p.scale;
  const dw = iw * s, dh = ih * s;
  return { x: f.x + (f.w - dw) / 2 + p.ox, y: f.y + (f.h - dh) / 2 + p.oy, w: dw, h: dh, img: a.img, frame: f };
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0;
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
/**
 * 画一组文字，带描边和投影。
 * 先把所有行连同投影一起画一遍（有描边就画描边，没有就画填充），再把填充盖在最上面，
 * 这样投影不会压到下一行的字，描边也只往外长、不吃掉笔画。
 */
function paintText(ctx, el, items) {
  const sw = +el.strokeW || 0;
  const shadow = !!el.shadow;
  ctx.save();
  if (shadow) {
    ctx.shadowColor = hexA(col(el.shadowColor), (el.shadowOpacity ?? 35) / 100);
    ctx.shadowBlur = +el.shadowBlur || 0;
    ctx.shadowOffsetX = +el.shadowX || 0;
    ctx.shadowOffsetY = +el.shadowY || 0;
  }
  if (sw > 0) {
    ctx.lineWidth = sw * 2;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = col(el.strokeColor || '#FFFFFF');
    for (const it of items) ctx.strokeText(it.t, it.x, it.y);
    ctx.shadowColor = 'transparent';
  }
  for (const it of items) { ctx.fillStyle = col(it.fill); ctx.fillText(it.t, it.x, it.y); }
  ctx.restore();
}

function drawTextBlock(ctx, el, text, x, y, boxW, maxW) {
  if (el.vertical && maxW != null) return drawVText(ctx, el, text, x, y);
  const L = layoutText(ctx, el, text, maxW);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const items = L.lines.map((ln, i) => {
    let lx = x;
    if (el.align === 'center') lx = x + (boxW - L.widths[i]) / 2;
    else if (el.align === 'right') lx = x + boxW - L.widths[i];
    return { t: ln, x: lx, y: y + L.lh * (i + 0.5), fill: el.color };
  });
  paintText(ctx, el, items);
  return L;
}

function drawChips(ctx, el, text, fillTextColor) {
  const L = chipsLayout(ctx, el, text);
  const lw = Math.max(1.5, el.size * 0.07);
  ctx.save();
  ctx.lineWidth = lw;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  L.items.forEach((it, i) => {
    const bx = el.x + it.x;
    const c = col(el.color);
    if (i === 0) {
      ctx.fillStyle = c;
      ctx.fillRect(bx, el.y, it.w, L.h);
      ctx.fillStyle = fillTextColor;
    } else {
      ctx.strokeStyle = c;
      ctx.strokeRect(bx + lw / 2, el.y + lw / 2, it.w - lw, L.h - lw);
      ctx.fillStyle = c;
    }
    paintText(ctx, el, [{ t: it.t, x: bx + L.padX + (el.letterSpacing || 0) / 2, y: el.y + L.h / 2 + el.size * 0.04, fill: ctx.fillStyle }]);
  });
  ctx.restore();
}

// 颗粒质感：固定随机种子，保证预览和导出一模一样
let _grainTile = null;
function grainTile() {
  if (_grainTile) return _grainTile;
  const c = document.createElement('canvas');
  c.width = c.height = 320;
  const g = c.getContext('2d');
  const img = g.createImageData(320, 320);
  let seed = 20261016;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() + rnd() - 1) * 150;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (_grainTile = c);
}
const PHOTO_SOFT_FILTER = 'saturate(0.7) contrast(0.98) brightness(1.02) sepia(0.06)';

function newCanvas() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
/** 没有照片时的底：选了色系就用色系渐变 + 柔光斑，否则用纯底色 */
function drawEmptyBg(g, st) {
  const L = LAYOUTS[st.layout] || {};
  if (!st.palette && !L.pal) { g.fillStyle = st.bg || '#E9E6E0'; g.fillRect(0, 0, W, H); return; }
  const p = palOf(st);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, p.bg[0]); gr.addColorStop(0.55, p.bg[1]); gr.addColorStop(1, p.bg[2]);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const R = mulberry32(5);
  for (let i = 0; i < 26; i++) {
    const x = R() * W, y = R() * H, r = 20 + R() * 110;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, hexA(p.light, 0.45)); rg.addColorStop(1, hexA(p.light, 0));
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
}
/** 照片层：照片 + 背景质感（雨痕 / 磨砂 / 模糊）。质感很费时，所以结果缓存起来，照片和设置不变就直接用 */
const _photoCache = { key: null, c: null };
function photoLayer(st, assets, opts) {
  const L = LAYOUTS[st.layout] || {};
  const r = st.photo.visible ? photoRect(st, assets) : null;
  const tex = st.texture || noTexture();
  const fast = !!opts.fast;
  const key = JSON.stringify([st.photo.assetId, st.photo.visible, r && [r.x, r.y, r.w, r.h], photoFrame(st), st.photoSoft, tex,
    L.circle || 0, L.fog || 0, st.palette, st.layout, st.template, st.templateColors[st.template], st.bg, fast]);
  if (!opts.thumb && _photoCache.key === key) return _photoCache.c;
  const c = newCanvas(), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  drawEmptyBg(g, st);
  const f = photoFrame(st);
  if (r) {
    g.save(); g.beginPath(); g.rect(f.x, f.y, f.w, f.h); g.clip();
    if (st.photoSoft) g.filter = PHOTO_SOFT_FILTER;
    g.drawImage(r.img, r.x, r.y, r.w, r.h);
    g.restore();
  }
  if (!fast && typeof Texture !== 'undefined') {
    const k = (tex.strength ?? 60) / 100;
    g.save(); g.beginPath(); g.rect(f.x, f.y, f.w, f.h); g.clip();
    if (L.circle) {
      // 圆形取景：圈外磨砂，圈里清楚
      const sharp = Texture.copyOf(c);
      Texture.apply(g, tex.type === 'none' ? 'frost' : tex.type, Math.max(0.5, k), tex.seed);
      g.fillStyle = hexA(palOf(st).light, 0.42); g.fillRect(0, 0, W, H);   // 磨砂玻璃带一点色系的浅色，字才看得清
      const { cx, cy, r: rr } = L.circle;
      g.save(); g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.clip(); g.drawImage(sharp, 0, 0);
      Texture.apply(g, 'drops', 0.45, tex.seed + 1); g.restore();
    } else {
      Texture.apply(g, tex.type, k, tex.seed);
    }
    g.restore();
  }
  if (L.fog) { g.fillStyle = hexA(palOf(st).deep, 0.55); g.fillRect(0, 0, W, H); }
  if (!opts.thumb) { _photoCache.key = key; _photoCache.c = c; }
  return c;
}
/** 雾窗写字：整张玻璃起雾，主标题的笔画是“擦干净”的，露出后面的照片 */
const _fogCache = { key: null, c: null };
function drawFogTitle(ctx, st, base, opts) {
  const p = palOf(st);
  const key = _photoCache.key + '|' + p.light;
  let fog = _fogCache.key === key && !opts.thumb ? _fogCache.c : null;
  if (!fog) {
    fog = newCanvas();
    const f = fog.getContext('2d');
    f.drawImage(Texture.blurred(base, 26, 'brightness(1.6)'), 0, 0);
    f.fillStyle = hexA(p.light, 0.55); f.fillRect(0, 0, W, H);
    if (!opts.fast) Texture.apply(f, 'mist', 0.55, 51);
    if (!opts.thumb) { _fogCache.key = key; _fogCache.c = fog; }
  }
  const t = st.title;
  const cut = newCanvas(), g = cut.getContext('2d');
  g.drawImage(fog, 0, 0);
  if (t.visible && opts.skipText !== 'title') {
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.filter = 'blur(1.5px)';
    const el = Object.assign({}, t, { color: '#000', strokeW: t.size * 0.035, strokeColor: '#000', shadow: false });
    drawTextBlock(g, el, t.text, t.x, t.y, t.w, t.w);
    // 几道往下淌的水痕
    const bd = elementBounds(g, st, {}, 'title');
    const R = mulberry32(8);
    g.lineCap = 'round'; g.strokeStyle = '#000'; g.lineWidth = Math.max(5, t.size * 0.05);
    for (let i = 0; i < 6; i++) {
      const x = bd.x + R() * bd.w, y = bd.y + bd.h - t.size * 0.25 + R() * t.size * 0.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 8, y + t.size * (0.4 + R() * 1.3)); g.stroke();
    }
    g.restore();
  }
  ctx.drawImage(cut, 0, 0);
}
function drawSeal(ctx, x, y, s, chars, color) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(-0.03);
  ctx.fillStyle = color; ctx.globalAlpha = 0.92;
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(0, 0, s, s, s * 0.08); else ctx.rect(0, 0, s, s); ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  const R = mulberry32(4);
  for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(R() * s, R() * s, R() * s * 0.025, 0, 7); ctx.fill(); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#F6EDE4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${s * 0.4}px "Ma Shan Zheng", "Noto Serif SC", serif`;
  const cs = [...String(chars || '')];
  if (cs.length <= 1) { ctx.font = `${s * 0.62}px "Ma Shan Zheng", "Noto Serif SC", serif`; ctx.fillText(cs[0] || '', s / 2, s * 0.53); }
  else { ctx.fillText(cs[0], s * 0.5, s * 0.3); ctx.fillText(cs[1], s * 0.5, s * 0.72); }
  ctx.restore();
}
/** 版式自带的装饰：印章、署名、巨字、顶部压暗、细框、圆形取景的圈线 */
function drawLayoutDecor(ctx, st, L) {
  const p = palOf(st);
  for (const d of L.decor || []) {
    if (d.type === 'shadeTop') {
      const gr = ctx.createLinearGradient(0, 0, 0, d.h);
      gr.addColorStop(0, hexA(p.deep, d.a)); gr.addColorStop(1, hexA(p.deep, 0));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, d.h);
    } else if (d.type === 'giant') {
      ctx.save(); ctx.globalAlpha = d.alpha; ctx.fillStyle = col(d.color, st);
      ctx.font = `${d.size}px "${d.font}", "Noto Serif SC", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(st.giantChar || '静', d.x, d.y); ctx.restore();
    } else if (d.type === 'seal') {
      drawSeal(ctx, d.x, d.y, d.s, st.sealText, col(d.color || '@deep', st));
    } else if (d.type === 'byline') {
      ctx.save(); ctx.font = `${d.size}px "Ma Shan Zheng", "Noto Serif SC", serif`; ctx.fillStyle = col(d.color, st);
      ctx.textAlign = d.align || 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillText(st.byline || '', d.x, d.y); ctx.restore();
    } else if (d.type === 'rings' && L.circle) {
      const { cx, cy, r } = L.circle;
      ctx.save(); ctx.strokeStyle = hexA(col(d.color, st), 0.6); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r + 26, 0, 7); ctx.stroke();
      ctx.setLineDash([4, 10]); ctx.beginPath(); ctx.arc(cx, cy, r + 56, 0, 7); ctx.stroke(); ctx.restore();
    } else if (d.type === 'frame') {
      ctx.save(); ctx.strokeStyle = hexA(col(d.color, st), 0.7); ctx.lineWidth = 2; ctx.strokeRect(d.inset, d.inset, W - d.inset * 2, H - d.inset * 2);
      ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.strokeRect(d.inset + 16, d.inset + 16, W - d.inset * 2 - 32, H - d.inset * 2 - 32); ctx.restore();
    }
  }
}

/** 绘制整张封面。opts.skipText = 正在双击编辑的文字（编辑框盖在上面，画布上先不画） */
function drawScene(ctx, st, assets, opts = {}) {
  CUR_ST = st;
  const LD = LAYOUTS[st.layout] || {};
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = st.bg || '#E9E6E0';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';

  // 1. 照片 + 背景质感（雨痕 / 磨砂 / 模糊）
  const base = photoLayer(st, assets, opts);
  ctx.drawImage(base, 0, 0);
  if (LD.fog) drawFogTitle(ctx, st, base, opts);

  // 2. 标题色块（可以是半透明磨砂玻璃）
  const b = st.block;
  if (b.visible) {
    if (b.glass) {
      ctx.save();
      blockPath(ctx, b); ctx.clip();
      const snap = newCanvas(); snap.getContext('2d').drawImage(ctx.canvas, 0, 0);
      ctx.filter = `blur(${b.blur ?? 30}px)`;
      const pad = (b.blur ?? 30) * 2;
      ctx.drawImage(snap, -pad, -pad, W + pad * 2, H + pad * 2);
      ctx.filter = 'none';
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = b.opacity / 100;
    ctx.fillStyle = blockColor(st);
    blockPath(ctx, b);
    ctx.fill();
    ctx.restore();
    if (b.glass && b.edge !== false) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
      blockPath(ctx, b); ctx.stroke(); ctx.restore();
    }
  }
  drawLayoutDecor(ctx, st, LD);
  if (st.deco && !st.deco.front) drawDeco(ctx, st);   // 金闪泡泡：默认在文字下面

  // 3. 系列标签
  const t = st.tag;
  if (t.visible) {
    const bd = elementBounds(ctx, st, assets, 'tag');
    ctx.save();
    ctx.globalAlpha = t.bgOpacity / 100;
    ctx.fillStyle = blockColor(st);
    roundRectPath(ctx, bd.x, bd.y, bd.w, bd.h, t.radius);
    ctx.fill();
    ctx.restore();
    if (opts.skipText !== 'tag') {
      const p = tagPadding(t);
      drawTextBlock(ctx, t, textOf(st, 'tag'), bd.x + p.x, bd.y + p.y, bd.w - p.x * 2, null);
    }
  }

  // 4. 小标签组、细线
  if (st.chips.visible && opts.skipText !== 'chips') drawChips(ctx, st.chips, st.chips.text, blockColor(st));
  const rl = st.rule;
  if (rl.visible) { ctx.fillStyle = col(rl.color); ctx.fillRect(rl.x, rl.y, rl.w, rl.thick); }

  // 5. 主标题、副标题、大编号、地点
  for (const id of BOX_TEXT) {
    const el = st[id];
    if (!el.visible || opts.skipText === id) continue;
    if (id === 'title' && LD.fog) continue;   // 雾窗写字：标题已经“写”在雾上了
    drawTextBlock(ctx, el, el.text, el.x, el.y, el.w, el.w);
  }

  // 6. 签名 / 涂鸦
  const s = st.sign;
  const sa = s.assetId && assets[s.assetId];
  if (s.visible && sa && sa.img) {
    const bd = elementBounds(ctx, st, assets, 'sign');
    ctx.save();
    ctx.globalAlpha = s.opacity / 100;
    ctx.drawImage(sa.img, bd.x, bd.y, bd.w, bd.h);
    ctx.restore();
  }

  if (st.deco && st.deco.front) drawDeco(ctx, st);

  // 7. 颗粒质感（盖在最上面）
  if (st.grain > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(1, st.grain / 100 * 1.6);
    ctx.fillStyle = ctx.createPattern(grainTile(), 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  ctx.restore();
}
