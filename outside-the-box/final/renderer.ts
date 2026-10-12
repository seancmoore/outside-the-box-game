import { GameContext } from "./types";
import { getTheme } from "./theme";
import { getLayout } from "./layout";
import { LEVEL_DATA } from "./levelData";

// ── Institute identity ────────────────────────────────────────────────────────
export const INSTITUTE = "Institute of Lateral Cognition";

// Responsive type scale: keeps text legible on large displays instead of pinning
// it to fixed pixels that look tiny on a big canvas.
export const uiScale = (ctx: CanvasRenderingContext2D) => {
  const s = Math.min(ctx.canvas.width / 1280, ctx.canvas.height / 800);
  return Math.max(0.9, Math.min(s, 1.7));
};

// ── Low-level drawing helpers ─────────────────────────────────────────────────

// Rounded-rect path (ctx.roundRect isn't guaranteed on every canvas build).
export const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) => {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
};

// Run a draw callback with canvas letter-spacing applied, then restore it.
const withTracking = (ctx: CanvasRenderingContext2D, px: number, fn: () => void) => {
  const c = ctx as unknown as { letterSpacing?: string };
  const prev = c.letterSpacing;
  try { c.letterSpacing = `${px}px`; } catch { /* unsupported — ignore */ }
  try { fn(); } finally { try { c.letterSpacing = prev ?? "0px"; } catch { /* ignore */ } }
};

// Small inward L-ticks at each corner — the "crop mark" detail of an official form.
const drawCornerTicks = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, len: number, color: string, inset = 11,
) => {
  const d = inset;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const corners: Array<[number, number, number, number]> = [
    [x + d,     y + d,     1,  1],
    [x + w - d, y + d,    -1,  1],
    [x + d,     y + h - d, 1, -1],
    [x + w - d, y + h - d, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * len, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * len);
    ctx.stroke();
  }
};

// Text set along a circular arc — used for the seal's ring lettering.
const drawRingText = (
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, radius: number,
  text: string, color: string, font: string, fontPx: number,
  centerAngle: number, flip: boolean,
) => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${Math.round(fontPx)}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const dir = flip ? -1 : 1;
  const widths = Array.from(text, (ch) => ctx.measureText(ch).width + 1.5);
  const totalW = widths.reduce((a, b) => a + b, 0);
  let a = centerAngle - (totalW / radius) / 2 * dir;
  for (let i = 0; i < text.length; i++) {
    const wch = widths[i];
    const ang = a + (wch / radius) / 2 * dir;
    ctx.save();
    ctx.translate(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius);
    ctx.rotate(ang + (flip ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
    a += (wch / radius) * dir;
  }
  ctx.restore();
};

// Moving foil highlight clipped to a circle — gives gold a live, reflective sheen.
const foilSweep = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, speed = 0.45) => {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const tnow = performance.now() / 1000;
  const sweep = ((tnow * speed) % 1.6) - 0.3;
  const gx = cx + (sweep - 0.5) * 2 * r;
  const grad = ctx.createLinearGradient(gx - r * 0.5, cy - r, gx + r * 0.5, cy + r);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.5, "rgba(255,250,228,0.42)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
};

// ── Brand primitives (reused across screens, overlays and levels) ─────────────

// The official wordmark lockup: eyebrow / serif title / tracked subtitle.
export const drawWordmark = (gc: GameContext, cx: number, y: number, scale = 1) => {
  const { ctx, state, displayFont, monoFont } = gc;
  const t = getTheme(state);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = t.accent;
  ctx.font = `${Math.round(12 * scale)}px ${monoFont}`;
  withTracking(ctx, 2 * scale, () =>
    ctx.fillText("INSTITUTE OF LATERAL COGNITION", cx, y));

  ctx.fillStyle = t.ink;
  ctx.font = `${Math.round(50 * scale)}px ${displayFont}`;
  ctx.fillText("Outside-the-Box", cx, y + Math.round(46 * scale));

  const subY = y + Math.round(68 * scale);
  ctx.fillStyle = t.fgMid;
  ctx.font = `${Math.round(11 * scale)}px ${monoFont}`;
  const sub = "THINKING  CERTIFICATION";
  const subW = ctx.measureText(sub).width;
  withTracking(ctx, 2.5 * scale, () => ctx.fillText(sub, cx, subY));

  const half = Math.max(60 * scale, subW * 0.62);
  ctx.strokeStyle = t.hairline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - half - 30 * scale, subY - 4 * scale);
  ctx.lineTo(cx - half, subY - 4 * scale);
  ctx.moveTo(cx + half, subY - 4 * scale);
  ctx.lineTo(cx + half + 30 * scale, subY - 4 * scale);
  ctx.stroke();
  ctx.fillStyle = t.seal;
  for (const dx of [-half - 36 * scale, half + 36 * scale]) {
    ctx.save();
    ctx.translate(cx + dx, subY - 4 * scale);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-2 * scale, -2 * scale, 4 * scale, 4 * scale);
    ctx.restore();
  }
};

