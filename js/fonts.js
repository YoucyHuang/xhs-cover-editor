/* 字体管理：内置字体状态检测 + 上传字体 */
const FONT_DEFS = [
  { family: 'Noto Serif SC', name: '思源宋体', weights: [400, 700, 900] },
  { family: 'Noto Sans SC', name: '思源黑体', weights: [300, 400, 500, 700, 900] },
  { family: 'Smiley Sans', name: '得意黑', weights: [400] },
  { family: 'LXGW WenKai', name: '霞鹜文楷', weights: [400] },
  { family: 'ZCOOL KuaiLe', name: '站酷快乐体', weights: [400] },
  { family: 'Alibaba PuHuiTi', name: '阿里巴巴普惠体', weights: [400, 500, 700, 800] },
  // 英文字体（遇到中文会自动用思源黑体补上）
  { family: 'Bodoni Moda', name: 'Bodoni Moda', note: '英文·杂志', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Cormorant Garamond', name: 'Cormorant', note: '英文·优雅', weights: [300, 400, 500, 600, 700] },
  { family: 'Playfair Display', name: 'Playfair', note: '英文·标题', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Inter', name: 'Inter', note: '英文·无衬线', weights: [300, 400, 500, 600, 700, 900] },
  { family: 'DM Mono', name: 'DM Mono', note: '英文·等宽', weights: [400, 500] },
  { family: 'Caveat', name: 'Caveat', note: '英文·手写', weights: [400, 500, 600, 700] },
];

const WEIGHT_NAMES = {
  100: '极细 100', 200: '特细 200', 300: '细体 300', 400: '常规 400', 500: '中等 500',
  600: '半粗 600', 700: '粗体 700', 800: '特粗 800', 900: 'Heavy / Black 900',
};

const FONT_EXT = /\.(ttf|otf|woff2?)$/i;

const Fonts = {
  status: {},   // family -> 'checking' | 'ok' | 'missing'
  custom: [],   // 上传的字体 { id, family, name }
  listeners: [],

  onChange(fn) { this.listeners.push(fn); },
  _emit() { this.listeners.forEach(fn => fn()); },

  all() {
    return [
      ...FONT_DEFS.map(f => ({ ...f, builtin: true, status: this.status[f.family] || 'checking' })),
      ...this.custom.map(f => ({ ...f, builtin: false, weights: [400], status: 'ok' })),
    ];
  },
  def(family) { return this.all().find(f => f.family === family); },
  displayName(family) { const d = this.def(family); return d ? d.name : family; },

  /** 该字体可选的字重：真实字重 + 单字重字体额外给一个"模拟加粗" */
  weightOptions(family) {
    const d = this.def(family);
    const real = d ? d.weights : [400];
    const opts = real.map(w => ({ value: w, label: WEIGHT_NAMES[w] }));
    if (real.length === 1) opts.push({ value: 700, label: '粗体 700（模拟加粗）' });
    return opts;
  },

  faces(family) {
    return [...document.fonts].filter(f => f.family.replace(/^["']|["']$/g, '') === family);
  },
  /** 按 CSS 规则挑出最接近的字重（支持可变字重和斜体） */
  faceFor(family, weight, italic) {
    let faces = this.faces(family);
    if (!faces.length) return null;
    const styled = faces.filter(f => (f.style === 'italic' || f.style === 'oblique') === !!italic);
    if (styled.length) faces = styled;
    const w = f => {
      const s = String(f.weight);
      if (s === 'normal') return 400;
      if (s === 'bold') return 700;
      const [a, b] = s.split(/\s+/).map(Number);
      if (b && weight >= a && weight <= b) return weight;
      return a || 400;
    };
    return faces.slice().sort((a, b) => Math.abs(w(a) - weight) - Math.abs(w(b) - weight))[0];
  },

  async init() {
    try {
      const saved = await DB.getAll('fonts');
      for (const f of saved) await this._install(f);
    } catch (e) { console.warn('读取上传字体失败', e); }
    this.checkBuiltins();
  },

  async checkBuiltins() {
    await Promise.all(FONT_DEFS.map(async d => {
      this.status[d.family] = 'checking';
      const face = this.faceFor(d.family, 400);
      let ok = false;
      if (face) { try { await face.load(); ok = face.status === 'loaded'; } catch (e) { ok = false; } }
      this.status[d.family] = ok ? 'ok' : 'missing';
    }));
    this._emit();
  },

  /** 确保某字体某字重已加载（给 canvas 用） */
  async ensure(family, weight, italic) {
    const face = this.faceFor(family, weight, italic);
    if (!face) return false;
    try { await face.load(); return true; } catch (e) { return false; }
  },

  async _install(rec) {
    const buf = await (await fetch(rec.dataURL)).arrayBuffer();
    const face = new FontFace(rec.family, buf);
    await face.load();
    document.fonts.add(face);
    if (!this.custom.find(c => c.id === rec.id)) this.custom.push({ id: rec.id, family: rec.family, name: rec.name });
  },

  /** 上传字体文件 → 装进浏览器并存到本地数据库 */
  async addFile(file) {
    let name = file.name.replace(FONT_EXT, '');
    let family = name;
    if (FONT_DEFS.some(d => d.family === family || d.name === family)) family = name + '（上传）';
    const existing = this.custom.find(c => c.family === family);
    const dataURL = await readAsDataURL(file);
    const rec = { id: existing ? existing.id : 'f' + Date.now() + Math.random().toString(36).slice(2, 6), family, name: family, dataURL };
    await this._install(rec);
    await DB.put('fonts', rec);
    this._emit();
    return family;
  },

  async removeCustom(id) {
    const c = this.custom.find(x => x.id === id);
    if (!c) return;
    this.faces(c.family).forEach(f => document.fonts.delete(f));
    this.custom = this.custom.filter(x => x.id !== id);
    await DB.del('fonts', id);
    this._emit();
  },

  async getCustomRecord(family) {
    const c = this.custom.find(x => x.family === family);
    return c ? DB.get('fonts', c.id) : null;
  },
  async installRecord(rec) {
    if (this.custom.find(c => c.family === rec.family)) return;
    await this._install(rec);
    await DB.put('fonts', rec);
    this._emit();
  },
};

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
