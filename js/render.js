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

function txt(o) { return Object.assign({ italic: false, color: INK, align: 'left', visible: true, locked: false }, o); }

function layoutDefaults(id) {
  const tag = txt({ x: 72, y: 72, font: 'Noto Sans SC', size: 34, weight: 700, lineHeight: 1.25, letterSpacing: 4, radius: 0, bgOpacity: 100 });
  if (id === 'index') {
    return {
      block: { x: 0, y: 1040, w: W, h: H - 1040, opacity: 100, radius: 0, visible: true, locked: false },
      tag: { ...tag, visible: false },
      chips: txt({ x: 80, y: 1092, font: 'Inter', size: 22, weight: 600, lineHeight: 1.2, letterSpacing: 6 }),
      num: txt({ x: 640, y: 870, w: 532, font: 'Bodoni Moda', size: 330, weight: 400, italic: true, lineHeight: 1, letterSpacing: -6, align: 'right' }),
      title: txt({ x: 80, y: 1188, w: 1082, font: 'Noto Serif SC', size: 116, weight: 900, lineHeight: 1.2, letterSpacing: 4 }),
      rule: { x: 80, y: 1494, w: 1082, thick: 1.5, color: INK, visible: true, locked: false },
      subtitle: txt({ x: 80, y: 1514, w: 760, font: 'Noto Sans SC', size: 32, weight: 400, lineHeight: 1.5, letterSpacing: 3 }),
      place: txt({ x: 862, y: 1512, w: 300, font: 'Cormorant Garamond', size: 34, weight: 500, italic: true, lineHeight: 1.5, letterSpacing: 1, align: 'right' }),
      sign: { x: 900, y: 1300, w: 240, opacity: 100, visible: true, locked: false },
      photoView: { scale: 1, ox: 0, oy: 0 }, grain: 20, photoSoft: true,
    };
  }
  const idx = layoutDefaults('index');
  return {
    block: { x: 0, y: 1104, w: W, h: 552, opacity: 82, radius: 0, visible: true, locked: false },
    tag,
    title: txt({ x: 90, y: 1188, w: 1062, font: 'Noto Serif SC', size: 108, weight: 900, lineHeight: 1.28, letterSpacing: 2 }),
    subtitle: txt({ x: 90, y: 1500, w: 1062, font: 'Noto Sans SC', size: 44, weight: 400, lineHeight: 1.4, letterSpacing: 6 }),
    num: { ...idx.num, visible: false }, chips: { ...idx.chips, visible: false },
    rule: { ...idx.rule, visible: false }, place: { ...idx.place, visible: false },
    sign: { x: 942, y: 1430, w: 240, opacity: 100, visible: true, locked: false },
    photoView: { scale: 1, ox: 0, oy: 0 }, grain: 0, photoSoft: false,
  };
}

/** 把一套版式设置套到 state 上（保留文字内容和图片） */
function applyLayout(st, L) {
  for (const k of LAYOUT_KEYS) if (L[k]) st[k] = Object.assign({}, st[k], L[k]);
  if (L.photoView) Object.assign(st.photo, L.photoView);
  st.grain = L.grain; st.photoSoft = L.photoSoft;
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
  if (st.layout === 'index') return { x: 0, y: 0, w: W, h: Math.max(200, Math.min(H, Math.round(st.block.y))) };
  return { x: 0, y: 0, w: W, h: H };
}

/** 每个元素在画布上的范围（1242×1656 坐标） */
function elementBounds(ctx, st, assets, id) {
  const el = st[id];
  if (BOX_TEXT.includes(id)) {
    const L = layoutText(ctx, el, textOf(st, id), el.w);
    return { x: el.x, y: el.y, w: el.w, h: Math.max(L.h, el.size * el.lineHeight) };
  }
  switch (id) {
    case 'photo': return photoFrame(st);
    case 'block': return { x: el.x, y: el.y, w: el.w, h: el.h };
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

function drawTextBlock(ctx, el, text, x, y, boxW, maxW) {
  const L = layoutText(ctx, el, text, maxW);
  ctx.fillStyle = el.color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  L.lines.forEach((ln, i) => {
    let lx = x;
    if (el.align === 'center') lx = x + (boxW - L.widths[i]) / 2;
    else if (el.align === 'right') lx = x + boxW - L.widths[i];
    ctx.fillText(ln, lx, y + L.lh * (i + 0.5));
  });
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
    if (i === 0) {
      ctx.fillStyle = el.color;
      ctx.fillRect(bx, el.y, it.w, L.h);
      ctx.fillStyle = fillTextColor;
    } else {
      ctx.strokeStyle = el.color;
      ctx.strokeRect(bx + lw / 2, el.y + lw / 2, it.w - lw, L.h - lw);
      ctx.fillStyle = el.color;
    }
    ctx.fillText(it.t, bx + L.padX + (el.letterSpacing || 0) / 2, el.y + L.h / 2 + el.size * 0.04);
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

/** 绘制整张封面。opts.skipText = 正在双击编辑的文字（编辑框盖在上面，画布上先不画） */
function drawScene(ctx, st, assets, opts = {}) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = st.bg || '#E9E6E0';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';

  // 1. 照片（只画在照片区域里）
  if (st.photo.visible) {
    const r = photoRect(st, assets);
    if (r) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.frame.x, r.frame.y, r.frame.w, r.frame.h);
      ctx.clip();
      if (st.photoSoft) ctx.filter = PHOTO_SOFT_FILTER;
      ctx.drawImage(r.img, r.x, r.y, r.w, r.h);
      ctx.restore();
    }
  }

  // 2. 标题色块
  const b = st.block;
  if (b.visible) {
    ctx.save();
    ctx.globalAlpha = b.opacity / 100;
    ctx.fillStyle = tplColor(st);
    roundRectPath(ctx, b.x, b.y, b.w, b.h, b.radius);
    ctx.fill();
    ctx.restore();
  }

  // 3. 系列标签
  const t = st.tag;
  if (t.visible) {
    const bd = elementBounds(ctx, st, assets, 'tag');
    ctx.save();
    ctx.globalAlpha = t.bgOpacity / 100;
    ctx.fillStyle = tplColor(st);
    roundRectPath(ctx, bd.x, bd.y, bd.w, bd.h, t.radius);
    ctx.fill();
    ctx.restore();
    if (opts.skipText !== 'tag') {
      const p = tagPadding(t);
      drawTextBlock(ctx, t, textOf(st, 'tag'), bd.x + p.x, bd.y + p.y, bd.w - p.x * 2, null);
    }
  }

  // 4. 小标签组、细线
  if (st.chips.visible && opts.skipText !== 'chips') drawChips(ctx, st.chips, st.chips.text, tplColor(st));
  const rl = st.rule;
  if (rl.visible) { ctx.fillStyle = rl.color; ctx.fillRect(rl.x, rl.y, rl.w, rl.thick); }

  // 5. 主标题、副标题、大编号、地点
  for (const id of BOX_TEXT) {
    const el = st[id];
    if (!el.visible || opts.skipText === id) continue;
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