// A pressed-wax / foil seal: concentric gold rings, ring lettering, a monogram,
// with a live foil sheen sweeping across it.
export const drawSeal = (
  gc: GameContext, cx: number, cy: number, r: number,
  opts: { monogram?: string; color?: string } = {},
) => {
  const { ctx, state, displayFont, monoFont } = gc;
  const t = getTheme(state);
  const gold = opts.color ?? t.seal;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = state.darkMode ? "rgba(212,176,90,0.12)" : "rgba(176,137,47,0.10)";
  ctx.fill();

  // scalloped outer edge
  const scallops = 32;
  ctx.beginPath();
  for (let i = 0; i <= scallops; i++) {
    const ang = (i / scallops) * Math.PI * 2;
    const rad = r * (1 + (i % 2 === 0 ? 0.045 : 0));
    const px = cx + Math.cos(ang) * rad;
    const py = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = gold;
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.stroke();

  ctx.strokeStyle = gold;
  ctx.lineWidth = Math.max(1.5, r * 0.05);
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(1, r * 0.02);
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.stroke();

  drawRingText(ctx, cx, cy, r * 0.73,
    "INSTITUTE OF LATERAL COGNITION", gold, monoFont, r * 0.13, -Math.PI / 2, false);
  drawRingText(ctx, cx, cy, r * 0.73,
    "OUTSIDE THE BOX", gold, monoFont, r * 0.13, Math.PI / 2, true);

  ctx.fillStyle = gold;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(r * 0.16)}px ${monoFont}`;
  ctx.fillText("✦", cx - r * 0.73, cy);
  ctx.fillText("✦", cx + r * 0.73, cy);

  ctx.fillStyle = gold;
  ctx.font = `${Math.round(r * 0.46)}px ${displayFont}`;
  ctx.fillText(opts.monogram ?? "OtB", cx, cy + r * 0.03);
  ctx.restore();

  foilSweep(ctx, cx, cy, r);
};

// A pseudo-3D medallion that spins about its vertical axis (a turning gold coin).
export const drawMedallion = (
  gc: GameContext, cx: number, cy: number, r: number,
  opts: { spin?: number } = {},
) => {
  const { ctx, state, displayFont, monoFont } = gc;
  const t = getTheme(state);
  const gold = t.seal;
  const ang = (performance.now() / 1000) * (opts.spin ?? 0.9);
  const c = Math.cos(ang);
  const halfW = Math.max(0.07, Math.abs(c)) * r;
  const front = c >= 0;

  ctx.save();
  ctx.shadowColor = state.darkMode ? "rgba(0,0,0,0.45)" : "rgba(60,45,20,0.35)";
  ctx.shadowBlur = r * 0.4;
  ctx.shadowOffsetY = r * 0.12;
  const grad = ctx.createLinearGradient(cx - halfW, cy - r, cx + halfW, cy + r);
  grad.addColorStop(0, "#7d5f1f");
  grad.addColorStop(0.5, gold);
  grad.addColorStop(1, "#ecd591");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, halfW, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "#6e5418";
  ctx.lineWidth = Math.max(1, r * 0.045);
  ctx.beginPath(); ctx.ellipse(cx, cy, halfW, r, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(1, r * 0.02);
  ctx.beginPath(); ctx.ellipse(cx, cy, halfW * 0.82, r * 0.82, 0, 0, Math.PI * 2); ctx.stroke();

  // emblem, squashed with the spin
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(Math.max(0.07, Math.abs(c)), 1);
  ctx.fillStyle = "#5a4410";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (front) {
    ctx.font = `${Math.round(r * 0.66)}px ${displayFont}`;
    ctx.fillText("OtB", 0, r * 0.04);
  } else {
    ctx.font = `${Math.round(r * 0.9)}px ${monoFont}`;
    ctx.fillText("✦", 0, r * 0.04);
  }
  ctx.restore();

  // foil sheen across the (squashed) face
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, halfW, r, 0, 0, Math.PI * 2);
  ctx.clip();
  const tnow = performance.now() / 1000;
  const sweep = ((tnow * 0.6) % 1.6) - 0.3;
  const gx = cx + (sweep - 0.5) * 2 * r;
  const sh = ctx.createLinearGradient(gx - r * 0.5, cy - r, gx + r * 0.5, cy + r);
  sh.addColorStop(0, "rgba(255,255,255,0)");
  sh.addColorStop(0.5, "rgba(255,251,232,0.55)");
  sh.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
};

// A rotated rubber-stamp impression: double border + tracked mono text.
export const drawStamp = (
  gc: GameContext, cx: number, cy: number, text: string, color: string,
  opts: { angle?: number; fontPx?: number; alpha?: number } = {},
) => {
  const { ctx, monoFont } = gc;
  const fontPx = (opts.fontPx ?? 30) * uiScale(ctx);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((opts.angle ?? -9) * Math.PI / 180);
  ctx.globalAlpha = opts.alpha ?? 0.92;
  ctx.font = `bold ${fontPx}px ${monoFont}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let textW = 0;
  withTracking(ctx, fontPx * 0.1, () => { textW = ctx.measureText(text).width; });
  const padX = fontPx * 0.7;
  const padY = fontPx * 0.5;
  const bw = textW + padX * 2;
  const bh = fontPx + padY * 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, fontPx * 0.1);
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, fontPx * 0.18); ctx.stroke();
  ctx.lineWidth = Math.max(1, fontPx * 0.04);
  roundRect(ctx, -bw / 2 + fontPx * 0.16, -bh / 2 + fontPx * 0.16, bw - fontPx * 0.32, bh - fontPx * 0.32, fontPx * 0.12);
  ctx.stroke();
  ctx.fillStyle = color;
  withTracking(ctx, fontPx * 0.1, () => ctx.fillText(text, 0, fontPx * 0.04));
  ctx.restore();
};

