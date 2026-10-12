import { GameContext } from '../types';
import { getTheme }    from '../theme';
import { getLayout }   from '../layout';
import { roundRect, uiScale } from '../renderer';
import { drawChoice, wrong, freshEntry, drawWinScreen, say, inputOpen, levelClock } from './lateralHelpers';

// ── Q31 — Lights Out ──────────────────────────────────────────────────────────
// The paper is unlit: a dark sheet with a faint cone of light falling from above,
// four dim buttons A B C D, and an instruction you cannot read. Pressing a button
// in the dark does nothing. Q25 veterans will open the pause menu and flip DARK
// MODE: that changes the hall and not the paper, and the examiner says so. The
// switch is the lightbulb in the logo, which has been sitting above every question
// since Q1 and has never been touchable. It is drawn as a faint, low-contrast
// shadow on the logo — not an obvious dark blob — and blinks once after fifteen
// idle seconds. The hint ladder nudges toward "look up" without ever naming the
// bulb outright, so the discovery stays the player's. Click it: a soft flash,
// the paper lights to ivory, the instruction reads PRESS THE THIRD BUTTON, and C
// wins. A, B and D cost a heart once the lights are on. Replaces the old
// dark-mode reveal, which repeated Q25's theme-toggle trick.

const LABELS = ['A', 'B', 'C', 'D'];
const ANSWER_INDEX = 2;               // the third button

const DARK_PRESS_1 = 'You cannot see what you are pressing. Neither can I.';
const DARK_PRESS_N = 'It is dark in here. The hall is fine. The paper is not.';
const HALL_LINE    = 'That changed the hall. It did not change the paper.';
const HINT_20      = 'Somebody turned the light off. It is above you.';
const HINT_40      = 'Still nothing. Whatever needs waking is still up there.';
const LIT_LINE     = '...There it is. Third button, candidate.';
const MISS_LINE    = 'Third. The one after the second.';

// animation lengths (ms), lifted from the mock's transitions
const BG_FADE      = 500;             // .play background transition .5s
const CONE_FADE    = 600;             // .cone opacity .6s
const INSTR_DELAY  = 250;             // .instr transition delay .25s
const INSTR_FADE   = 900;             // .instr opacity .9s
const FLASH_MS     = 700;             // @keyframes flashout .7s
const BLINK_MS     = 1300;            // @keyframes bulbblink 1.3s
const CAP_FADE     = 500;             // .bulbcap opacity .5s

let lit31          = false;
let litAt31        = 0;
let darkPresses31  = 0;
let hintStage31    = 0;
let blinked31      = false;
let blinkAt31      = 0;
let prevDark31     = false;
const clock31      = { last: 0, elapsed: 0 };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// The bulb inside the logo sticker. The renderer publishes it every frame; if the
// logo image has not loaded the typed wordmark is drawn instead, so fall back to
// the same geometry computed from the layout.
const bulbRect = (gc: GameContext) => {
  const b = gc.chrome.bulb;
  if (b) return b;
  const { w, h } = getLayout(gc.ctx);
  const size = Math.round(h * 0.151);
  const x = Math.round(w / 2 - size / 2);
  const y = Math.round(h * 0.015);
  return { x: x + size * 0.48, y: y + size * 0.05, w: size * 0.22, h: size * 0.27 };
};

