/* 背景质感层：雨痕（水雾 / 水珠 / 流痕 / 雨丝）、磨砂、纯模糊
 * 都是在背景照片上“罩一层”。水珠会像真水珠一样折射背后的画面（倒影 + 暗边 + 底部亮弧）。
 * 以后直接搬进封面生成器的 render.js 用。
 */
const Texture = (() => {
  function rng(seed) {
    let a = seed | 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function copyOf(src) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }
  function blurred(src, px, extra = '') {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.filter = `blur(${px}px) ${extra}`;
    // 四周多画一圈，避免模糊后边缘发白
    g.drawImage(src, -px * 2, -px * 2, src.width + px * 4, src.height + px * 4);
    return c;
  }

  /** 单颗水珠：用背景折射出的倒影填充，再加暗边、底部亮弧、左上高光 */
  function drop(ctx, bg, x, y, r, stretch, light) {
    const rx = r, ry = r * stretch;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.save();
    ctx.clip();
    // 折射：取水珠周围放大的一块，上下颠倒画进去
    const k = 3.2;
    ctx.translate(x, y);
    ctx.scale(1, -1);
    ctx.drawImage(bg, x - rx * k, y - ry * k, rx * 2 * k, ry * 2 * k, -rx, -ry, rx * 2, ry * 2);
    ctx.restore();
    // 暗边
    const g = ctx.createRadialGradient(x - rx * 0.15, y - ry * 0.2, Math.min(rx, ry) * 0.2, x, y, Math.max(rx, ry));
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.72, 'rgba(0,0,0,0.04)');
    g.addColorStop(1, `rgba(0,0,0,${0.5 * light})`);
    ctx.fillStyle = g;
    ctx.fill();
    // 底部亮弧（光从水珠里透出来）
    ctx.strokeStyle = `rgba(255,255,255,${0.85 * light})`;
    ctx.lineWidth = Math.max(0.8, r * 0.13);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.78, ry * 0.8, 0, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
    // 左上高光
    if (r > 2.5) {
      ctx.fillStyle = `rgba(255,255,255,${0.95 * light})`;
      ctx.beginPath();
      ctx.ellipse(x - rx * 0.38, y - ry * 0.42, rx * 0.16, ry * 0.11, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drops(ctx, bg, n, rmin, rmax, seed, opt = {}) {
    const R = rng(seed);
    const list = [];
    for (let i = 0; i < n; i++) {
      const t = Math.pow(R(), opt.bias ?? 2.2);
      list.push({ x: R() * ctx.canvas.width, y: R() * ctx.canvas.height, r: rmin + (rmax - rmin) * t, s: 1 + R() * (opt.stretch ?? 0.25) });
    }
    list.sort((a, b) => a.r - b.r);
    for (const d of list) drop(ctx, bg, d.x, d.y, d.r, d.s, opt.light ?? 1);
  }

  /** 流痕：水珠往下流时留下的弯曲水路 */
  function streaks(ctx, bg, n, seed, opt = {}) {
    const R = rng(seed);
    const W = ctx.canvas.width, H = ctx.canvas.height;
    for (let i = 0; i < n; i++) {
      let x = R() * W, y = R() * H * 0.6;
      const len = H * (0.15 + R() * 0.6), w = 3 + R() * (opt.width ?? 9);
      const pts = [[x, y]];
      let dx = 0;
      for (let s = 0; s < len; s += 12) {
        dx += (R() - 0.5) * 3.2; dx *= 0.82;
        x += dx; y += 12;
        pts.push([x, y]);
      }
      const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]); };
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // 水路里看到的是“擦干净”的背景：用清晰背景描一遍
      path(); ctx.lineWidth = w; ctx.strokeStyle = ctx.createPattern(bg, 'no-repeat'); ctx.stroke();
      path(); ctx.lineWidth = w; ctx.strokeStyle = 'rgba(0,0,0,0.24)'; ctx.stroke();
      ctx.translate(w * 0.18, 0);
      path(); ctx.lineWidth = w * 0.35; ctx.strokeStyle = 'rgba(255,255,255,0.62)'; ctx.stroke();
      ctx.restore();
      const last = pts[pts.length - 1];
      drop(ctx, bg, last[0], last[1], w * 0.95, 1.35, 1);
    }
  }

  function rainLines(ctx, n, seed, alpha = 0.18) {
    const R = rng(seed);
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.save();
    ctx.filter = 'blur(1.2px)';
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = R() * W, y = R() * H, l = 60 + R() * 260;
      ctx.strokeStyle = `rgba(255,255,255,${alpha * (0.4 + R() * 0.6)})`;
      ctx.lineWidth = 1 + R() * 2.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - l * 0.06, y + l); ctx.stroke();
    }
    ctx.restore();
  }

  function grain(ctx, amount, seed = 3) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const t = document.createElement('canvas');
    t.width = t.height = 256;
    const g = t.getContext('2d'), img = g.createImageData(256, 256), R = rng(seed);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (R() + R() - 1) * 160; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = amount;
    ctx.fillStyle = ctx.createPattern(t, 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /**
   * 把质感罩在 ctx 当前画面上。type:
   *   none | mist 细密水雾 | drops 大颗水珠 | flow 流痕 | rain 雨丝 | frost 磨砂 | blur 纯模糊
   * strength 0..1
   */
  function apply(ctx, type, strength = 1, seed = 11) {
    if (!type || type === 'none') return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const sharp = copyOf(ctx.canvas);
    if (type === 'blur') {
      ctx.drawImage(blurred(sharp, 4 + 26 * strength), 0, 0);
      return;
    }
    if (type === 'frost') {
      ctx.drawImage(blurred(sharp, 10 + 22 * strength, 'saturate(0.85)'), 0, 0);
      ctx.fillStyle = `rgba(255,255,255,${0.10 + 0.14 * strength})`;
      ctx.fillRect(0, 0, W, H);
      grain(ctx, 0.35 + 0.3 * strength);
      return;
    }
    // 雨痕类：玻璃先起一层雾（轻微模糊），水珠里折射的是清晰的背景
    const fog = blurred(sharp, type === 'rain' ? 3 : 7 * strength, 'brightness(1.04) saturate(0.9)');
    ctx.drawImage(fog, 0, 0);
    ctx.fillStyle = `rgba(235,240,240,${0.06 * strength})`;
    ctx.fillRect(0, 0, W, H);
    const area = (W * H) / (1242 * 1656);
    if (type === 'mist') {
      drops(ctx, sharp, Math.round(4200 * strength * area), 1.6, 7.5, seed, { bias: 2.4, light: 1 });
      drops(ctx, sharp, Math.round(220 * strength * area), 7, 18, seed + 1, { light: 1 });
    } else if (type === 'drops') {
      drops(ctx, sharp, Math.round(900 * strength * area), 1.5, 5, seed, { light: 0.9 });
      drops(ctx, sharp, Math.round(130 * strength * area), 10, 40, seed + 1, { stretch: 0.45, bias: 1.8 });
    } else if (type === 'flow') {
      drops(ctx, sharp, Math.round(2200 * strength * area), 1.6, 7, seed, { bias: 2.4, light: 1 });
      streaks(ctx, sharp, Math.round(18 * strength * area) + 2, seed + 2, { width: 12 });
      drops(ctx, sharp, Math.round(60 * strength * area), 8, 20, seed + 3, { stretch: 0.5 });
    } else if (type === 'rain') {
      rainLines(ctx, Math.round(520 * strength * area), seed, 0.36);
      drops(ctx, sharp, Math.round(500 * strength * area), 1, 3.5, seed + 4, { light: 0.7 });
    }
  }

  return { apply, blurred, copyOf, grain, rng };
})();