// ── Transient "stamp slam" feedback (CORRECT / INCORRECT) ─────────────────────

export const triggerStamp = (gc: GameContext, text: string, color: string) => {
  gc.state.fxStampText = text;
  gc.state.fxStampColor = color;
  gc.state.fxStampAt = performance.now();
};

// Draws the active feedback stamp slamming down over the play area, then fading.
export const drawFxStamp = (gc: GameContext) => {
  const { ctx, state } = gc;
  if (state.currentScreen !== "level" || !state.fxStampAt) return;
  const age = performance.now() - state.fxStampAt;
  const dur = 850;
  if (age < 0 || age > dur) return;

  const { topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const cx = topBoxX + topBoxWidth / 2;
  const cy = topBoxY + topBoxHeight / 2;

  const inP = Math.min(1, age / 150);
  const scale = 1.7 - 0.7 * (1 - Math.pow(1 - inP, 3));   // 1.7 → 1.0 slam-in
  const alpha = age > dur - 260 ? Math.max(0, (dur - age) / 260) : 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  drawStamp(gc, cx, cy, state.fxStampText ?? "", state.fxStampColor ?? "#9A2B25",
    { fontPx: 42, angle: -10, alpha: 1 });
  ctx.restore();
};

// A reusable framed "document" panel: paper fill, drop shadow, double rule,
// corner ticks, and an optional title cartouche set into the top rule.
export const drawDocumentBox = (
  gc: GameContext, x: number, y: number, w: number, h: number,
  opts: { title?: string; radius?: number; fillAlpha?: number } = {},
) => {
  const { ctx, state, monoFont } = gc;
  const t = getTheme(state);
  const r = opts.radius ?? 6;
  const s = uiScale(ctx);

  ctx.save();
  ctx.shadowColor = state.darkMode ? "rgba(0,0,0,0.55)" : "rgba(60,45,20,0.22)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 8;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = t.panel;
  // Lets a caller (Q22's pause-through trick) make the paper go see-through
  // while keeping the frame/ticks/title at full strength below.
  ctx.globalAlpha = opts.fillAlpha ?? 1;
  ctx.fill();
  ctx.restore();

  // A title needs an actual gap in BOTH border strokes, not a patch painted
  // over them afterward — erasing after the fact left the inner hairline
  // visibly crossing straight through the label (a symmetric erase strip
  // wasn't tall enough, and widening it fought with clip/paint-order issues
  // instead of just fixing it). Clipping the gap out before either stroke is
  // drawn guarantees a real, permanent gap regardless of font metrics.
  let titlePx = 0, label = "", cw = 0;
  if (opts.title) {
    titlePx = Math.round(13 * s);
    ctx.font = `bold ${titlePx}px ${monoFont}`;
    label = opts.title.toUpperCase();
    cw = ctx.measureText(label).width + 28;
  }

  ctx.save();
  if (opts.title) {
    const gapX0 = x + w / 2 - cw / 2, gapX1 = x + w / 2 + cw / 2;
    const gapY0 = y - titlePx * 1.1, gapY1 = y + 12;
    // ctx.clip("evenodd") (current-path + string fillRule overload) does not
    // reliably apply the fill rule on every canvas build — an explicit Path2D
    // with the fillRule as its own argument does.
    const gapPath = new Path2D();
    gapPath.rect(x - 20, y - 20, w + 40, h + 40);
    gapPath.rect(gapX0, gapY0, gapX1 - gapX0, gapY1 - gapY0);
    ctx.clip(gapPath, "evenodd");
  }
  ctx.strokeStyle = t.stroke;
  ctx.lineWidth = 2.5;
  roundRect(ctx, x, y, w, h, r); ctx.stroke();
  ctx.strokeStyle = t.hairline;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 6, y + 6, w - 12, h - 12, Math.max(0, r - 3)); ctx.stroke();
  ctx.restore();

  drawCornerTicks(ctx, x, y, w, h, 12, t.accent);

  if (opts.title) {
    ctx.font = `bold ${titlePx}px ${monoFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = t.accent;
    withTracking(ctx, 1.8, () => ctx.fillText(label, x + w / 2, y));
  }
};

// ── Layout-coupled helpers (unchanged geometry) ───────────────────────────────

export const isSkippable = (currentLevel: number): boolean => {
  const entry = LEVEL_DATA[currentLevel - 1];
  return entry ? entry.skippable !== false : true;
};

// Responsive metrics for the Exam Guide speech text in the bottom panel.
// IMPORTANT: levels that hit-test against the rendered guide text (e.g. Level 3's
// dot on the 'i' in "Click") rely on these exact values — do not change the math.
export const getGuideTextMetrics = (ctx: CanvasRenderingContext2D) => {
  const { frameX, frameW, bottomBoxY, bottomBoxHeight } = getLayout(ctx);
  const contentX = frameX;
  const contentWidth = frameW;
  const divX = contentX + contentWidth * 0.155;
  const speechX = divX + contentWidth * 0.025;
  const speechW = contentX + contentWidth - speechX - contentWidth * 0.02;
  const panelCY = bottomBoxY + bottomBoxHeight / 2;
  const fontPx = Math.max(13, Math.min(18, Math.round(bottomBoxHeight * 0.11)));
  const lineGap = Math.round(fontPx * 1.5);
  return { speechX, speechW, panelCY, fontPx, lineGap, bottomBoxY, bottomBoxHeight };
};

// ── Screens chrome ────────────────────────────────────────────────────────────

// Full-screen loading screen: paper, wordmark, a spinning gold medallion, progress.
export const drawLoadingScreen = (gc: GameContext) => {
  const { ctx, state, monoFont } = gc;
  const t = getTheme(state);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const s = uiScale(ctx);
  const now = Date.now();

  drawWordmark(gc, cx, cy - h * 0.24, Math.min(1.3, s));

  drawMedallion(gc, cx, cy + h * 0.01, Math.max(26, Math.min(w, h) * 0.06));

  ctx.fillStyle = t.fgDim;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(13 * s)}px ${monoFont}`;
  withTracking(ctx, 1.5, () =>
    ctx.fillText("PREPARING EXAMINATION" + ".".repeat(1 + (Math.floor(now / 350) % 3)),
      cx, cy + h * 0.16));

  const barW = Math.min(w * 0.26, 340);
  const barH = 5;
  const barX = cx - barW / 2;
  const barY = cy + h * 0.21;
  ctx.fillStyle = t.hairline;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = t.seal;
  ctx.fillRect(barX, barY, barW * Math.max(0.04, Math.min(1, gc.assetProgress)), barH);
};

export const drawBackground = (gc: GameContext) => {
  const { ctx, state } = gc;
  const t = getTheme(state);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  document.body.style.background = t.bg;
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, w, h);

  // soft vignette so the paper reads as a lit document on a desk
  const g = ctx.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.18, w / 2, h * 0.5, Math.max(w, h) * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, state.darkMode ? "rgba(0,0,0,0.45)" : "rgba(92,70,38,0.10)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // faint drifting dust motes for ambient life
  const tnow = performance.now() / 1000;
  ctx.fillStyle = state.darkMode ? "rgba(212,176,90,0.05)" : "rgba(120,95,40,0.05)";
  for (let i = 0; i < 16; i++) {
    const fx = (i * 0.61803) % 1;
    const fy = (i * 0.31831 + tnow * 0.012 * ((i % 3) + 1)) % 1;
    const rr = 1 + (i % 3);
    ctx.beginPath();
    ctx.arc(fx * w, (1 - fy) * h, rr, 0, Math.PI * 2);
    ctx.fill();
  }
};

