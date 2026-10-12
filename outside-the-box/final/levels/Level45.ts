import { GameContext } from '../types';
import { getTheme }    from '../theme';
import { getLayout }   from '../layout';
import { uiScale }     from '../renderer';
import { drawChoice, freshEntry, drawWinScreen, say, inputOpen, levelClock } from './lateralHelpers';

// ── Q45 — Runaway Submit ──────────────────────────────────────────────────────
// "Press SUBMIT to continue." The button flees the cursor (150 px radius, speed 9)
// and it screams every time you reach for it. It cannot be cornered straight away:
// an unseen STAMINA reserve drains only while the mouse button is actually held
// down on a chase — idly hovering near it costs it nothing — and until you have
// pressed it through ~3400 px of that kind of chasing, pinning it against an edge
// just makes it bolt to a fresh spot along the wall. There is no meter shown for
// any of this; the only feedback is the examiner's remarks and the button's own
// behavior. Once winded it can be herded into a corner, where it gives up
// ("OK OK FINE") and can finally be clicked. Nothing here costs a heart: the
// trap is chasing it head-on forever, and the price is time.

const FLEE_RADIUS = 150;
const FLEE_SPEED  = 9;
const BTN_W   = 150;
const BTN_H   = 52;
const STAMINA = 3400;      // px of held-down chasing before it is winded
const BOLT_FREEZE = 0.26;  // s the button is untouchable after a bolt
const BOLT_ANIM   = 0.22;  // s the bolt slide takes to land
const SCREAM_GAP  = 0.9;   // s cooldown on the scream
const BOLT_AWAY   = 380;   // px it tries to put between itself and the cursor

const LINES_OPEN: string[] = [
  'Just press submit and we can move on.',
  '...it seems the button has other ideas. Tire it out, then back it into a corner.',
];

let bx45 = 0, by45 = 0;
let boltFromX45 = 0, boltFromY45 = 0;
let boltAt45 = -99, boltUntil45 = 0;
let escapes45 = 0, bolts45 = 0, chased45 = 0;
let winded45 = false, cornered45 = false, inRange45 = false;
let lastScream45 = -99;
let sheep45 = false;
let face45: 'up' | 'down' | 'left' | 'right' = 'down';
const clock45 = { last: 0, elapsed: 0 };

