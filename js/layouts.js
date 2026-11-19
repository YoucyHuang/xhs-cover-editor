/* 新版式（来自版式概念稿 01–10）。
 * 每个版式 = 现有元素（主标题、副标题、编号、地点/英文、小标签、细线、色块…）的默认位置和样式
 *          + 版式自带的装饰（印章、署名、巨字、圆形取景、雾窗写字）
 *          + 默认色系 pal + 默认背景质感 texture。
 * 文字和照片在版式之间共用；颜色写成 '@light' 这类就会跟着色系变。
 */
(function () {
  const hidden = o => Object.assign(o, { visible: false });
  /** 所有元素先藏起来，每个版式只打开自己要用的 */
  function base() {
    const c = layoutDefaults('classic');
    for (const k of ['block', 'tag', 'title', 'subtitle', 'num', 'chips', 'rule', 'place']) hidden(c[k]);
    c.block = Object.assign(c.block, { color: null, glass: false, blur: 30, opacity: 100, radius: 0, shape: flatShape() });
    c.sign = { x: 942, y: 1430, w: 240, opacity: 100, visible: true, locked: false };
    c.grain = 0; c.photoSoft = false;
    return c;
  }
  const T = o => txt(o);   // 文字元素（可见）
  const shadow = (a = 40) => ({ shadow: true, shadowColor: '@deep', shadowOpacity: a, shadowBlur: 22, shadowX: 0, shadowY: 4 });

  const NEW = {
    vbrush: {
      name: '竖排书法', desc: '行书大字竖排 + 竖排小字 + 印章 + 署名（参考梁州）', pal: 'sage',
      decor: [{ type: 'seal', x: 640, y: 1190, s: 78 }, { type: 'byline', x: 1150, y: 1570, size: 40, color: '@light' }],
      defaults() {
        const c = base();
        c.title = T({ x: 520, y: 130, w: 600, vertical: true, font: 'Zhi Mang Xing', size: 170, weight: 400, lineHeight: 1.2, letterSpacing: 6, color: '@light', ...shadow(45) });
        c.subtitle = T({ x: 90, y: 150, w: 200, vertical: true, font: 'LXGW WenKai', size: 32, weight: 400, lineHeight: 1.7, letterSpacing: 4, color: '@light' });
        c.place = T({ x: 760, y: 1030, w: 360, font: 'Cormorant Garamond', size: 30, weight: 500, lineHeight: 1.2, letterSpacing: 2, color: '@light' });
        c.texture = { type: 'flow', strength: 50, seed: 21 };
        return c;
      },
    },
    quote: {
      name: '金句压顶', desc: '顶部楷书大标题 + 手写副标题，顶部压暗（参考 Olga）', pal: 'clay',
      decor: [{ type: 'shadeTop', h: 640, a: 0.6 }],
      defaults() {
        const c = base();
        c.title = T({ x: 70, y: 80, w: 1100, font: 'Ma Shan Zheng', size: 150, weight: 400, lineHeight: 1.15, letterSpacing: 4, color: '@light', ...shadow(50) });
        c.subtitle = T({ x: 76, y: 470, w: 1000, font: 'Xiaolai', size: 60, weight: 400, lineHeight: 1.4, letterSpacing: 4, color: '@light', ...shadow(45) });
        c.chips = T({ x: 76, y: 1500, font: 'LXGW WenKai', size: 30, weight: 400, lineHeight: 1.2, letterSpacing: 4, color: '@light' });
        c.grain = 30;
        return c;
      },
    },
    talking: {
      name: 'Talking 分割', desc: '上半照片 + 下半磨砂白，英文斜体压在交界（参考 Talking）', pal: 'oat',
      defaults() {
        const c = base();
        c.block = Object.assign(c.block, { x: 0, y: 960, w: W, h: H - 960, visible: true, glass: true, blur: 40, opacity: 85, color: '@light', edge: false });
        c.place = T({ x: 50, y: 860, w: 1170, font: 'Cormorant Garamond', size: 160, weight: 500, italic: true, lineHeight: 1, letterSpacing: 0, color: '@accent' });
        c.title = T({ x: 60, y: 1090, w: 1120, font: 'Xiaolai', size: 112, weight: 400, lineHeight: 1.25, letterSpacing: 4, color: '@deep' });
        c.subtitle = T({ x: 60, y: 1480, w: 1120, font: 'Ma Shan Zheng', size: 62, weight: 400, lineHeight: 1.3, letterSpacing: 6, align: 'center', color: '@accent' });
        c.texture = { type: 'mist', strength: 55, seed: 31 };
        return c;
      },
    },
    glasscard: {
      name: '磨砂玻璃卡', desc: '中间一张半透明磨砂卡片，手写标题', pal: 'grape',
      defaults() {
        const c = base();
        c.block = Object.assign(c.block, { x: 150, y: 470, w: W - 300, h: 760, visible: true, glass: true, blur: 30, opacity: 30, radius: 44, color: '@light' });
        c.num = T({ x: 150, y: 530, w: W - 300, font: 'Bodoni Moda', size: 46, weight: 400, italic: true, lineHeight: 1.2, letterSpacing: 6, align: 'center', color: '@deep' });
        c.title = T({ x: 190, y: 660, w: W - 380, font: 'Xiaolai', size: 120, weight: 400, lineHeight: 1.3, letterSpacing: 4, align: 'center', color: '@deep' });
        c.subtitle = T({ x: 190, y: 1010, w: W - 380, font: 'Xiaolai', size: 56, weight: 400, lineHeight: 1.4, letterSpacing: 4, align: 'center', color: '@accent' });
        c.place = T({ x: 190, y: 1120, w: W - 380, font: 'Cormorant Garamond', size: 30, weight: 500, lineHeight: 1.3, letterSpacing: 6, align: 'center', color: '@deep' });
        c.texture = { type: 'drops', strength: 75, seed: 41 };
        return c;
      },
    },
    fogwrite: {
      name: '雾窗写字', desc: '整张玻璃起雾，主标题像手指写上去的（笔画是透的）', pal: 'mist', fog: true,
      defaults() {
        const c = base();
        c.title = T({ x: 110, y: 540, w: 1040, font: 'Xiaolai', size: 140, weight: 400, lineHeight: 1.25, letterSpacing: 4, color: '@deep' });
        c.place = T({ x: 0, y: 1430, w: W, font: 'Cormorant Garamond', size: 42, weight: 500, italic: true, lineHeight: 1.3, letterSpacing: 1, align: 'center', color: '@deep' });
        c.subtitle = T({ x: 0, y: 1500, w: W, font: 'Long Cang', size: 38, weight: 400, lineHeight: 1.4, letterSpacing: 2, align: 'center', color: '@deep' });
        return c;
      },
    },
    diary: {
      name: '留白日记', desc: '上面米白纸面写手写标题，下面带水雾的照片，交界是波浪', pal: 'rose',
      decor: [{ type: 'seal', x: 1060, y: 110, s: 96 }],
      defaults() {
        const c = base();
        c.block = Object.assign(c.block, { x: 0, y: 0, w: W, h: 760, visible: true, opacity: 100, color: '@light', shape: { top: [0, 0, 0, 0, 0], bot: [0, -50, 20, -20, -10] } });
        c.place = T({ x: 90, y: 110, w: 800, font: 'Long Cang', size: 40, weight: 400, lineHeight: 1.3, letterSpacing: 2, color: '@accent' });
        c.title = T({ x: 90, y: 200, w: 1000, font: 'Xiaolai', size: 136, weight: 400, lineHeight: 1.2, letterSpacing: 4, color: '@deep' });
        c.subtitle = T({ x: 96, y: 560, w: 1000, font: 'Long Cang', size: 54, weight: 400, lineHeight: 1.4, letterSpacing: 2, color: '@accent' });
        c.texture = { type: 'mist', strength: 65, seed: 81 };
        return c;
      },
    },
    circle: {
      name: '圆形取景', desc: '整张磨砂，中间一个清楚的圆窗', pal: 'mauve', circle: { cx: W / 2, cy: 640, r: 400 },
      decor: [{ type: 'rings', color: '@deep' }, { type: 'byline', x: W / 2, y: 1570, size: 38, color: '@deep', align: 'center' }],
      defaults() {
        const c = base();
        c.title = T({ x: 60, y: 1120, w: W - 120, font: 'Ma Shan Zheng', size: 110, weight: 400, lineHeight: 1.2, letterSpacing: 6, align: 'center', color: '@deep' });
        c.place = T({ x: 60, y: 1420, w: W - 120, font: 'Cormorant Garamond', size: 30, weight: 500, lineHeight: 1.3, letterSpacing: 5, align: 'center', color: '@deep' });
        c.texture = { type: 'frost', strength: 85, seed: 91 };
        return c;
      },
    },
    vstrip: {
      name: '竖条分栏', desc: '左边半透明深色磨砂竖条 + 竖排标题 + 大编号', pal: 'clay',
      decor: [{ type: 'seal', x: 300, y: 1380, s: 80, color: '@accent' }],
      defaults() {
        const c = base();
        c.block = Object.assign(c.block, { x: 0, y: 0, w: 430, h: H, visible: true, glass: true, blur: 36, opacity: 50, color: '@deep', edge: false });
        c.title = T({ x: 60, y: 110, w: 330, vertical: true, font: 'Ma Shan Zheng', size: 150, weight: 400, lineHeight: 1.25, letterSpacing: 6, color: '@light' });
        c.num = T({ x: 640, y: 1240, w: 540, font: 'Bodoni Moda', size: 360, weight: 400, italic: true, lineHeight: 1, letterSpacing: -6, align: 'right', color: '@light' });
        c.place = T({ x: 470, y: 1560, w: 700, font: 'Cormorant Garamond', size: 28, weight: 500, lineHeight: 1.3, letterSpacing: 4, align: 'right', color: '@light' });
        c.texture = { type: 'drops', strength: 45, seed: 101 };
        return c;
      },
    },
    giant: {
      name: '巨字半透明', desc: '一个超大的半透明字垫在画面里，罩雨丝', pal: 'mint',
      decor: [{ type: 'giant', x: W / 2, y: 1280, size: 1300, alpha: 0.32, font: 'Ma Shan Zheng', color: '@light' }],
      defaults() {
        const c = base();
        c.title = T({ x: 90, y: 1180, w: 1060, font: 'Ma Shan Zheng', size: 96, weight: 400, lineHeight: 1.25, letterSpacing: 4, color: '@light', ...shadow(40) });
        c.rule = { x: 94, y: 1430, w: 70, thick: 3, color: '@light', visible: true, locked: false };
        c.subtitle = T({ x: 94, y: 1460, w: 1000, font: 'LXGW WenKai', size: 38, weight: 400, lineHeight: 1.5, letterSpacing: 3, color: '@light' });
        c.texture = { type: 'rain', strength: 80, seed: 61 };
        return c;
      },
    },
    band: {
      name: '斜向色带', desc: '一条斜的半透明磨砂色带横过画面，标题写在色带上', pal: 'orange',
      defaults() {
        const c = base();
        const sl = [90, 68, 45, 22, 0];
        c.block = Object.assign(c.block, { x: 0, y: 960, w: W, h: 400, visible: true, glass: true, blur: 26, opacity: 55, color: '@mid', shape: { top: sl.slice(), bot: sl.slice() } });
        c.title = T({ x: 110, y: 1070, w: 1040, font: 'Ma Shan Zheng', size: 130, weight: 400, lineHeight: 1.2, letterSpacing: 4, color: '@deep' });
        c.subtitle = T({ x: 80, y: 120, w: 1000, font: 'Xiaolai', size: 64, weight: 400, lineHeight: 1.4, letterSpacing: 4, color: '@light', ...shadow(45) });
        c.chips = T({ x: 80, y: 1540, font: 'LXGW WenKai', size: 28, weight: 400, lineHeight: 1.2, letterSpacing: 4, color: '@light' });
        return c;
      },
    },
  };
  for (const [id, L] of Object.entries(NEW)) LAYOUTS[id] = L;
})();