// The sticker logo (public/assets/Logo.png), centred above the paper the way the
// locked mocks place it: top 1.5% of the canvas, ~15% of the height tall, a soft
// drop shadow. Falls back to the typed wordmark until the image is available.
export const drawLogo = (gc: GameContext) => {
  const { ctx } = gc;
  const { w, h, logoY, paperX, paperW } = getLayout(ctx);
  if (!gc.logoLoaded || !gc.logo.naturalWidth) {
    drawWordmark(gc, w / 2, logoY - 16, Math.min(1.5, uiScale(ctx)));
    return;
  }
  const size = Math.round(h * 0.151);
  const x = Math.round(w / 2 - size / 2);
  const y = Math.round(h * 0.015);
  ctx.save();
  ctx.shadowColor = "rgba(60,45,20,0.25)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.drawImage(gc.logo, x, y, size, size);
  ctx.restore();
  gc.chrome.logo = { x, y, w: size, h: size };
  // the lightbulb sits at ~58% across, ~18% down the square image
  gc.chrome.bulb = { x: x + size * 0.48, y: y + size * 0.05, w: size * 0.22, h: size * 0.27 };
  void paperX; void paperW;
};

// The play-area "examination paper": raised sheet, double rule, corner ticks,
// a header band on level screens, and a caption set into the top rule.
export const drawGameplayFrame = (gc: GameContext) => {
  const { ctx, state, monoFont } = gc;
  const { paperX, paperY, paperW, paperH, headerH, topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const t = getTheme(state);
  const s = uiScale(ctx);
  const x = paperX, y = paperY, w = paperW, h = paperH;

  ctx.save();
  ctx.shadowColor = state.darkMode ? "rgba(0,0,0,0.5)" : "rgba(60,45,20,0.18)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = t.panel;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  const caption = state.paperCaption ??
    (state.currentScreen === "mainmenu"    ? "·  OFFICIAL EXAMINATION  ·" :
     state.currentScreen === "levelselect" ? "·  TABLE OF CONTENTS  ·" :
                                             "·  EXAMINATION PAPER  ·");
  // Bumped up from 10px/fgDim — at that size and contrast the cartouche was
  // easy to miss sitting on the paper's own border.
  const captionPx = Math.round(12 * s);
  ctx.font = `bold ${captionPx}px ${monoFont}`;
  const cw = ctx.measureText(caption).width + 22;

  // The caption needs an actual gap in the border(s) it sits on, not a patch
  // painted over them after the fact (that left the inner rule, when present,
  // visibly crossing straight through the label). Clip the gap out before
  // either stroke is drawn instead, so it's a real gap regardless of font
  // metrics — matching the same fix in drawDocumentBox.
  ctx.save();
  const gapX0 = x + w / 2 - cw / 2, gapX1 = x + w / 2 + cw / 2;
  const gapY0 = y - captionPx * 1.0, gapY1 = y + 12;
  // Explicit Path2D + fillRule argument (see drawDocumentBox) — the
  // current-path + string overload of ctx.clip() didn't reliably apply it.
  const gapPath = new Path2D();
  gapPath.rect(x - 20, y - 20, w + 40, h + 40);
  gapPath.rect(gapX0, gapY0, gapX1 - gapX0, gapY1 - gapY0);
  ctx.clip(gapPath, "evenodd");

  ctx.strokeStyle = t.stroke;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x, y, w, h);
  if (headerH > 0) {
    ctx.strokeStyle = t.hairline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + headerH);
    ctx.lineTo(x + w - 1, y + headerH);
    ctx.stroke();
  } else {
    ctx.strokeStyle = t.hairline;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
  }
  ctx.restore();

  // crop-mark ticks on the paper's own corners (the mocks' locked look)
  drawCornerTicks(ctx, x, y, w, h, 13, t.accent, 0);

  ctx.fillStyle = t.fgMid;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  withTracking(ctx, 1.3, () => ctx.fillText(caption, x + w / 2, y));

  gc.chrome.paper = { x, y, w, h };
  gc.chrome.play = { x: topBoxX, y: topBoxY, w: topBoxWidth, h: topBoxHeight };
  gc.chrome.caption = { x: x + w / 2 - cw / 2, y: y - 8, w: cw, h: 16 };
};

