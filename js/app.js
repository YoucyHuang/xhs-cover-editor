/* 小红书封面生成器 —— 主程序 */
(function () {
  'use strict';

  const LS_STATE = 'xhs-cover.state.v1';
  const LS_COLORS = 'xhs-cover.templateColors';
  const LS_UI = 'xhs-cover.ui';

  const LAYERS = [ // 列表从上到下 = 画面从上到下
    { id: 'sign', name: '签名 / 涂鸦', icon: '✎' },
    { id: 'num', name: '大编号', icon: '#' },
    { id: 'place', name: '地点 / 英文', icon: 'i' },
    { id: 'subtitle', name: '副标题', icon: 'T' },
    { id: 'title', name: '主标题', icon: 'T' },
    { id: 'chips', name: '小标签组', icon: '▭' },
    { id: 'tag', name: '系列标签', icon: '◩' },
    { id: 'rule', name: '细线', icon: '—' },
    { id: 'block', name: '标题色块', icon: '▬' },
    { id: 'photo', name: '照片', icon: '▣' },
  ];
  const LAYER_NAME = Object.fromEntries(LAYERS.map(l => [l.id, l.name]));
  const svgIcon = d => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    eye: svgIcon('<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'),
    eyeOff: svgIcon('<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" opacity=".35"/><path d="M2.5 13.5l11-11"/>'),
    lock: svgIcon('<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>'),
    unlock: svgIcon('<rect x="3.5" y="7" width="9" height="6.5" rx="1.2" opacity=".55"/><path d="M5.5 7V5a2.5 2.5 0 014.8-1" opacity=".55"/>'),
  };
  // ---------------------------------------------------------------- 状态
  function rememberedColors() {
    const def = Object.fromEntries(Object.entries(TEMPLATES).map(([k, v]) => [k, v.color]));
    try {
      const saved = JSON.parse(localStorage.getItem(LS_COLORS) || '{}');
      // 第 2 版起「合作」默认改为藕荷紫；没改过颜色的老用户自动换成新默认色
      if (!localStorage.getItem('xhs-cover.colorsV2')) {
        if (saved.collab && saved.collab.toUpperCase() === '#C4CFB7') delete saved.collab;
        localStorage.setItem('xhs-cover.colorsV2', '1');
        localStorage.setItem(LS_COLORS, JSON.stringify(Object.assign({}, def, saved)));
      }
      return Object.assign(def, saved);
    } catch (e) { return def; }
  }
  function rememberColors(colors) {
    try { localStorage.setItem(LS_COLORS, JSON.stringify(colors)); } catch (e) {}
  }

  function defaultState() {
    const st = {
      version: 2,
      template: 'vlog',
      layout: 'classic',
      layoutStore: {},          // 切换版式时，记住另一个版式里调过的位置
      templateColors: rememberedColors(),
      tagTexts: Object.fromEntries(Object.entries(TEMPLATES).map(([k, v]) => [k, v.tag])),
      bg: '#E9E6E0',
      photo: { assetId: null, scale: 1, ox: 0, oy: 0, visible: true, locked: false },
      title: { text: '存多少钱\n能躺平一辈子？' },
      subtitle: { text: '算上通胀 & 风险' },
      num: { text: '01' },
      chips: { text: 'VLOG / 城市 / 3 DAYS' },
      place: { text: 'Somewhere, Oct.' },
      sign: { assetId: null },
    };
    applyLayout(st, layoutDefaults('classic'));
    return st;
  }

  /** 读旧数据时补齐缺失字段 */
  function normalize(st) {
    if (!st || typeof st !== 'object') return defaultState();
    const d = defaultState();
    if (st.layout === 'index') applyLayout(d, layoutDefaults('index'));
    const out = { ...d, ...st };
    for (const k of ['photo', 'templateColors', 'tagTexts'].concat(LAYOUT_KEYS)) {
      out[k] = { ...d[k], ...(st[k] || {}) };
    }
    if (!TEMPLATES[out.template]) out.template = 'vlog';
    if (!LAYOUTS[out.layout]) out.layout = 'classic';
    out.layoutStore = st.layoutStore || {};
    return out;
  }

  let state;
  const assets = {};          // id -> { dataURL, img }
  let selected = null;        // 当前选中的图层 id
  let editing = null;         // 正在画布上双击编辑的文字 id
  let ui = { showSafe: false };
  try { ui = Object.assign(ui, JSON.parse(localStorage.getItem(LS_UI) || '{}')); } catch (e) {}
  const saveUI = () => { try { localStorage.setItem(LS_UI, JSON.stringify(ui)); } catch (e) {} };

  // ---------------------------------------------------------------- DOM
  const $ = s => document.querySelector(s);
  const cv = $('#cv'), ctx = cv.getContext('2d');
  const measureCtx = document.createElement('canvas').getContext('2d');
  const stage = $('#stage'), stageWrap = $('#stageWrap'), overlay = $('#overlay');
  const panel = $('#panel');
  let scale = 0.4;

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
    return e;
  }

  function toast(msg, ms = 2400) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------------------------------------------------------------- 素材（照片 / 签名）
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片无法读取'));
      img.src = src;
    });
  }
  async function registerAsset(id, dataURL, persist) {
    const img = await loadImage(dataURL);
    assets[id] = { dataURL, img };
    if (persist) await DB.put('assets', { id, dataURL });
    return assets[id];
  }
  async function addImageFile(file) {
    const dataURL = await readAsDataURL(file);
    const id = 'a' + Date.now() + Math.random().toString(36).slice(2, 6);
    await registerAsset(id, dataURL, true);
    return id;
  }
  async function loadAssetsFor(st) {
    for (const id of [st.photo.assetId, st.sign.assetId]) {
      if (!id || assets[id]) continue;
      try {
        const rec = await DB.get('assets', id);
        if (rec) await registerAsset(id, rec.dataURL, false);
      } catch (e) { console.warn('素材读取失败', id, e); }
    }
  }
  /** 清理不再使用的图片，避免本地数据库越来越大（只在启动时做，保证撤销还能用） */
  async function cleanupAssets() {
    try {
      const keep = new Set([state.photo.assetId, state.sign.assetId]);
      const all = await DB.getAll('assets');
      for (const a of all) if (!keep.has(a.id)) await DB.del('assets', a.id);
    } catch (e) {}
  }

  // ---------------------------------------------------------------- 撤销 / 重做
  let undoStack = [], redoStack = [], lastSnap = '';
  function commit() {
    const s = JSON.stringify(state);
    if (s === lastSnap) return;
    undoStack.push(lastSnap);
    if (undoStack.length > 150) undoStack.shift();
    redoStack = [];
    lastSnap = s;
    updateUndoButtons();
  }
  let commitTimer;
  function commitSoon() { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 500); }
  function flushCommit() { if (commitTimer) { clearTimeout(commitTimer); commitTimer = null; commit(); } }

  async function restore(snap) {
    state = normalize(JSON.parse(snap));
    lastSnap = snap;
    rememberColors(state.templateColors);
    await loadAssetsFor(state);
    refreshAll();
  }
  async function undo() {
    stopEdit(); flushCommit();
    if (!undoStack.length) return toast('没有可以撤销的操作了');
    redoStack.push(lastSnap);
    await restore(undoStack.pop());
    updateUndoButtons();
  }
  async function redo() {
    stopEdit(); flushCommit();
    if (!redoStack.length) return toast('没有可以重做的操作了');
    undoStack.push(lastSnap);
    await restore(redoStack.pop());
    updateUndoButtons();
  }
  function updateUndoButtons() {
    $('#btnUndo').disabled = !undoStack.length;
    $('#btnRedo').disabled = !redoStack.length;
  }

  // ---------------------------------------------------------------- 自动保存
  let saveTimer;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(LS_STATE, JSON.stringify(state));
        const d = new Date();
        $('#saveInfo').textContent = `已自动保存 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      } catch (e) {
        $('#saveInfo').textContent = '自动保存失败（浏览器存储已满）';
      }
    }, 300);
  }

  /** 每次修改后调用：重画 + 自动保存（是否进撤销记录由调用方决定） */
  function changed() { scheduleRender(); scheduleSave(); }

  // ---------------------------------------------------------------- 绘制
  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }
  const requestedFonts = new Set();
  function ensureFonts() {
    for (const id of TEXT_IDS) {
      const el = state[id];
      const key = el.font + '|' + el.weight + '|' + !!el.italic;
      if (requestedFonts.has(key)) continue;
      requestedFonts.add(key);
      Fonts.ensure(el.font, el.weight, el.italic).then(scheduleRender);
    }
  }
  function render() {
    ensureFonts();
    drawScene(ctx, state, assets, { skipText: editing });
    drawOverlay();
    syncPanel();
    renderLayers();
    renderTemplateUI();
    renderLayoutUI();
  }
  function bounds(id) { return elementBounds(measureCtx, state, assets, id); }

  // ---------------------------------------------------------------- 画布尺寸适配
  function fit() {
    const r = stageWrap.getBoundingClientRect();
    const pad = 48;
    scale = Math.max(0.1, Math.min((r.width - pad) / W, (r.height - pad - 28) / H));
    stage.style.width = W * scale + 'px';
    stage.style.height = H * scale + 'px';
    $('#zoomInfo').textContent = `1242 × 1656 px · 显示 ${Math.round(scale * 100)}%`;
    if (editing) positionEditor();
    drawOverlay();
  }
  function toCanvas(e) {
    const r = stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }

  // ---------------------------------------------------------------- 覆盖层：选中框、手柄、辅助线、安全区
  let guides = [];
  function drawOverlay() {
    overlay.innerHTML = '';
    const s = scale;

    if (ui.showSafe) overlay.append(safeZoneSVG());

    if (!state.photo.assetId && state.photo.visible) {
      overlay.append(h('div', { class: 'photo-placeholder' },
        h('div', { class: 'ph-icon' }, '＋'),
        h('div', null, '把照片拖到这里'),
        h('div', { class: 'ph-sub' }, '或点击顶部「上传照片」')));
    }

    for (const g of guides) {
      overlay.append(h('div', {
        class: 'guide ' + g.dir,
        style: g.dir === 'v' ? { left: g.pos * s + 'px' } : { top: g.pos * s + 'px' },
      }));
    }

    if (!selected || editing === selected) return;
    const el = state[selected];
    if (!el.visible) return;
    if (selected === 'sign' && !el.assetId) return;
    const b = bounds(selected);
    const box = h('div', {
      class: 'sel-box' + (selected === 'photo' ? ' photo' : '') + (el.locked ? ' locked' : ''),
      style: { left: b.x * s + 'px', top: b.y * s + 'px', width: b.w * s + 'px', height: b.h * s + 'px' },
    });
    if (!el.locked) {
      let dirs = [];
      if (selected === 'block') dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
      else if (BOX_TEXT.includes(selected) || selected === 'rule') dirs = ['e', 'w'];
      else if (selected === 'sign') dirs = ['ne', 'nw', 'se', 'sw'];
      for (const d of dirs) box.append(h('div', { class: 'handle h-' + d, 'data-handle': d, title: '拖动改变大小' }));
    }
    if (selected === 'photo') {
      box.append(h('div', { class: 'sel-hint' }, state.photo.assetId ? '拖动调整位置 · 滚轮缩放 · 双击重置' : '还没有照片'));
    }
    overlay.append(box);
  }

  function safeZoneSVG() {
    // 估算值（以 iPhone 双列信息流卡片宽约 175pt 换算到 1242px）
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'safe-svg');
    const top1 = (H - W) / 2, bot1 = top1 + W;
    svg.innerHTML = `
      <rect x="0" y="0" width="${W}" height="${top1}" class="sz-shade"/>
      <rect x="0" y="${bot1}" width="${W}" height="${H - bot1}" class="sz-shade"/>
      <line x1="0" y1="${top1}" x2="${W}" y2="${top1}" class="sz-line red"/>
      <line x1="0" y1="${bot1}" x2="${W}" y2="${bot1}" class="sz-line red"/>
      <text x="${W / 2}" y="${top1 + 38}" text-anchor="middle" class="sz-text red">1:1 裁切线 · 搜索/分享卡片等入口可能裁掉线外区域</text>
      <rect x="62" y="62" width="${W - 124}" height="${H - 124}" class="sz-line gray"/>
      <text x="${W - 70}" y="${H - 22}" text-anchor="end" class="sz-text gray">边缘安全线 · 文字别贴出这条线</text>
      <rect x="28" y="28" width="250" height="118" rx="14" class="sz-zone"/>
      <text x="40" y="176" class="sz-text red">主页「置顶」标记</text>
      <rect x="${W - 228}" y="28" width="200" height="200" rx="100" class="sz-zone"/>
      <text x="${W - 40}" y="262" text-anchor="end" class="sz-text red">视频笔记播放图标</text>`;
    return svg;
  }

  // ---------------------------------------------------------------- 命中检测
  function hitTest(p) {
    const order = ['sign', 'place', 'num', 'subtitle', 'title', 'chips', 'tag', 'rule', 'block', 'photo'];
    for (const id of order) {
      const el = state[id];
      if (!el.visible || el.locked) continue;
      if (id === 'sign' && !el.assetId) continue;
      const b = bounds(id);
      const pad = id === 'photo' ? 0 : (id === 'rule' ? 10 : 6) / scale;
      if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad) return id;
    }
    return null;
  }

  function select(id) {
    if (editing && editing !== id) stopEdit();
    if (selected === id) return;
    selected = id;
    buildPanel();
    scheduleRender();
  }

  // ---------------------------------------------------------------- 拖拽 / 缩放
  let drag = null;
  const MIN = 30;

  function clampPhoto() {
    const p = state.photo;
    const a = p.assetId && assets[p.assetId];
    if (!a) return;
    const r = photoRect(state, assets);
    const mx = Math.max(0, (r.w - r.frame.w) / 2), my = Math.max(0, (r.h - r.frame.h) / 2);
    p.ox = Math.max(-mx, Math.min(mx, p.ox));
    p.oy = Math.max(-my, Math.min(my, p.oy));
  }

  function snapMove(id, nx, ny, b) {
    const th = 8 / scale;
    guides = [];
    const cx = nx + b.w / 2, cy = ny + b.h / 2;
    // 水平：画布中线、左右安全边、和其它文字左对齐
    const xs = [{ v: W / 2, use: 'c' }, { v: 62, use: 'l' }, { v: W - 62, use: 'r' }];
    for (const o of TEXT_IDS.concat('block')) {
      if (o === id || !state[o].visible) continue;
      const ob = bounds(o);
      xs.push({ v: ob.x, use: 'l' });
    }
    for (const c of xs) {
      const cur = c.use === 'c' ? cx : c.use === 'l' ? nx : nx + b.w;
      if (Math.abs(cur - c.v) < th) { nx += c.v - cur; guides.push({ dir: 'v', pos: c.v }); break; }
    }
    const ys = [{ v: H / 2, use: 'c' }];
    if (id !== 'block' && state.block.visible) ys.push({ v: state.block.y + state.block.h / 2, use: 'c' });
    for (const c of ys) {
      if (Math.abs(cy - c.v) < th) { ny += c.v - cy; guides.push({ dir: 'h', pos: c.v }); break; }
    }
    return { x: Math.round(nx), y: Math.round(ny) };
  }

  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.inline-editor')) return;
    if (editing) stopEdit();
    const p = toCanvas(e);
    const handle = e.target.dataset && e.target.dataset.handle;
    if (handle && selected) {
      const el = state[selected];
      drag = { type: 'resize', id: selected, dir: handle, start: p, orig: { ...el }, ob: bounds(selected), moved: false };
    } else {
      const hit = hitTest(p);
      if (selected === 'photo' && state.photo.assetId && !state.photo.locked) {
        drag = { type: 'photo', start: p, orig: { ox: state.photo.ox, oy: state.photo.oy }, hit, moved: false };
      } else if (hit) {
        select(hit);
        if (hit === 'photo' && !state.photo.assetId) { drag = null; return; }
        drag = hit === 'photo'
          ? { type: 'photo', start: p, orig: { ox: state.photo.ox, oy: state.photo.oy }, hit, moved: false }
          : { type: 'move', id: hit, start: p, orig: { x: state[hit].x, y: state[hit].y }, ob: bounds(hit), moved: false };
      } else {
        select(null);
        return;
      }
    }
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  stage.addEventListener('pointermove', e => {
    if (!drag) {
      const p = toCanvas(e);
      const hit = hitTest(p);
      stage.style.cursor = e.target.dataset.handle ? '' : (selected === 'photo' && state.photo.assetId) || (hit && hit !== 'photo') || (hit === 'photo' && state.photo.assetId) ? 'move' : 'default';
      return;
    }
    const p = toCanvas(e);
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) * scale < 3) return;
    drag.moved = true;
    if (drag.type === 'photo') {
      state.photo.ox = drag.orig.ox + dx;
      state.photo.oy = drag.orig.oy + dy;
      clampPhoto();
    } else if (drag.type === 'move') {
      const el = state[drag.id];
      const r = e.altKey ? { x: Math.round(drag.orig.x + dx), y: Math.round(drag.orig.y + dy) } : snapMove(drag.id, drag.orig.x + dx, drag.orig.y + dy, drag.ob);
      if (e.altKey) guides = [];
      el.x = r.x; el.y = r.y;
    } else if (drag.type === 'resize') {
      doResize(drag, dx, dy, e.shiftKey);
    }
    if (drag.id === 'block') clampPhoto();   // 色场编号版式里，照片区域跟着色块上边走
    changed();
  });

  function doResize(d, dx, dy) {
    const el = state[d.id], o = d.orig, dir = d.dir;
    if (d.id === 'block') {
      let { x, y, w, h: hh } = o;
      if (dir.includes('e')) w = Math.max(MIN, o.w + dx);
      if (dir.includes('s')) hh = Math.max(MIN, o.h + dy);
      if (dir.includes('w')) { w = Math.max(MIN, o.w - dx); x = o.x + o.w - w; }
      if (dir.includes('n')) { hh = Math.max(MIN, o.h - dy); y = o.y + o.h - hh; }
      Object.assign(el, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh) });
    } else if (BOX_TEXT.includes(d.id) || d.id === 'rule') {
      const min = d.id === 'rule' ? 20 : 60;
      if (dir === 'e') el.w = Math.round(Math.max(min, o.w + dx));
      else { const w = Math.max(min, o.w - dx); el.x = Math.round(o.x + o.w - w); el.w = Math.round(w); }
    } else if (d.id === 'sign') {
      const ratio = d.ob.h / d.ob.w;
      let w = dir.includes('e') ? o.w + dx : o.w - dx;
      w = Math.max(30, w);
      const hh = w * ratio;
      el.w = Math.round(w);
      el.x = Math.round(dir.includes('w') ? o.x + o.w - w : o.x);
      el.y = Math.round(dir.includes('n') ? o.y + d.ob.h - hh : o.y);
    }
  }

  function endDrag(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    guides = [];
    if (d.moved) commit();
    else if (d.type === 'photo' && d.hit && d.hit !== 'photo') select(d.hit);
    scheduleRender();
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener('dblclick', e => {
    if (e.target.closest('.inline-editor')) return;
    const p = toCanvas(e);
    const hit = hitTest(p);
    if (TEXT_IDS.includes(hit)) startEdit(hit);
    else if (hit === 'photo' || (selected === 'photo' && hit === null)) resetPhoto();
  });

  stage.addEventListener('wheel', e => {
    if (selected !== 'photo' || !state.photo.assetId || state.photo.locked) return;
    e.preventDefault();
    const p = state.photo;
    p.scale = Math.max(1, Math.min(4, p.scale * (e.deltaY < 0 ? 1.05 : 1 / 1.05)));
    clampPhoto();
    changed();
    commitSoon();
  }, { passive: false });

  function resetPhoto() {
    const p = state.photo;
    if (!p.assetId) return;
    p.scale = 1; p.ox = 0; p.oy = 0;
    changed(); commit();
    toast('照片已重置为铺满');
  }

  // ---------------------------------------------------------------- 画布上直接改字
  let editorEl = null;
  function startEdit(id) {
    stopEdit();
    if (!state[id].visible) return;
    selected = id;
    buildPanel();
    editing = id;
    const el = state[id];
    const ta = h('textarea', { class: 'inline-editor', spellcheck: 'false', wrap: AUTO_TEXT.includes(id) ? 'off' : 'soft' });
    ta.value = textOf(state, id);
    ta.addEventListener('pointerdown', e => e.stopPropagation());
    ta.addEventListener('input', () => {
      setText(id, ta.value);
      positionEditor();
      changed();
      commitSoon();
    });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); stopEdit(); }
    });
    ta.addEventListener('blur', () => setTimeout(() => { if (editorEl === ta) stopEdit(); }, 0));
    editorEl = ta;
    stage.append(ta);
    positionEditor();
    ta.focus();
    ta.select();
    scheduleRender();
  }
  function positionEditor() {
    if (!editorEl || !editing) return;
    const id = editing, el = state[id], s = scale;
    const b = bounds(id);
    let x = el.x, y = el.y, w = el.w;
    if (id === 'tag') { const p = tagPadding(el); x = b.x + p.x; y = b.y + p.y; w = Math.max(b.w - p.x * 2, el.size * 2) + el.size; }
    else if (id === 'chips') { y = b.y + (b.h - el.size * el.lineHeight) / 2; w = Math.max(b.w, el.size * 8) + el.size * 2; }
    Object.assign(editorEl.style, {
      left: x * s + 'px', top: y * s + 'px', width: w * s + 'px',
      fontFamily: `"${el.font}", "Noto Sans SC", sans-serif`, fontStyle: el.italic ? 'italic' : 'normal',
      fontWeight: el.weight, fontSize: el.size * s + 'px', lineHeight: el.lineHeight,
      letterSpacing: (el.letterSpacing || 0) * s + 'px', color: el.color, textAlign: AUTO_TEXT.includes(id) ? 'left' : el.align,
    });
    editorEl.style.height = 'auto';
    editorEl.style.height = Math.max(editorEl.scrollHeight, el.size * el.lineHeight * s) + 'px';
  }
  function stopEdit() {
    if (!editing) return;
    const ta = editorEl;
    editorEl = null;
    editing = null;
    if (ta) ta.remove();
    flushCommit();
    commit();
    scheduleRender();
  }
  function setText(id, v) {
    if (id === 'tag') state.tagTexts[state.template] = v;
    else state[id].text = v;
  }

  // ---------------------------------------------------------------- 模板
  function setTemplate(t) {
    if (!TEMPLATES[t] || state.template === t) return;
    stopEdit();
    state.template = t;
    changed(); commit();
    buildPanel();
    toast(`已切换到「${TEMPLATES[t].name}」模板，文字和照片都保留`);
  }
  function setTemplateColor(t, color, final) {
    state.templateColors[t] = color;
    rememberColors(state.templateColors);
    changed();
    if (final) commit();
  }

  function renderTemplateUI() {
    document.querySelectorAll('#tplSwitch button').forEach(b => {
      b.classList.toggle('active', b.dataset.tpl === state.template);
      b.querySelector('.dot').style.background = state.templateColors[b.dataset.tpl];
    });
    document.querySelectorAll('#tplColors .tpl-row').forEach(row => {
      const t = row.dataset.tpl;
      row.classList.toggle('active', t === state.template);
      const inp = row.querySelector('input[type=color]');
      if (document.activeElement !== inp) inp.value = state.templateColors[t];
      row.querySelector('.hex').textContent = state.templateColors[t].toUpperCase();
    });
  }
  function buildTemplateColors() {
    const box = $('#tplColors');
    box.innerHTML = '';
    for (const [t, def] of Object.entries(TEMPLATES)) {
      const inp = h('input', { type: 'color', title: `修改「${def.name}」模板的颜色（会自动记住）` });
      inp.addEventListener('input', () => setTemplateColor(t, inp.value, false));
      inp.addEventListener('change', () => setTemplateColor(t, inp.value, true));
      const row = h('div', { class: 'tpl-row', 'data-tpl': t },
        h('label', { class: 'swatch', 'data-tip': '点色块打开取色器' }, inp),
        h('div', { class: 'tpl-meta', onclick: () => setTemplate(t), title: `切换到「${def.name}」模板` },
          h('div', { class: 'tpl-name' }, def.name),
          h('div', { class: 'tpl-sub' }, h('span', { class: 'hex' }), ' · ' + def.colorName)),
        h('button', { class: 'mini', 'data-tip': `恢复默认${def.colorName} ${def.color}`, onclick: () => setTemplateColor(t, def.color, true) }, '↺'));
      box.append(row);
    }
  }

  // ---------------------------------------------------------------- 版式
  function setLayout(id) {
    if (!LAYOUTS[id] || state.layout === id) return;
    stopEdit();
    state.layoutStore[state.layout] = pickLayout(state);
    const L = state.layoutStore[id] || layoutDefaults(id);
    applyLayout(state, JSON.parse(JSON.stringify(L)));
    state.layout = id;
    clampPhoto();
    selected = null;
    changed(); commit();
    buildPanel();
    toast(`已切换到「${LAYOUTS[id].name}」版式，文字和照片都保留`);
  }
  function resetLayoutPositions() {
    stopEdit();
    applyLayout(state, layoutDefaults(state.layout));
    clampPhoto();
    changed(); commit();
    buildPanel();
    toast(`已恢复「${LAYOUTS[state.layout].name}」版式的默认位置和样式`);
  }
  function buildLayoutPick() {
    const box = $('#layoutPick');
    box.innerHTML = '';
    for (const [id, L] of Object.entries(LAYOUTS)) {
      box.append(h('button', { class: 'layout-btn', 'data-layout': id, 'data-tip': `${L.desc}（文字和照片保留）`, onclick: () => setLayout(id) },
        h('span', { class: 'lo-mini lo-' + id }, h('i'), h('b'), h('em')),
        h('span', { class: 'lo-name' }, L.name)));
    }
  }
  function renderLayoutUI() {
    document.querySelectorAll('#layoutPick .layout-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.layout === state.layout);
      b.querySelector('.lo-mini').style.setProperty('--tpl', tplColor(state));
    });
  }

  // ---------------------------------------------------------------- 图层列表
  let layersSig = '';
  function renderLayers() {
    const sig = JSON.stringify([selected, state.block.opacity, LAYERS.map(l => [state[l.id].visible, state[l.id].locked, state[l.id].assetId, TEXT_IDS.includes(l.id) ? textOf(state, l.id) : ''])]);
    if (sig === layersSig) return;
    layersSig = sig;
    const ul = $('#layers');
    ul.innerHTML = '';
    for (const l of LAYERS) {
      const el = state[l.id];
      let sub = '';
      if (TEXT_IDS.includes(l.id)) sub = textOf(state, l.id).replace(/\n/g, ' ') || '（空）';
      else if (l.id === 'photo') sub = el.assetId ? '已放入' : '未上传';
      else if (l.id === 'sign') sub = el.assetId ? '已放入' : '未上传';
      else if (l.id === 'block') sub = `透明度 ${el.opacity}%`;
      else if (l.id === 'rule') sub = `长 ${el.w}px`;
      const li = h('li', { class: 'layer' + (selected === l.id ? ' active' : '') + (el.visible ? '' : ' hidden-layer'), title: `选中「${l.name}」` },
        h('span', { class: 'l-icon' }, l.icon),
        h('span', { class: 'l-text' }, h('span', { class: 'l-name' }, l.name), h('span', { class: 'l-sub' }, sub)),
        h('button', {
          class: 'mini' + (el.locked ? ' on' : ''), 'data-tip': el.locked ? '解锁（锁定后画布上点不中它）' : '锁定（画布上点不中它，方便拖下面的照片）',
          onclick: ev => { ev.stopPropagation(); el.locked = !el.locked; changed(); commit(); },
          html: el.locked ? ICONS.lock : ICONS.unlock }),
        h('button', {
          class: 'mini' + (el.visible ? '' : ' on'), 'data-tip': el.visible ? '隐藏这个图层' : '显示这个图层',
          onclick: ev => { ev.stopPropagation(); el.visible = !el.visible; changed(); commit(); },
          html: el.visible ? ICONS.eye : ICONS.eyeOff }));
      li.addEventListener('click', () => select(l.id));
      if (l.id === 'sign' || l.id === 'photo') {
        li.addEventListener('dragover', ev => { ev.preventDefault(); li.classList.add('drop'); });
        li.addEventListener('dragleave', () => li.classList.remove('drop'));
        li.addEventListener('drop', ev => {
          ev.preventDefault(); ev.stopPropagation(); li.classList.remove('drop'); hideDropHint();
          const f = [...ev.dataTransfer.files].find(f => f.type.startsWith('image/'));
          if (f) (l.id === 'sign' ? setSignFile : setPhotoFile)(f);
        });
      }
      ul.append(li);
    }
  }

  // ---------------------------------------------------------------- 右侧属性面板
  let bindings = [];
  function syncPanel() { for (const b of bindings) b(); }
  const isFocused = el => document.activeElement === el;
  const round = (v, d = 0) => { const m = 10 ** d; return Math.round(v * m) / m; };

  function field(label, control, tip) {
    return h('div', { class: 'field' }, h('label', { class: 'f-label', title: tip || '' }, label), control);
  }
  function group(title, ...rows) { return h('section', { class: 'group' }, title && h('h4', null, title), ...rows); }

  function sliderCtl({ label, min, max, step = 1, get, set, unit = '', tip, digits = 0, numMin, numMax }) {
    const r = h('input', { type: 'range', min, max, step, title: tip || label });
    const n = h('input', { type: 'number', class: 'num', min: numMin ?? min, max: numMax ?? max, step, title: tip || label });
    const lo = numMin ?? min, hi = numMax ?? max;
    const upd = () => { const v = get(); if (!isFocused(r)) r.value = v; if (!isFocused(n)) n.value = round(v, digits); };
    r.addEventListener('input', () => { set(+r.value); n.value = round(+r.value, digits); changed(); });
    r.addEventListener('change', commit);
    n.addEventListener('input', () => { if (n.value === '' || isNaN(+n.value)) return; set(Math.max(lo, Math.min(hi, +n.value))); r.value = n.value; changed(); });
    n.addEventListener('change', () => { commit(); upd(); });
    bindings.push(upd); upd();
    return field(label, h('div', { class: 'slider' }, r, n, unit && h('span', { class: 'unit' }, unit)), tip);
  }
  function numCtl({ label, get, set, tip, step = 1 }) {
    const n = h('input', { type: 'number', class: 'num wide', step, title: tip || label });
    const upd = () => { if (!isFocused(n)) n.value = round(get()); };
    n.addEventListener('input', () => { if (n.value === '' || isNaN(+n.value)) return; set(+n.value); changed(); });
    n.addEventListener('change', () => { commit(); upd(); });
    bindings.push(upd); upd();
    return h('label', { class: 'num-field', title: tip || label }, h('span', null, label), n);
  }
  function colorCtl({ label, get, set, tip, swatches = [] }) {
    const c = h('input', { type: 'color', title: '打开取色器' });
    const t = h('input', { type: 'text', class: 'hex-input', maxlength: 7, title: '也可以直接输入色号，例如 #22221F' });
    const upd = () => { const v = get(); if (!isFocused(c)) c.value = v; if (!isFocused(t)) t.value = v.toUpperCase(); };
    c.addEventListener('input', () => { set(c.value); t.value = c.value.toUpperCase(); changed(); });
    c.addEventListener('change', commit);
    t.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(t.value)) { set(t.value); c.value = t.value; changed(); } });
    t.addEventListener('change', () => { commit(); upd(); });
    const sw = swatches.map(s => h('button', { class: 'sw', style: { background: s.color }, 'data-tip': s.tip, onclick: () => { set(s.color); changed(); commit(); } }));
    bindings.push(upd); upd();
    return field(label, h('div', { class: 'color-row' }, h('label', { class: 'swatch big' }, c), t, ...sw), tip);
  }
  function selectCtl({ label, options, get, set, tip }) {
    const s = h('select', { title: tip || label }, ...options.map(o => h('option', { value: o.value }, o.label)));
    const upd = () => { if (!isFocused(s)) s.value = String(get()); };
    s.addEventListener('change', () => { set(s.value); changed(); commit(); });
    bindings.push(upd); upd();
    return field(label, s, tip);
  }
  function segCtl({ label, options, get, set }) {
    const btns = options.map(o => h('button', { class: 'seg-btn', 'data-tip': o.tip, onclick: () => { set(o.value); changed(); commit(); } }, o.label));
    const upd = () => btns.forEach((b, i) => b.classList.toggle('active', options[i].value === get()));
    bindings.push(upd); upd();
    return field(label, h('div', { class: 'seg' }, ...btns));
  }
  function textCtl(id) {
    const ta = h('textarea', { class: 'text-input', rows: id === 'title' ? 3 : 2, spellcheck: 'false', title: '回车换行；和画布双击编辑是同步的' });
    const upd = () => { if (!isFocused(ta)) { const v = textOf(state, id); if (ta.value !== v) ta.value = v; } };
    ta.addEventListener('input', () => { setText(id, ta.value); if (editing === id && editorEl) { editorEl.value = ta.value; positionEditor(); } changed(); commitSoon(); });
    ta.addEventListener('blur', flushCommit);
    bindings.push(upd); upd();
    return field('文字内容', ta, '回车换行');
  }

  function fontPicker(el) {
    const btn = h('button', { class: 'font-btn', title: '选择字体（列表里每个字体都用它自己显示）' });
    const pop = h('div', { class: 'font-pop', hidden: true });
    const upd = () => {
      btn.textContent = Fonts.displayName(el.font);
      btn.style.fontFamily = `"${el.font}", "Noto Sans SC", sans-serif`;
      const d = Fonts.def(el.font);
      btn.classList.toggle('missing', !d || d.status === 'missing');
    };
    const fill = () => {
      pop.innerHTML = '';
      const list = Fonts.all();
      for (const f of list) {
        const item = h('div', { class: 'font-item' + (f.family === el.font ? ' active' : '') + (f.status === 'missing' ? ' missing' : ''), title: f.status === 'missing' ? '没找到字体文件，请看 README 下载后放进 fonts 文件夹' : f.family },
          h('span', { class: 'fi-name', style: { fontFamily: `"${f.family}", "Noto Sans SC", sans-serif` } }, f.name),
          h('span', { class: 'fi-tag' }, f.status === 'missing' ? '缺文件' : f.status === 'checking' ? '加载中' : f.builtin ? (f.note || '免费商用') : '我上传的'));
        if (!f.builtin) {
          item.append(h('button', {
            class: 'mini', 'data-tip': '从字体库删除', onclick: async ev => {
              ev.stopPropagation();
              if (!confirm(`从字体库删除「${f.name}」？`)) return;
              await Fonts.removeCustom(f.id);
              fill();
            },
          }, '×'));
        }
        item.addEventListener('click', () => {
          el.font = f.family;
          const ws = Fonts.weightOptions(f.family).map(o => o.value);
          if (!ws.includes(+el.weight)) el.weight = ws.reduce((a, b) => (Math.abs(b - el.weight) < Math.abs(a - el.weight) ? b : a));
          pop.hidden = true;
          changed(); commit();
          buildPanel();
        });
        if (f.builtin && list.indexOf(f) === FONT_DEFS.length - 1 && Fonts.custom.length) item.classList.add('divider');
        pop.append(item);
      }
      pop.append(h('div', { class: 'font-item upload', onclick: () => { pop.hidden = true; $('#fileFont').click(); }, title: '支持 .ttf .otf .woff .woff2，也可以直接把字体文件拖进窗口' }, '＋ 上传字体（.ttf / .otf）'));
    };
    btn.addEventListener('click', ev => { ev.stopPropagation(); if (pop.hidden) { fill(); pop.hidden = false; } else pop.hidden = true; });
    bindings.push(upd); upd();
    return field('字体', h('div', { class: 'font-picker' }, btn, pop));
  }

  function textGroup(id) {
    const el = state[id];
    const t = state[id];
    const rows = [
      textCtl(id),
      fontPicker(el),
      sliderCtl({ label: '字号', min: 12, max: 400, get: () => t.size, set: v => { t.size = v; }, unit: 'px', numMax: 800 }),
      selectCtl({ label: '字重', options: weightOptionsWithCurrent(el), get: () => t.weight, set: v => { t.weight = +v; } }),
      segCtl({
        label: '字形', get: () => !!t.italic, set: v => { t.italic = v; },
        options: [{ value: false, label: '正体', tip: '正常字形' }, { value: true, label: '斜体', tip: '斜体（Bodoni、Cormorant、Playfair 有真正的斜体，其他字体会自动倾斜）' }],
      }),
      colorCtl({
        label: '颜色', get: () => t.color, set: v => { t.color = v; },
        swatches: [{ color: INK, tip: '深墨色 #22221F（默认）' }, { color: '#FFFFFF', tip: '白色' }, { color: '#6B6760', tip: '暖灰 #6B6760' }],
      }),
      sliderCtl({ label: '行距', min: 0.8, max: 2.5, step: 0.02, digits: 2, get: () => t.lineHeight, set: v => { t.lineHeight = v; }, unit: '倍' }),
      sliderCtl({ label: '字间距', min: -20, max: 80, get: () => t.letterSpacing, set: v => { t.letterSpacing = v; }, unit: 'px', tip: '每个字之间额外加的距离（按导出尺寸 1242px 计）' }),
    ];
    if (BOX_TEXT.includes(id)) {
      rows.push(segCtl({
        label: '对齐', get: () => t.align, set: v => { t.align = v; },
        options: [{ value: 'left', label: '左', tip: '左对齐' }, { value: 'center', label: '中', tip: '居中对齐' }, { value: 'right', label: '右', tip: '右对齐' }],
      }));
    }
    const NOTES = {
      chips: '用「/」分隔，每一段是一个小框。第一个框是实心的，里面的字是当前模板色。',
      num: '大编号。默认用 Bodoni Moda 斜体、右对齐，改成 08、09… 就是一个系列。',
      place: '地点、日期或一句英文。默认用 Cormorant 斜体、右对齐。',
    };
    if (NOTES[id]) rows.unshift(h('p', { class: 'note' }, NOTES[id]));
    const out = [group(LAYER_NAME[id], ...rows)];

    const pos = [numCtl({ label: 'X', get: () => t.x, set: v => { t.x = v; }, tip: '左边距离（px）' }), numCtl({ label: 'Y', get: () => t.y, set: v => { t.y = v; }, tip: '上边距离（px）' })];
    if (BOX_TEXT.includes(id)) pos.push(numCtl({ label: '宽', get: () => t.w, set: v => { t.w = Math.max(60, v); }, tip: '文字框宽度，超出会自动换行' }));
    out.push(group('位置', h('div', { class: 'num-row' }, ...pos),
      h('div', { class: 'btn-row' },
        h('button', { class: 'ghost', 'data-tip': '让这段文字在画布上水平居中', onclick: () => centerH(id) }, '水平居中'),
        (id === 'title' || id === 'subtitle') && h('button', { class: 'ghost', 'data-tip': '文字框左右各留 90px 边距', onclick: () => { t.x = 90; t.w = W - 180; changed(); commit(); } }, '铺满宽度'))));

    if (id === 'tag') {
      out.push(group('标签底色',
        h('p', { class: 'note' }, '底色跟随当前模板颜色，在左边「模板颜色」里修改。'),
        sliderCtl({ label: '底色透明度', min: 0, max: 100, get: () => t.bgOpacity, set: v => { t.bgOpacity = v; }, unit: '%' }),
        sliderCtl({ label: '圆角', min: 0, max: 60, get: () => t.radius, set: v => { t.radius = v; }, unit: 'px' })));
    }

    const warn = h('p', { class: 'note warn' });
    bindings.push(() => {
      const pt = t.size * (175 / W);
      warn.textContent = pt < 4.5 ? `提示：在双列信息流里，这段字大约只有 ${pt.toFixed(1)}pt，手机上可能看不清。` : '';
      warn.hidden = !warn.textContent;
    });
    out.push(warn);
    return out;
  }
  function weightOptionsWithCurrent(el) {
    const opts = Fonts.weightOptions(el.font);
    if (!opts.some(o => o.value === +el.weight)) opts.push({ value: +el.weight, label: (WEIGHT_NAMES[el.weight] || el.weight) + '（模拟）' });
    return opts.sort((a, b) => a.value - b.value);
  }
  function centerH(id) {
    const el = state[id];
    const b = bounds(id);
    el.x = Math.round((W - b.w) / 2);
    changed(); commit();
  }

  function buildPanel() {
    bindings = [];
    panel.innerHTML = '';
    const id = selected;
    panel.append(h('div', { class: 'panel-head' }, h('span', null, id ? LAYER_NAME[id] : '画布'), id && h('button', { class: 'mini', 'data-tip': '取消选择（Esc）', onclick: () => select(null) }, '×')));

    if (!id) {
      panel.append(
        group('当前封面',
          h('p', { class: 'note' }, `模板：${TEMPLATES[state.template].name}　尺寸：1242 × 1656 px（3:4）`),
          colorCtl({ label: '底色', get: () => state.bg, set: v => { state.bg = v; }, tip: '没有照片或照片透明时露出的底色' }),
          h('label', { class: 'check', title: '显示双列预览时可能被裁掉或被遮住的区域' },
            h('input', { type: 'checkbox', checked: ui.showSafe, onchange: e => setSafe(e.target.checked) }), ' 显示安全区提示')),
        group(`版式：${LAYOUTS[state.layout].name}`,
          h('p', { class: 'note' }, LAYOUTS[state.layout].desc + '。在左边「版式」里切换。'),
          sliderCtl({ label: '颗粒质感', min: 0, max: 60, get: () => state.grain, set: v => { state.grain = v; }, unit: '%', tip: '给整张图加一点胶片颗粒，去掉数码味。导出 PNG 时最明显' }),
          h('label', { class: 'check', title: '降低饱和度、稍微偏暖，让不同照片的色调更统一' },
            h('input', { type: 'checkbox', checked: state.photoSoft, onchange: e => { state.photoSoft = e.target.checked; changed(); commit(); } }), ' 照片柔和滤镜（低饱和、统一色调）'),
          h('div', { class: 'btn-row' },
            h('button', { class: 'ghost', 'data-tip': '把这个版式的所有元素恢复到默认位置和样式（文字和照片保留）', onclick: () => { if (confirm('把当前版式的位置、字体、颜色都恢复默认？\n文字内容和照片会保留，可以 Ctrl+Z 撤销。')) resetLayoutPositions(); } }, '恢复本版式默认样式'))),
        group('使用小贴士', h('ul', { class: 'tips' },
          h('li', null, '照片：直接拖进画布，或点顶部「上传照片」'),
          h('li', null, '点画布上的元素选中它，拖动移动位置'),
          h('li', null, '双击文字可以直接在画布上改字'),
          h('li', null, '选中照片后：拖动调整位置、滚轮缩放、双击重置'),
          h('li', null, '拖动时会自动吸附中线和对齐线，按住 Alt 可以关掉吸附'),
          h('li', null, '方向键微调位置（按住 Shift 一次 10px）'),
          h('li', null, 'Ctrl+Z 撤销 · Ctrl+Shift+Z 重做 · Ctrl+S 保存项目'))));
      return;
    }

    if (TEXT_IDS.includes(id)) {
      panel.append(...textGroup(id));
    } else if (id === 'block') {
      const b = state.block;
      panel.append(
        group('标题色块',
          colorCtl({ label: '颜色', get: () => tplColor(state), set: v => { state.templateColors[state.template] = v; rememberColors(state.templateColors); }, tip: `修改「${TEMPLATES[state.template].name}」模板的颜色，会自动记住` }),
          sliderCtl({ label: '透明度', min: 0, max: 100, get: () => b.opacity, set: v => { b.opacity = v; }, unit: '%', tip: '0 = 完全透明，100 = 完全不透明' }),
          sliderCtl({ label: '圆角', min: 0, max: 300, get: () => b.radius, set: v => { b.radius = v; }, unit: 'px' })),
        group('位置和大小',
          h('div', { class: 'num-row' },
            numCtl({ label: 'X', get: () => b.x, set: v => { b.x = v; } }),
            numCtl({ label: 'Y', get: () => b.y, set: v => { b.y = v; } })),
          h('div', { class: 'num-row' },
            numCtl({ label: '宽', get: () => b.w, set: v => { b.w = Math.max(MIN, v); } }),
            numCtl({ label: '高', get: () => b.h, set: v => { b.h = Math.max(MIN, v); } })),
          h('div', { class: 'btn-row' },
            h('button', { class: 'ghost', 'data-tip': '恢复到当前版式的默认位置和大小', onclick: () => { const d = layoutDefaults(state.layout).block; Object.assign(b, { x: d.x, y: d.y, w: d.w, h: d.h }); clampPhoto(); changed(); commit(); } }, '恢复默认位置'))),
        group(null, h('p', { class: 'note' }, state.layout === 'index'
          ? '在画布上拖动四边或四角的小方块可以改变大小。色场编号版式里，照片只显示在色块上方，拖色块的上边就能调整照片高度。'
          : '在画布上拖动四边或四角的小方块可以改变大小。')));
    } else if (id === 'rule') {
      const r = state.rule;
      panel.append(
        group('细线',
          colorCtl({ label: '颜色', get: () => r.color, set: v => { r.color = v; }, swatches: [{ color: INK, tip: '深墨色 #22221F（默认）' }, { color: '#FFFFFF', tip: '白色' }] }),
          sliderCtl({ label: '粗细', min: 0.5, max: 12, step: 0.5, digits: 1, get: () => r.thick, set: v => { r.thick = v; }, unit: 'px' })),
        group('位置和长度',
          h('div', { class: 'num-row' },
            numCtl({ label: 'X', get: () => r.x, set: v => { r.x = v; } }),
            numCtl({ label: 'Y', get: () => r.y, set: v => { r.y = v; } }),
            numCtl({ label: '长', get: () => r.w, set: v => { r.w = Math.max(20, v); } })),
          h('p', { class: 'note' }, '在画布上拖动细线移动，拖左右两端的小方块改变长度。')));
    } else if (id === 'photo') {
      const p = state.photo;
      panel.append(group('照片',
        h('div', { class: 'btn-row' },
          h('button', { class: 'ghost', 'data-tip': '选择一张照片（也可以直接拖进画布）', onclick: () => $('#filePhoto').click() }, p.assetId ? '更换照片' : '上传照片'),
          p.assetId && h('button', { class: 'ghost', 'data-tip': '恢复铺满、居中（也可以在画布上双击照片）', onclick: resetPhoto }, '重置'),
          p.assetId && h('button', { class: 'ghost danger', 'data-tip': '把照片从封面上拿掉', onclick: () => { p.assetId = null; changed(); commit(); buildPanel(); } }, '移除')),
        p.assetId && sliderCtl({ label: '缩放', min: 100, max: 400, get: () => Math.round(p.scale * 100), set: v => { p.scale = v / 100; clampPhoto(); }, unit: '%', tip: '100% = 刚好铺满画布' }),
        h('label', { class: 'check', title: '降低饱和度、稍微偏暖，让不同照片的色调更统一' },
          h('input', { type: 'checkbox', checked: state.photoSoft, onchange: e => { state.photoSoft = e.target.checked; changed(); commit(); } }), ' 柔和滤镜（低饱和、统一色调）'),
        h('p', { class: 'note' }, (state.layout === 'index' ? '色场编号版式里，照片铺满色块上方的区域。' : '照片默认铺满整个画布。') + '选中照片后在画布上拖动调整位置，滚轮或滑块缩放，双击重置。')));
    } else if (id === 'sign') {
      const s = state.sign;
      panel.append(group('签名 / 手写涂鸦',
        h('div', { class: 'btn-row' },
          h('button', { class: 'ghost', 'data-tip': '上传透明背景的 PNG（比如你画的签名）', onclick: () => $('#fileSign').click() }, s.assetId ? '更换 PNG' : '上传 PNG'),
          s.assetId && h('button', { class: 'ghost danger', 'data-tip': '把签名从封面上拿掉', onclick: () => { s.assetId = null; changed(); commit(); buildPanel(); } }, '移除')),
        s.assetId && sliderCtl({ label: '大小', min: 30, max: W, get: () => s.w, set: v => { s.w = v; }, unit: 'px', tip: '签名宽度' }),
        s.assetId && sliderCtl({ label: '不透明度', min: 0, max: 100, get: () => s.opacity, set: v => { s.opacity = v; }, unit: '%' }),
        s.assetId && h('div', { class: 'num-row' },
          numCtl({ label: 'X', get: () => s.x, set: v => { s.x = v; } }),
          numCtl({ label: 'Y', get: () => s.y, set: v => { s.y = v; } })),
        h('p', { class: 'note' }, s.assetId ? '在画布上拖动签名移动，拖四角缩放（保持比例）。' : '建议用透明背景的 PNG。也可以把图片拖到左边「签名 / 涂鸦」这一行上。')));
    }
  }

  // ---------------------------------------------------------------- 文件：照片、签名、字体、项目
  async function setPhotoFile(file) {
    try {
      const id = await addImageFile(file);
      Object.assign(state.photo, { assetId: id, scale: 1, ox: 0, oy: 0, visible: true });
      changed(); commit();
      select('photo'); buildPanel();
      toast('照片已放入，默认铺满。拖动可调整位置');
    } catch (e) { toast('这张图片读不出来，换一张试试'); }
  }
  async function setSignFile(file) {
    try {
      const id = await addImageFile(file);
      const s = state.sign;
      const img = assets[id].img;
      s.assetId = id; s.visible = true;
      s.w = Math.min(s.w || 240, 360);
      const hh = s.w * img.naturalHeight / img.naturalWidth;
      s.x = W - s.w - 60; s.y = Math.round(H - hh - 50);
      changed(); commit();
      select('sign'); buildPanel();
      toast('签名已放入右下角，可以拖动和缩放');
    } catch (e) { toast('这张图片读不出来，换一张试试'); }
  }
  async function addFontFiles(files) {
    for (const f of files) {
      try {
        const fam = await Fonts.addFile(f);
        toast(`字体「${fam}」已加入字体库`);
      } catch (e) {
        toast(`「${f.name}」不是有效的字体文件`);
      }
    }
    buildPanel();
  }

  function dateStr(sep = '') {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join(sep);
  }
  function titleSnippet(n = 8) {
    return (state.title.text || '').replace(/\s+/g, '').replace(/[\\/:*?"<>|]/g, '').slice(0, n) || '未命名';
  }
  function downloadBlob(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function saveProject() {
    stopEdit();
    const proj = { app: 'xhs-cover-maker', version: 1, savedAt: new Date().toISOString(), state, assets: {}, fonts: [] };
    for (const id of [state.photo.assetId, state.sign.assetId]) if (id && assets[id]) proj.assets[id] = assets[id].dataURL;
    for (const fam of new Set(TEXT_IDS.map(i => state[i].font))) {
      const rec = await Fonts.getCustomRecord(fam);
      if (rec) proj.fonts.push(rec);
    }
    const blob = new Blob([JSON.stringify(proj)], { type: 'application/json' });
    const name = `封面项目_${TEMPLATES[state.template].name}_${titleSnippet()}_${dateStr()}.json`;
    downloadBlob(blob, name);
    toast(`项目已保存：${name}`);
  }
  async function openProjectFile(file) {
    stopEdit();
    try {
      const proj = JSON.parse(await file.text());
      if (proj.app !== 'xhs-cover-maker' || !proj.state) throw new Error('不是本工具的项目文件');
      for (const [id, url] of Object.entries(proj.assets || {})) await registerAsset(id, url, true);
      for (const rec of proj.fonts || []) await Fonts.installRecord(rec);
      state = normalize(proj.state);
      rememberColors(state.templateColors);
      await loadAssetsFor(state);
      commit();
      selected = null;
      refreshAll();
      toast('项目已打开（可以 Ctrl+Z 回到打开前）');
    } catch (e) {
      alert('打开失败：' + e.message);
    }
  }

  // ---------------------------------------------------------------- 导出
  async function checkExportFonts() {
    await document.fonts.ready;
    const missing = [];
    for (const id of TEXT_IDS) {
      const el = state[id];
      if (!el.visible || !textOf(state, id).trim()) continue;
      const face = Fonts.faceFor(el.font, el.weight, el.italic);
      let ok = false;
      if (face) { try { await face.load(); ok = face.status === 'loaded'; } catch (e) {} }
      if (!ok) missing.push(`${LAYER_NAME[id]}：${Fonts.displayName(el.font)} ${el.weight}`);
    }
    return missing;
  }
  function renderFull() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    drawScene(c.getContext('2d'), state, assets, {});
    return c;
  }
  function thumbOf(c, w = 621) {
    const t = document.createElement('canvas');
    t.width = w; t.height = Math.round(w * H / W);
    const tc = t.getContext('2d');
    tc.imageSmoothingQuality = 'high';
    tc.drawImage(c, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.88);
  }
  async function exportPNG() {
    stopEdit();
    const btn = $('#btnExport');
    btn.disabled = true;
    try {
      const missing = await checkExportFonts();
      if (missing.length && !confirm(`下面这些字体没有加载成功，导出后会变成系统默认字体：\n\n${missing.join('\n')}\n\n请按 README 把字体文件放进 fonts 文件夹。仍然要导出吗？`)) return;
      const c = renderFull();
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const name = `${TEMPLATES[state.template].name}_${titleSnippet()}_${dateStr()}.png`;
      downloadBlob(blob, name);
      await DB.put('gallery', {
        id: 'g' + Date.now(), time: Date.now(), template: state.template,
        title: state.title.text.replace(/\n/g, ''), thumb: thumbOf(c),
      });
      toast(`已导出 ${name}（1242×1656），并加入主页预览`, 3200);
    } finally {
      btn.disabled = false;
    }
  }

  // ---------------------------------------------------------------- 主页预览（小红书双列瀑布流）
  const Preview = {
    includeCurrent: true,
    async open() {
      stopEdit();
      $('#previewModal').hidden = false;
      this.renderProfile();
      await this.refresh();
    },
    close() { $('#previewModal').hidden = true; },
    renderProfile() {
      const nameEl = $('#pvName');
      nameEl.textContent = localStorage.getItem('xhs-cover.nickname') || '我的小红书';
      $('#pvAvatar').textContent = nameEl.textContent.slice(0, 1);
    },
    likes(id) {
      let x = 0;
      for (const ch of id) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
      const n = x % 23000 + 30;
      return n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n);
    },
    async refresh() {
      const items = (await DB.getAll('gallery')).sort((a, b) => b.time - a.time);
      if (this.includeCurrent) items.unshift({ id: '__current', current: true, title: state.title.text.replace(/\n/g, ''), thumb: thumbOf(renderFull(), 400) });
      $('#pvCount').textContent = `${items.filter(i => !i.current).length} 篇已导出`;
      const cols = [$('#pvCol0'), $('#pvCol1')];
      cols.forEach(c => (c.innerHTML = ''));
      const heights = [0, 0];
      const name = $('#pvName').textContent;
      for (const it of items) {
        const lines = it.title.length > 11 ? 2 : 1;
        const card = h('div', { class: 'pv-card' + (it.current ? ' current' : '') },
          h('div', { class: 'pv-img' }, h('img', { src: it.thumb, alt: '' }), it.current && h('span', { class: 'pv-badge' }, '当前画布')),
          h('div', { class: 'pv-title' }, it.title || '无标题'),
          h('div', { class: 'pv-meta' }, h('span', { class: 'pv-av' }, name.slice(0, 1)), h('span', { class: 'pv-nick' }, name), h('span', { class: 'pv-like' }, '♡ ' + this.likes(it.id))));
        if (!it.current) {
          card.append(h('button', {
            class: 'pv-del', 'data-tip': '从预览里删除（不会删除已导出的图片文件）',
            onclick: async () => { await DB.del('gallery', it.id); this.refresh(); },
          }, '×'));
        }
        const col = heights[0] <= heights[1] ? 0 : 1;
        heights[col] += 4 / 3 + 0.12 + lines * 0.09;
        cols[col].append(card);
      }
      $('#pvEmpty').hidden = items.length > 0;
    },
  };

  // ---------------------------------------------------------------- 安全区
  function setSafe(on) {
    ui.showSafe = on;
    saveUI();
    $('#btnSafe').classList.toggle('on', on);
    scheduleRender();
  }

  // ---------------------------------------------------------------- 拖文件进窗口
  let dragDepth = 0;
  function hasFiles(e) { return e.dataTransfer && [...e.dataTransfer.types].includes('Files'); }
  function hideDropHint() { dragDepth = 0; $('#dropHint').hidden = true; }
  document.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('#dropHint').hidden = false; });
  document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('dragleave', e => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#dropHint').hidden = true; });
  document.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    hideDropHint();
    handleFiles([...e.dataTransfer.files]);
  });
  function handleFiles(files) {
    const fonts = files.filter(f => FONT_EXT.test(f.name));
    const json = files.find(f => /\.json$/i.test(f.name));
    const img = files.find(f => f.type.startsWith('image/'));
    if (fonts.length) addFontFiles(fonts);
    if (json) openProjectFile(json);
    else if (img) setPhotoFile(img);
    if (!fonts.length && !json && !img) toast('只支持图片、字体（.ttf/.otf）和项目文件（.json）');
  }

  // 点别处时收起字体下拉
  document.addEventListener('click', ev => {
    document.querySelectorAll('.font-pop').forEach(p => { if (!p.parentElement.contains(ev.target)) p.hidden = true; });
  });

  // ---------------------------------------------------------------- 键盘
  document.addEventListener('keydown', e => {
    const t = e.target;
    const typing = t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'button'].includes(t.type)) || t.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (mod && k === 's') { e.preventDefault(); saveProject(); return; }
    if (mod && k === 'e') { e.preventDefault(); exportPNG(); return; }
    if (typing) return;
    if (k === 'escape') { if (!$('#previewModal').hidden) Preview.close(); else select(null); return; }
    if (!selected) return;
    if (k === 'enter' && TEXT_IDS.includes(selected)) { e.preventDefault(); startEdit(selected); return; }
    const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    if (arrows[k] && !state[selected].locked) {
      e.preventDefault();
      const [dx, dy] = arrows[k].map(v => v * (e.shiftKey ? 10 : 1));
      if (selected === 'photo') { state.photo.ox += dx; state.photo.oy += dy; clampPhoto(); }
      else { state[selected].x += dx; state[selected].y += dy; }
      changed(); commitSoon();
    }
  });

  // ---------------------------------------------------------------- 顶部按钮
  function bindTopbar() {
    document.querySelectorAll('#tplSwitch button').forEach(b => b.addEventListener('click', () => setTemplate(b.dataset.tpl)));
    $('#btnUndo').onclick = undo;
    $('#btnRedo').onclick = redo;
    $('#btnPhoto').onclick = () => $('#filePhoto').click();
    $('#btnSign').onclick = () => $('#fileSign').click();
    $('#btnFont').onclick = () => $('#fileFont').click();
    $('#btnSafe').onclick = () => setSafe(!ui.showSafe);
    $('#btnPreview').onclick = () => Preview.open();
    $('#btnOpen').onclick = () => $('#fileProject').click();
    $('#btnSave').onclick = saveProject;
    $('#btnExport').onclick = exportPNG;
    $('#btnNew').onclick = () => {
      if (!confirm('新建一张空白封面？\n当前内容会被清空（可以用 Ctrl+Z 找回）。模板颜色和版式会保留。')) return;
      stopEdit();
      const keep = { template: state.template, layout: state.layout };
      state = defaultState();
      Object.assign(state, keep);
      applyLayout(state, layoutDefaults(state.layout));
      selected = null;
      commit();
      refreshAll();
    };
    const pick = (inp, fn) => inp.addEventListener('change', () => { const fs = [...inp.files]; inp.value = ''; if (fs.length) fn(fs); });
    pick($('#filePhoto'), fs => setPhotoFile(fs[0]));
    pick($('#fileSign'), fs => setSignFile(fs[0]));
    pick($('#fileFont'), fs => addFontFiles(fs));
    pick($('#fileProject'), fs => openProjectFile(fs[0]));

    $('#pvClose').onclick = () => Preview.close();
    $('#previewModal').addEventListener('click', e => { if (e.target.id === 'previewModal') Preview.close(); });
    $('#pvIncludeCurrent').onchange = e => { Preview.includeCurrent = e.target.checked; Preview.refresh(); };
    $('#pvClear').onclick = async () => { if (confirm('清空主页预览里的所有封面？（不会删除已导出的图片文件）')) { await DB.clear('gallery'); Preview.refresh(); } };
    $('#pvAdd').onclick = () => $('#filePreviewAdd').click();
    pick($('#filePreviewAdd'), async fs => {
      for (const f of fs.filter(f => f.type.startsWith('image/'))) {
        const img = await loadImage(await readAsDataURL(f));
        const c = document.createElement('canvas');
        c.width = 621; c.height = 828;
        const cc = c.getContext('2d');
        const s = Math.max(621 / img.naturalWidth, 828 / img.naturalHeight);
        cc.drawImage(img, (621 - img.naturalWidth * s) / 2, (828 - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
        await DB.put('gallery', { id: 'g' + Date.now() + Math.random().toString(36).slice(2, 5), time: Date.now(), title: f.name.replace(/\.[^.]+$/, ''), thumb: c.toDataURL('image/jpeg', 0.88) });
      }
      Preview.refresh();
    });
    $('#pvName').addEventListener('input', () => {
      localStorage.setItem('xhs-cover.nickname', $('#pvName').textContent.trim() || '我的小红书');
      $('#pvAvatar').textContent = $('#pvName').textContent.slice(0, 1);
    });
    $('#pvName').addEventListener('blur', () => Preview.refresh());
  }

  function refreshAll() {
    layersSig = '';
    buildPanel();
    updateUndoButtons();
    scheduleRender();
  }

  // ---------------------------------------------------------------- 启动
  async function boot() {
    bindTopbar();
    buildTemplateColors();
    buildLayoutPick();
    $('#btnSafe').classList.toggle('on', ui.showSafe);
    Fonts.onChange(() => { requestedFonts.clear(); buildPanel(); scheduleRender(); });
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS_STATE) || 'null'); } catch (e) {}
    state = normalize(saved);
    // 模板颜色以"记住的颜色"为准
    state.templateColors = Object.assign(state.templateColors, rememberedColors());
    try { await loadAssetsFor(state); } catch (e) {}
    lastSnap = JSON.stringify(state);
    window.addEventListener('resize', fit);
    new ResizeObserver(fit).observe(stageWrap);
    fit();
    refreshAll();
    await Fonts.init();
    cleanupAssets();
    if (saved) $('#saveInfo').textContent = '已恢复上次的编辑';
  }

  // 给自动测试用的小接口
  window.__cover = { get state() { return state; }, get selected() { return selected; }, undo, redo, exportPNG, renderFull, Fonts, setLayout, select };

  boot();
})();