export const drawLevel45 = (gc: GameContext) => {
  const { ctx, state, displayFont, bodyFont } = gc;
  const { w, topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const t  = getTheme(state);
  const s  = uiScale(ctx);
  const cx = w / 2;

  if (state.levelSubPhase === 'win') {
    drawWinScreen(gc, 'CAUGHT.', 'You stopped chasing and started cornering. That is the whole trick.', 46);
    return;
  }

  const BW = BTN_W * s, BH = BTN_H * s;
  const R  = FLEE_RADIUS * s;
  const minX = topBoxX + topBoxWidth * 0.04;
  const maxX = topBoxX + topBoxWidth * 0.96 - BW;
  const minY = topBoxY + topBoxHeight * 0.30;
  const maxY = topBoxY + topBoxHeight * 0.90 - BH;

  if (freshEntry(gc)) {
    bx45 = topBoxX + topBoxWidth / 2 - BW / 2;
    by45 = topBoxY + topBoxHeight * 0.45;
    boltFromX45 = bx45; boltFromY45 = by45;
    boltAt45 = -99; boltUntil45 = 0;
    escapes45 = 0; bolts45 = 0; chased45 = 0;
    winded45 = false; cornered45 = false; inRange45 = false;
    lastScream45 = -99; sheep45 = false; face45 = 'down';
    clock45.last = 0; clock45.elapsed = 0;
    say(gc, LINES_OPEN[0], LINES_OPEN[1]);
  }
  // Keep it inside the paper if the window was resized under it.
  bx45 = Math.max(minX, Math.min(maxX, bx45));
  by45 = Math.max(minY, Math.min(maxY, by45));

  const { dt, elapsed } = levelClock(gc, clock45);
  const ff = Math.min(3, dt * 60);   // 1.0 at 60fps: the mock's per-frame numbers

  // The examiner gives up on the chase after twenty seconds.
  if (elapsed >= 20 && !sheep45) { sheep45 = true; say(gc, 'Stop chasing it. Think like a sheepdog.'); }

  const scream = () => {
    if (elapsed - lastScream45 < SCREAM_GAP) return;
    lastScream45 = elapsed;
    gc.sounds.play('clickDontClick', { volume: 0.6 });
  };

  // Pinned against an edge while it still has legs: it bolts to a fresh spot on
  // the wall, as far from the cursor as it can find in 40 tries.
  const bolt = () => {
    let best: { x: number; y: number; d: number } | null = null;
    for (let i = 0; i < 40; i++) {
      const side = Math.floor(Math.random() * 4);
      const cand = side === 0 ? { x: minX + Math.random() * (maxX - minX), y: minY }
                 : side === 1 ? { x: minX + Math.random() * (maxX - minX), y: maxY }
                 : side === 2 ? { x: minX, y: minY + Math.random() * (maxY - minY) }
                 :              { x: maxX, y: minY + Math.random() * (maxY - minY) };
      const d = Math.hypot(cand.x + BW / 2 - gc.mouseX, cand.y + BH / 2 - gc.mouseY);
      if (!best || d > best.d) best = { x: cand.x, y: cand.y, d };
      if (d > BOLT_AWAY * s) break;
    }
    if (!best) return;
    boltFromX45 = bx45; boltFromY45 = by45;
    bx45 = best.x; by45 = best.y;
    bolts45++;
    boltAt45 = elapsed;
    boltUntil45 = elapsed + BOLT_FREEZE;
    scream();
    if (bolts45 === 1) say(gc, 'It has a lot left in it. Tire it out first.');
  };

  // ── flight ────────────────────────────────────────────────────────────────
  if (inputOpen(gc) && elapsed >= boltUntil45) {
    const bcx = bx45 + BW / 2, bcy = by45 + BH / 2;
    const dx = bcx - gc.mouseX, dy = bcy - gc.mouseY;
    const dist = Math.hypot(dx, dy);
    if (dist < R && dist > 0.001) {
      const force = (R - dist) / R;
      const wantX = bx45 + (dx / dist) * FLEE_SPEED * s * force * ff;
      const wantY = by45 + (dy / dist) * FLEE_SPEED * s * force * ff;
      const nx = Math.max(minX, Math.min(maxX, wantX));
      const ny = Math.max(minY, Math.min(maxY, wantY));
      const moved   = Math.abs(nx - bx45) + Math.abs(ny - by45);
      const blocked = Math.abs(wantX - nx) + Math.abs(wantY - ny) > 0.5 * s;
      bx45 = nx; by45 = ny;

      if (!inRange45) {
        inRange45 = true;
        escapes45++;
        scream();
        if (escapes45 > 1 && escapes45 % 3 === 0) say(gc, 'Escapes: ' + escapes45 + '.');
      }
      if (!winded45) {
        // Only an actual press-and-chase tires it out — hovering near it for
        // free (no mouse button down) costs it nothing.
        if (gc.mouseDown) {
          chased45 += moved;
          if (chased45 >= STAMINA * s) {
            winded45 = true;
            say(gc, 'It is winded. Now it can be cornered.');
          } else if (blocked && dist < R * 0.7) {
            bolt();
          }
        }
      } else {
        const nowCornered = moved < 0.4 * s && dist < R * 0.6;
        if (nowCornered !== cornered45) cornered45 = nowCornered;
      }
    } else if (inRange45) {
      inRange45 = false;
    }
  }

  // The examiner watches it, not you.
  const bcxNow = bx45 + BW / 2;
  face45 = bcxNow < topBoxX + topBoxWidth * 0.4 ? 'left'
         : bcxNow > topBoxX + topBoxWidth * 0.6 ? 'right'
         : 'down';
  gc.guideCharDir = face45;
  gc.guideCharOffsetX = 0;
  gc.guideCharOffsetY = 0;

  // ── paper copy ────────────────────────────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = t.ink;
  ctx.font = `bold ${Math.round(26 * s)}px ${displayFont}`;
  ctx.fillText('Press SUBMIT to continue.', cx, topBoxY + topBoxHeight * 0.12, topBoxWidth * 0.9);
  ctx.fillStyle = t.fgDim;
  ctx.font = `${Math.round(14 * s)}px ${bodyFont}`;
  ctx.fillText('...if you can. Some things run when you reach for them.', cx, topBoxY + topBoxHeight * 0.21, topBoxWidth * 0.9);

  // ── the button ────────────────────────────────────────────────────────────
  // No stamina meter drawn here on purpose — the only feedback the candidate
  // gets is the examiner's remarks and whether the button is still bolting.
  // A bolt slides rather than teleports; the hit area rides the drawn position.
  let drawX = bx45, drawY = by45;
  const bp = (elapsed - boltAt45) / BOLT_ANIM;
  if (bp >= 0 && bp < 1) {
    const e = 1 - Math.pow(1 - bp, 3);
    drawX = boltFromX45 + (bx45 - boltFromX45) * e;
    drawY = boltFromY45 + (by45 - boltFromY45) * e;
  }
  drawChoice(gc, cornered45 ? 'OK OK FINE' : 'SUBMIT', drawX, drawY, BW, BH, () => {
    if (!inputOpen(gc)) return;
    state.levelSubPhase = 'win';
    gc.render();
  }, { fontSize: cornered45 ? 16 : 22 });

  const dev = window as unknown as { __gc?: { lv?: Record<string, unknown> } };
  if (dev.__gc) dev.__gc.lv = {
    x: drawX, y: drawY, w: BW, h: BH,
    cx: drawX + BW / 2, cy: drawY + BH / 2,
    escapes: escapes45, bolts: bolts45, chased: chased45,
    winded: winded45, cornered: cornered45, sheep: sheep45,
    elapsed, stamina: STAMINA * s,
    minX, maxX, minY, maxY,
  };
};