// The vector heart used by the CANDIDATE STANDING HUD (and by levels that borrow it).
export const drawHeart = (
  ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number,
  fill: string | null, stroke: string, lineWidth = 1.5,
) => {
  const k = size / 32;
  ctx.save();
  ctx.translate(cx - 16 * k, cy - 14.5 * k);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(16, 27.5);
  ctx.bezierCurveTo(8.5, 20.5, 1.5, 15.2, 1.5, 8.6);
  ctx.bezierCurveTo(1.5, 4.3, 4.8, 1.5, 8.4, 1.5);
  ctx.bezierCurveTo(11.7, 1.5, 14.4, 3.4, 16, 6);
  ctx.bezierCurveTo(17.6, 3.4, 20.3, 1.5, 23.6, 1.5);
  ctx.bezierCurveTo(27.2, 1.5, 30.5, 4.3, 30.5, 8.6);
  ctx.bezierCurveTo(30.5, 15.2, 23.5, 20.5, 16, 27.5);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth / k;
  ctx.stroke();
  ctx.restore();
};

// An embossed, official-looking button. Signature preserved for all callers.
export const drawButton = (
  gc: GameContext,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  action: () => void,
  fontSize = 18,
) => {
  const { ctx, state, bodyFont } = gc;
  const t = getTheme(state);
  const s = uiScale(ctx);
  const hover = gc.mouseX >= x && gc.mouseX <= x + w && gc.mouseY >= y && gc.mouseY <= y + h;
  const pressed = hover && gc.mouseDown;
  const dy = pressed ? 1 : 0;

  ctx.save();
  ctx.shadowColor = state.darkMode ? "rgba(0,0,0,0.45)" : "rgba(60,45,20,0.22)";
  ctx.shadowBlur = pressed ? 2 : hover ? 14 : 9;
  ctx.shadowOffsetY = pressed ? 1 : hover ? 4 : 3;
  roundRect(ctx, x, y + dy, w, h, 5);
  ctx.fillStyle = hover ? t.accent : t.bg;
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = hover ? t.accentDeep : t.stroke;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y + dy, w, h, 5);
  ctx.stroke();

  const fontPx = Math.min(Math.round(fontSize * s), h * 0.52);
  ctx.fillStyle = hover ? "#F7F1E3" : t.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${fontPx}px ${bodyFont}`;
  withTracking(ctx, 0.5, () => ctx.fillText(label.toUpperCase(), x + w / 2, y + h / 2 + dy, w - 18));

  gc.hitAreas.push({ x, y, w, h, action });
};

// Draws a PNG as a button, preserving aspect ratio from crop bounds.
// Falls back to drawButton if the image isn't loaded yet.
export const drawImgButton = (
  gc: GameContext,
  img: HTMLImageElement,
  loaded: boolean,
  sx: number, sy: number, sw: number, sh: number,  // source crop
  x: number, y: number, w: number,                 // destination x/y/width (height derived from ratio)
  action: () => void,
  fallbackLabel = "",
) => {
  const h = w * (sh / sw);
  if (loaded) {
    gc.ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    gc.hitAreas.push({ x, y, w, h, action });
  } else {
    drawButton(gc, fallbackLabel, x, y, w, h, action);
  }
};

// The Examiner's panel below the paper: a margin-note style annotation block.
// The guide speech text keeps its original position/font so Level 3's glyph
// hit-testing stays aligned — only the surrounding chrome is restyled.
export const drawBottomPanel = (gc: GameContext) => {
  const { ctx, state, monoFont, bodyFont } = gc;
  const { frameX, frameW, bottomBoxY, bottomBoxHeight } = getLayout(ctx);
  const t = getTheme(state);
  const s = uiScale(ctx);
  const contentX = frameX;
  const contentWidth = frameW;

  ctx.save();
  ctx.shadowColor = state.darkMode ? "rgba(0,0,0,0.45)" : "rgba(60,45,20,0.16)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = t.panel;
  ctx.fillRect(contentX, bottomBoxY, contentWidth, bottomBoxHeight);
  ctx.restore();
  ctx.strokeStyle = t.stroke;
  ctx.lineWidth = 2;
  ctx.strokeRect(contentX, bottomBoxY, contentWidth, bottomBoxHeight);
  ctx.strokeStyle = t.hairline;
  ctx.lineWidth = 1;
  ctx.strokeRect(contentX + 5, bottomBoxY + 5, contentWidth - 10, bottomBoxHeight - 10);

  const panelCY = bottomBoxY + bottomBoxHeight / 2;
  const robotCX = contentX + contentWidth * 0.07;
  const spriteSize = Math.min(bottomBoxHeight * 0.62, 50);
  const charX = robotCX + gc.guideCharOffsetX;
  const charY = panelCY - spriteSize / 2 + gc.guideCharOffsetY - 6;

  const dirSprites: Record<string, { img: HTMLImageElement; loaded: boolean }> = {
    down:  { img: gc.playerDownImg,  loaded: gc.playerDownLoaded },
    up:    { img: gc.playerUpImg,    loaded: gc.playerUpLoaded },
    left:  { img: gc.playerLeftImg,  loaded: gc.playerLeftLoaded },
    right: { img: gc.playerRightImg, loaded: gc.playerRightLoaded },
  };
  const { img: spriteImg, loaded: spriteLoaded } = dirSprites[gc.guideCharDir] ?? dirSprites.down;
  if (spriteLoaded) {
    ctx.drawImage(spriteImg, charX - spriteSize / 2, charY, spriteSize, spriteSize);
  }

  ctx.fillStyle = t.accent;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `${Math.round(10 * s)}px ${monoFont}`;
  withTracking(ctx, 1, () => ctx.fillText("EXAMINER", charX, charY + spriteSize + 5));

  const divX = contentX + contentWidth * 0.155;
  ctx.strokeStyle = t.hairline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(divX, bottomBoxY + bottomBoxHeight * 0.10);
  ctx.lineTo(divX, bottomBoxY + bottomBoxHeight * 0.90);
  ctx.stroke();

  const speechX = divX + contentWidth * 0.025;
  // the hearts segment takes the right 14.5% on level screens
  const onLevel = state.currentScreen === "level";
  const rightEdge = onLevel ? contentX + contentWidth * 0.855 : contentX + contentWidth;
  const speechW = rightEdge - speechX - contentWidth * 0.02;

  gc.chrome.examiner = { x: charX - spriteSize / 2, y: charY, w: spriteSize, h: spriteSize + 18 };

  if (onLevel) {
    const div2X = contentX + contentWidth * 0.855;
    ctx.strokeStyle = t.hairline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(div2X, bottomBoxY + bottomBoxHeight * 0.10);
    ctx.lineTo(div2X, bottomBoxY + bottomBoxHeight * 0.90);
    ctx.stroke();

    const segCX = contentX + contentWidth * 0.9275;
    ctx.fillStyle = t.fgDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(10 * s)}px ${monoFont}`;
    withTracking(ctx, 1, () => ctx.fillText(state.hudHeartsLabel ?? "CANDIDATE STANDING", segCX, panelCY - 20 * s));

    const heartSize = Math.round(32 * s);
    const count = state.hudExtraHeart ? 4 : 3;
    const gapPx = Math.round((count === 4 ? 6 : 8) * s);
    const rowW = count * heartSize + (count - 1) * gapPx;
    const rowX = segCX - rowW / 2;
    const rowY = panelCY + 6 * s;
    gc.chrome.hearts = [];
    for (let i = 0; i < count; i++) {
      const hx = rowX + i * (heartSize + gapPx) + heartSize / 2;
      const hidden = state.hudHiddenHearts?.includes(i);
      const isExtra = i === 3;
      const alive = i < state.lives;
      if (!hidden) {
        ctx.save();
        if (alive && !isExtra) {
          ctx.shadowColor = "rgba(60,45,20,0.25)";
          ctx.shadowBlur = 3;
          ctx.shadowOffsetY = 2;
        }
        if (isExtra) drawHeart(ctx, hx, rowY, heartSize * 1.05, "#6E3050", "#5A2222", 1.5);
        else if (alive) drawHeart(ctx, hx, rowY, heartSize, t.accent, t.accentDeep, 1.5);
        else drawHeart(ctx, hx, rowY, heartSize, null, t.hairline, 2);
        ctx.restore();
      }
      gc.chrome.hearts.push({ x: hx - heartSize / 2, y: rowY - heartSize / 2, w: heartSize, h: heartSize });
    }
    gc.chrome.heartsRow = { x: rowX, y: rowY - heartSize / 2, w: rowW, h: heartSize };
  }

  const levelData = state.currentScreen === "level"
    ? (state.guideLines ? { title: "", lines: state.guideLines } : LEVEL_DATA[state.currentLevel - 1])
    : { title: state.storyTitle, lines: state.storyLines };

  ctx.fillStyle = t.fgDim;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `${Math.round(11 * s)}px ${monoFont}`;
  withTracking(ctx, 1, () =>
    ctx.fillText("EXAMINER'S REMARKS", speechX, bottomBoxY + bottomBoxHeight * 0.10));

  const fullLines = levelData.lines;
  const totalChars = fullLines.reduce((sum, line) => sum + line.length, 0);
  const isTyping = state.guideReveal < totalChars;

  let charsLeft = Math.max(0, state.guideReveal);
  const displayLines: string[] = [];
  for (const line of fullLines) {
    if (charsLeft <= 0) break;
    const shown = Math.min(charsLeft, line.length);
    displayLines.push(line.slice(0, shown));
    charsLeft -= shown;
  }
  if (displayLines.length > 0 && (isTyping || state.guideCursor)) {
    displayLines[displayLines.length - 1] += " |";
  }

  const guideM = getGuideTextMetrics(ctx);
  const lineGap = guideM.lineGap;
  const totalH = fullLines.length * lineGap;
  const startY = panelCY - totalH / 2 + lineGap * 0.1;

  ctx.fillStyle = t.fg;
  ctx.textBaseline = "middle";
  ctx.font = `${guideM.fontPx}px ${bodyFont}`;
  for (let i = 0; i < displayLines.length; i++) {
    ctx.fillText(displayLines[i], speechX, startY + i * lineGap, speechW);
  }
  gc.chrome.remarks = { x: speechX, y: startY - lineGap / 2, w: speechW, h: Math.max(1, fullLines.length) * lineGap };
};