// A dim, unlit answer card: the mock's .btn at opacity .28 with the brightness
// pulled down. No hover state, because you cannot see it anyway.
const drawDimButton = (gc: GameContext, label: string, x: number, y: number, w: number, h: number, fontPx: number) => {
  const { ctx, state, bodyFont } = gc;
  const t = getTheme(state);
  ctx.save();
  ctx.globalAlpha = 0.30;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = t.bg;
  ctx.fill();
  ctx.strokeStyle = t.stroke;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.fillStyle = t.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${fontPx}px ${bodyFont}`;
  ctx.fillText(label, x + w / 2, y + h / 2, w - 16);
  ctx.restore();
};

export const drawLevel31 = (gc: GameContext) => {
  const { ctx, state, displayFont, monoFont } = gc;
  const { w, topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const t  = getTheme(state);
  const s  = uiScale(ctx);
  const cx = w / 2;

  if (state.levelSubPhase === 'win') {
    drawWinScreen(gc, 'ILLUMINATED.',
      'The instruction was always there. Someone had turned the light off. Someone is always Corporate.', 32);
    return;
  }
  if (freshEntry(gc)) {
    lit31 = false; litAt31 = 0; darkPresses31 = 0; hintStage31 = 0;
    blinked31 = false; blinkAt31 = 0;
    prevDark31 = state.darkMode;
    clock31.last = 0; clock31.elapsed = 0;
  }

  // ── the hall switch is not the paper switch ────────────────────────────────
  if (state.darkMode !== prevDark31) {
    prevDark31 = state.darkMode;
    if (!lit31) say(gc, HALL_LINE);
  }

  // ── pause-aware hint ladder ────────────────────────────────────────────────
  const now = performance.now();
  const { elapsed } = levelClock(gc, clock31);
  if (!lit31 && inputOpen(gc)) {
    if (elapsed >= 15 && !blinked31) { blinked31 = true; blinkAt31 = now; }
    if (elapsed >= 20 && hintStage31 < 2) { hintStage31 = 2; say(gc, HINT_20); }
    if (elapsed >= 40 && hintStage31 < 3) { hintStage31 = 3; say(gc, HINT_40); blinkAt31 = now; }
  }

  const age      = lit31 ? now - litAt31 : 0;
  const darkA    = lit31 ? 1 - clamp01(age / BG_FADE)   : 1;
  const coneA    = lit31 ? 1 - clamp01(age / CONE_FADE) : 1;
  const instrA   = lit31 ? clamp01((age - INSTR_DELAY) / INSTR_FADE) : 0;
  const flashA   = lit31 && age < FLASH_MS
    ? (age < FLASH_MS * 0.15 ? age / (FLASH_MS * 0.15) : 1 - (age - FLASH_MS * 0.15) / (FLASH_MS * 0.85))
    : 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(topBoxX, topBoxY, topBoxWidth, topBoxHeight);
  ctx.clip();

  // ── the unlit sheet ────────────────────────────────────────────────────────
  if (darkA > 0) {
    ctx.save();
    ctx.globalAlpha = darkA;
    ctx.fillStyle = state.darkMode ? '#07070B' : '#101018';
    ctx.fillRect(topBoxX, topBoxY, topBoxWidth, topBoxHeight);
    ctx.restore();
  }

  // ── the cone of light falling from above (ellipse 34% x 62% at 50% -8%) ────
  if (coneA > 0) {
    const rx = topBoxWidth * 0.34, ry = topBoxHeight * 0.62;
    ctx.save();
    ctx.globalAlpha = coneA;
    ctx.translate(cx, topBoxY - topBoxHeight * 0.08);
    ctx.scale(1, ry / rx);
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    cg.addColorStop(0, 'rgba(255,225,150,0.11)');
    cg.addColorStop(0.7, 'rgba(255,225,150,0)');
    cg.addColorStop(1, 'rgba(255,225,150,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(-rx * 1.2, -rx * 1.2, rx * 2.4, rx * 2.4 + topBoxHeight);
    ctx.restore();
  }

  // ── the instruction you cannot read until the lights are on ────────────────
  if (instrA > 0) {
    const iy = topBoxY + topBoxHeight * 0.22;
    ctx.save();
    ctx.globalAlpha = instrA;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.fgDim;
    ctx.font = `${Math.round(12 * s)}px ${monoFont}`;
    ctx.fillText('I N S T R U C T I O N', cx, iy + 7 * s);
    ctx.fillStyle = t.ink;
    ctx.font = `${Math.round(34 * s)}px ${displayFont}`;
    ctx.fillText('Q.31: PRESS THE THIRD BUTTON', cx, iy + 44 * s, topBoxWidth * 0.9);
    ctx.restore();
  }

  // ── A B C D ────────────────────────────────────────────────────────────────
  const bw   = Math.min(topBoxWidth * 0.143, 150 * s);
  const bh   = Math.min(topBoxHeight * 0.15, 58 * s);
  const gap  = topBoxWidth * 0.034;
  const totW = LABELS.length * bw + (LABELS.length - 1) * gap;
  const bx0  = cx - totW / 2;
  const by   = topBoxY + topBoxHeight * 0.91 - bh;
  const fontPx = Math.min(Math.round(25 * s), bh * 0.6);

  for (let i = 0; i < LABELS.length; i++) {
    const bx = bx0 + i * (bw + gap);
    const press = () => {
      if (!inputOpen(gc)) return;
      if (!lit31) {
        darkPresses31++;
        if (hintStage31 < 1) hintStage31 = 1;
        gc.sounds.ui('tick');
        say(gc, darkPresses31 === 1 ? DARK_PRESS_1 : DARK_PRESS_N);
        return;
      }
      if (i === ANSWER_INDEX) { state.levelSubPhase = 'win'; gc.render(); }
      else { wrong(gc); say(gc, MISS_LINE); }
    };
    if (lit31) {
      drawChoice(gc, LABELS[i], bx, by, bw, bh, press, { fontSize: 25 });
    } else {
      drawDimButton(gc, LABELS[i], bx, by, bw, bh, fontPx);
      gc.hitAreas.push({ x: bx, y: by, w: bw, h: bh, action: press, noCursor: true });
    }
  }

  // ── the flash, over everything on the paper ────────────────────────────────
  if (flashA > 0) {
    const fx = topBoxX + topBoxWidth * 0.54, fy = topBoxY + topBoxHeight * 0.08;
    const fr = Math.hypot(topBoxWidth * 0.54, topBoxHeight * 0.92) * 0.6;
    ctx.save();
    ctx.globalAlpha = clamp01(flashA);
    const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
    fg.addColorStop(0, 'rgba(255,245,210,0.95)');
    fg.addColorStop(1, 'rgba(255,245,210,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(topBoxX, topBoxY, topBoxWidth, topBoxHeight);
    ctx.restore();
  }

  ctx.restore();

  // ── the bulb in the logo: drawn OFF, and clickable ─────────────────────────
  gc.afterPanel = (g) => {
    const b = bulbRect(g);
    const capAge = lit31 ? performance.now() - litAt31 : 0;
    let capA = lit31 ? 1 - clamp01(capAge / CAP_FADE) : 1;
    if (!lit31 && blinkAt31) {
      const bAge = performance.now() - blinkAt31;
      if (bAge < BLINK_MS) capA *= 1 - 0.8 * Math.sin((bAge / BLINK_MS) * Math.PI);
    }
    if (capA > 0.002) {
      const gx = g.ctx;
      gx.save();
      // Low-contrast and low-alpha on purpose: this should read as a shadow on
      // the logo, not an obvious dark blob calling out where to click.
      gx.globalAlpha = capA * 0.55;
      gx.fillStyle = g.state.darkMode ? 'rgba(70,68,80,0.5)' : 'rgba(60,58,70,0.4)';
      gx.beginPath();
      gx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      gx.fill();
      gx.restore();
    }
    if (!lit31) {
      const padX = b.w * 0.62, padY = b.h * 0.36;
      g.hitAreas.push({
        x: b.x - padX, y: b.y - padY, w: b.w + padX * 2, h: b.h + padY * 2, noCursor: true,
        action: () => {
          if (lit31 || !inputOpen(g)) return;
          lit31 = true;
          litAt31 = performance.now();
          g.sounds.play('allOfTheLights', { volume: 0.6, restart: true });
          setTimeout(() => g.sounds.stop('allOfTheLights'), 1200);
          say(g, LIT_LINE);
          g.render();
        },
      });
    }
  };

  const hook = window as unknown as { __gc?: Record<string, unknown> };
  if (hook.__gc) hook.__gc.lv = { lit: lit31, elapsed, hintStage: hintStage31, darkPresses: darkPresses31, blinked: blinked31 };
};