// In-level form header band: item number (left) and pause control (right).
// Lives now live in the examiner panel (CANDIDATE STANDING), not on the paper.
export const drawLevelHUD = (gc: GameContext) => {
  const { ctx, state, monoFont } = gc;
  const { paperX, paperY, paperW, headerH } = getLayout(ctx);
  const t = getTheme(state);
  const s = uiScale(ctx);
  const bandCY = paperY + headerH / 2;

  // item number — preserve Level 3's intentional dot-less label
  ctx.fillStyle = t.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(22 * s)}px ${monoFont}`;
  const label = state.currentLevel === 3 ? `Q${state.currentLevel}` : `Q.${state.currentLevel}`;
  const labelX = paperX + Math.round(22 * s);
  ctx.fillText(label, labelX, bandCY);
  const labelW = ctx.measureText(label).width;
  gc.chrome.qLabel = { x: labelX - 6, y: bandCY - 14 * s, w: labelW + 12, h: 28 * s };

  // pause control
  const pauseSize = Math.round(34 * s);
  const pauseX = paperX + paperW - Math.round(12 * s) - pauseSize;
  const pauseY = bandCY - pauseSize / 2;
  roundRect(ctx, pauseX, pauseY, pauseSize, pauseSize, 4);
  ctx.fillStyle = t.bg;
  ctx.fill();
  ctx.strokeStyle = t.stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = t.accent;
  const barW = pauseSize * 0.15;
  const barH = pauseSize * 0.44;
  const barGap = pauseSize * 0.15;
  ctx.fillRect(pauseX + pauseSize / 2 - barGap / 2 - barW, pauseY + pauseSize / 2 - barH / 2, barW, barH);
  ctx.fillRect(pauseX + pauseSize / 2 + barGap / 2, pauseY + pauseSize / 2 - barH / 2, barW, barH);
  gc.chrome.pause = { x: pauseX, y: pauseY, w: pauseSize, h: pauseSize };
  gc.hitAreas.push({
    x: pauseX, y: pauseY, w: pauseSize, h: pauseSize,
    action: () => {
      if (state.pauseDisabled) { gc.pauseIntercept?.(); gc.render(); return; }
      state.paused = true; gc.render();
    },
  });
};

// "ANSWER KEY" toggle (cheats) — styled as a stamped gold tab above the paper.
export const drawCheatsButton = (gc: GameContext) => {
  const { ctx, state, monoFont } = gc;
  const { topBoxX, topBoxY } = getLayout(ctx);
  const t = getTheme(state);
  const s = uiScale(ctx);
  const btnW = Math.round(102 * s);
  const btnH = Math.round(25 * s);
  const btnX = topBoxX;
  const btnY = topBoxY - btnH - 8;

  const hover = gc.mouseX >= btnX && gc.mouseX <= btnX + btnW &&
                gc.mouseY >= btnY && gc.mouseY <= btnY + btnH;

  roundRect(ctx, btnX, btnY, btnW, btnH, 3);
  ctx.fillStyle = hover ? t.seal : "rgba(176,137,47,0.16)";
  ctx.fill();
  ctx.strokeStyle = t.seal;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = hover ? (state.darkMode ? "#161310" : "#FBF8EF") : t.seal;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(11 * s)}px ${monoFont}`;
  withTracking(ctx, 1, () => ctx.fillText("ANSWER KEY", btnX + btnW / 2, btnY + btnH / 2));

  gc.hitAreas.push({
    x: btnX, y: btnY, w: btnW, h: btnH,
    action: () => { state.cheatsPopupOpen = !state.cheatsPopupOpen; gc.render(); },
  });
};

// Proctor clock, top-right above the paper. Tier colour reflects elapsed time.
export const drawExamTimer = (gc: GameContext) => {
  const { ctx, state, monoFont } = gc;
  const { paperX, paperY, paperW } = getLayout(ctx);
  const t = getTheme(state);
  const s = uiScale(ctx);
  const btnW = Math.round(108 * s);
  const btnH = Math.round(25 * s);
  // Flush with the paper's right edge, sitting just above the paper's top rule.
  const btnX = paperX + paperW - btnW;
  const btnY = paperY - btnH - Math.round(10 * s);

  const elapsedMs = performance.now() - state.examStartTime;
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const label = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const tierColor = minutes < 20 ? t.seal : minutes < 28 ? "#9AA7AE" : "#B07840";

  roundRect(ctx, btnX, btnY, btnW, btnH, 3);
  ctx.fillStyle = state.darkMode ? "rgba(0,0,0,0.35)" : "rgba(251,248,239,0.9)";
  ctx.fill();
  ctx.strokeStyle = tierColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = t.fgDim;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(8 * s)}px ${monoFont}`;
  withTracking(ctx, 1, () => ctx.fillText("TIME", btnX + 9, btnY + btnH / 2));

  ctx.fillStyle = tierColor;
  ctx.textAlign = "right";
  ctx.font = `bold ${Math.round(14 * s)}px ${monoFont}`;
  ctx.fillText(label, btnX + btnW - 9, btnY + btnH / 2);
};
