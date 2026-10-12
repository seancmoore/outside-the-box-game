import { GameContext } from '../types';
import { getTheme }    from '../theme';
import { getLayout }   from '../layout';
import { drawButton, uiScale, triggerStamp } from '../renderer';
import { freshEntry, drawWinScreen, say, inputOpen, levelClock } from './lateralHelpers';

// ── Q15 — Outside the Box ─────────────────────────────────────────────────────
// Connect-the-pairs (Flow) with real freehand pencil strokes. Click a seal and the
// line follows the cursor like a pen (press-and-drag works too); it completes the
// moment it reaches the matching seal. Red's seals sit flush against the left and
// right paper edges, blue's flush against the top and bottom, so whichever of the
// two is drawn first becomes an edge-to-edge wall and the other is provably
// trapped inside the sheet. Touching another line or another colour's seal slams
// INCORRECT and costs a heart.
//
// The way out is invisible: grab the paper's pristine top-left corner and pull.
// It peels, then tears off, taking the Q.15 label with it, and from then on lines
// may leave the paper and route around the outside across the desk.
// The examiner gives NO hints. He states the rules once, reacts after the rip and
// after the first line on the desk, and is otherwise silent.

type Col = 'green' | 'yellow' | 'red' | 'blue';
interface Pt { x: number; y: number; }

const COLS: Col[] = ['green', 'yellow', 'red', 'blue'];

// Ink palette (the mock's four pencil colours).
const INK: Record<Col, string> = {
  green:  '#3F8F55',
  yellow: '#D8A81F',
  red:    '#C03A2E',
  blue:   '#2E6BA8',
};

// Seal centres as fractions of the play area (mock frame 1280x860: x 118..1162,
// y 171..552). Red hugs the left/right edges, blue the top/bottom: every centre
// sits closer to its wall than SEAL_BLOCK_R, so nothing squeezes past.
const SEAL_F: Record<Col, [number, number][]> = {
  green:  [[0.1207, 0.1680], [0.1897, 0.3570]],
  yellow: [[0.8103, 0.7349], [0.7069, 0.8294]],
  red:    [[0.0077, 0.5459], [0.9923, 0.5459]],
  blue:   [[0.5000, 0.0367], [0.5000, 0.9633]],
};

// Mock pixel radii (scaled by the ui scale at draw time).
const SEAL_R = 12, START_R = 18, HIT_R = 12, SEAL_BLOCK_R = 22, STEP = 5;
const RIP_GRAB = 70, RIP_PULL = 62, TAP_MOVE = 25;
const TAP_SECS = 0.35;          // press shorter than this (and barely moved) = a click
const MAX_STEPS = 300;          // pen travel budget per frame

const OPENING = 'Connect each pair of seals. One unbroken line apiece. Lines must not touch one another.';
const BUMPS = [
  'Watch your line, candidate. They must not touch.',
  'Again. The lines. Must. Not. Touch.',
  'Your penmanship is a hazard to others.',
  'Just makes you want to rip the exam paper up, doesn\'t it.',
];
const RIP_LINE  = 'CANDIDATE. That is Institute property. ...Was. It was Institute property.';
const DESK_LINE = 'And now you are drawing on the desk. ...I see no rule against it. Somehow.';
const WIN_LINE  = '...Around the outside. The paper simply was not the whole desk.';

// The torn-off corner, as offsets from the paper's top-left corner (mock px).
const TEAR: [number, number][] = [
  [0, 0], [81, 0], [71, 19], [78, 36], [60, 49], [69, 71], [51, 84],
  [58, 107], [37, 119], [44, 141], [24, 151], [29, 174], [9, 185], [14, 201], [0, 209],
];

interface Geo {
  s: number;
  pl: number; pt: number; pr: number; pb: number;   // the paper's usable play rect
  oL: number; oT: number; oR: number; oB: number;   // the desk limit, once ripped
  kx: number; ky: number;                           // the paper's top-left corner
  pw: number; ph: number;
}

// ── module state (reset on fresh entry) ──────────────────────────────────────
let paths15:   Record<Col, Pt[]>    = { green: [], yellow: [], red: [], blue: [] };
let done15:    Record<Col, boolean> = { green: false, yellow: false, red: false, blue: false };
let stroke15:  { color: Col; startIdx: number; t0: number; moved: number; clickMode: boolean } | null = null;
let rip15:     { x0: number; y0: number; d: number; t0: number; follow: boolean } | null = null;
let ripped15   = false;
let sputtered15 = false;
let bumps15    = 0;
let winAt15    = 0;
let prevDown15 = false;
const clock15  = { last: 0, elapsed: 0 };

const geoOf = (gc: GameContext): Geo => {
  const { topBoxX, topBoxY, topBoxWidth, topBoxHeight, paperX, paperY, paperW, paperH } = getLayout(gc.ctx);
  const s = uiScale(gc.ctx);
  const inset = 3 * s;
  return {
    s,
    pl: topBoxX + inset,
    pt: topBoxY + inset,
    pr: topBoxX + topBoxWidth  - inset,
    pb: topBoxY + topBoxHeight - inset,
    oL: paperX - 60 * s,
    oT: paperY - 22 * s,
    oR: paperX + paperW + 60 * s,
    oB: paperY + paperH + 27 * s,
    kx: paperX,
    ky: paperY,
    pw: topBoxWidth  - inset * 2,
    ph: topBoxHeight - inset * 2,
  };
};

const sealPos = (col: Col, i: number, g: Geo): Pt => ({
  x: g.pl + SEAL_F[col][i][0] * g.pw,
  y: g.pt + SEAL_F[col][i][1] * g.ph,
});

const inPaper = (p: Pt, g: Geo) => p.x >= g.pl && p.x <= g.pr && p.y >= g.pt && p.y <= g.pb;
const inOuter = (p: Pt, g: Geo) => p.x >= g.oL && p.x <= g.oR && p.y >= g.oT && p.y <= g.oB;
const allowed = (p: Pt, g: Geo) => inPaper(p, g) || (ripped15 && inOuter(p, g));

const sealAt = (p: Pt, radius: number, g: Geo): { col: Col; i: number } | null => {
  const r2 = radius * radius;
  for (const col of COLS) {
    for (let i = 0; i < 2; i++) {
      const sp = sealPos(col, i, g);
      const dx = p.x - sp.x, dy = p.y - sp.y;
      if (dx * dx + dy * dy <= r2) return { col, i };
    }
  }
  return null;
};

const collides = (p: Pt, active: Col, g: Geo): boolean => {
  const hit = HIT_R * g.s, blk = SEAL_BLOCK_R * g.s;
  const hit2 = hit * hit, blk2 = blk * blk;
  for (const col of COLS) {
    if (col === active) continue;
    const pts = paths15[col];
    for (let i = 0; i < pts.length; i++) {
      const dx = p.x - pts[i].x, dy = p.y - pts[i].y;
      if (dx * dx + dy * dy < hit2) return true;
    }
    for (let i = 0; i < 2; i++) {
      const sp = sealPos(col, i, g);
      const dx = p.x - sp.x, dy = p.y - sp.y;
      if (dx * dx + dy * dy < blk2) return true;
    }
  }
  return false;
};

const connected = () => COLS.filter((c) => done15[c]).length;

const resetLines = () => {
  for (const col of COLS) { paths15[col] = []; done15[col] = false; }
  stroke15 = null;
};

const cancelStroke = () => {
  if (!stroke15) return;
  paths15[stroke15.color] = [];
  stroke15 = null;
};

const bump = (gc: GameContext) => {
  triggerStamp(gc, 'INCORRECT', getTheme(gc.state).danger);
  gc.sounds.ui('deny');
  gc.loseLife();
  say(gc, BUMPS[Math.min(bumps15, BUMPS.length - 1)]);
  bumps15++;
  cancelStroke();
};

const completeStroke = (gc: GameContext) => {
  if (!stroke15) return;
  done15[stroke15.color] = true;
  stroke15 = null;
  gc.sounds.ui('tick');
  if (COLS.every((c) => done15[c]) && !winAt15) {
    winAt15 = performance.now();
    say(gc, WIN_LINE);
    setTimeout(() => {
      if (gc.state.currentLevel === 15 && gc.state.levelSubPhase === 'active' && !gc.state.gameOver) {
        gc.state.levelSubPhase = 'win';
        gc.render();
      }
    }, 800);
  }
};

const doRip = (gc: GameContext) => {
  ripped15 = true;
  rip15 = null;
  gc.sounds.ui('thud');
  say(gc, RIP_LINE);
};

// Grow the active stroke from its tip toward the cursor, one STEP at a time.
const extendStroke = (gc: GameContext, g: Geo) => {
  const st = stroke15;
  if (!st) return;
  const pts = paths15[st.color];
  if (!pts.length) return;
  const step = STEP * g.s;
  const startR = START_R * g.s;
  const partner = sealPos(st.color, 1 - st.startIdx, g);
  let tip = pts[pts.length - 1];
  let guard = 0;
  while (guard++ < MAX_STEPS) {
    const dx = gc.mouseX - tip.x, dy = gc.mouseY - tip.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len <= step) break;
    const next = { x: tip.x + (dx / len) * step, y: tip.y + (dy / len) * step };
    if (!allowed(next, g)) break;
    if (collides(next, st.color, g)) { bump(gc); return; }
    pts.push(next);
    st.moved += step;
    tip = next;
    if (!sputtered15 && !inPaper(next, g)) { sputtered15 = true; say(gc, DESK_LINE); }
    const pdx = next.x - partner.x, pdy = next.y - partner.y;
    if (Math.sqrt(pdx * pdx + pdy * pdy) <= startR) {
      pts.push({ x: partner.x, y: partner.y });
      completeStroke(gc);
      return;
    }
  }
};

// ── drawing ──────────────────────────────────────────────────────────────────
const strokePath = (gc: GameContext, g: Geo) => {
  const { ctx } = gc;
  for (const col of COLS) {
    const pts = paths15[col];
    if (pts.length < 2) continue;
    ctx.save();
    ctx.strokeStyle = INK[col];
    ctx.lineWidth = 8 * g.s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = done15[col] ? 1 : 0.85;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }
};

const tearPath = (ctx: CanvasRenderingContext2D, g: Geo) => {
  ctx.beginPath();
  ctx.moveTo(g.kx + TEAR[0][0] * g.s, g.ky + TEAR[0][1] * g.s);
  for (let i = 1; i < TEAR.length; i++) ctx.lineTo(g.kx + TEAR[i][0] * g.s, g.ky + TEAR[i][1] * g.s);
  ctx.closePath();
};

// The missing corner: painted over the paper AND over the item label, so the
// Q.15 stamp goes with it. Drawn from afterPanel (after the HUD).
const drawTear = (gc: GameContext, g: Geo) => {
  const { ctx } = gc;
  const t = getTheme(gc.state);
  ctx.save();
  tearPath(ctx, g);
  ctx.fillStyle = t.bg;
  ctx.fill();

  // the ragged edge, with a soft under-shadow along the torn fibres
  ctx.beginPath();
  ctx.moveTo(g.kx + TEAR[1][0] * g.s + 3 * g.s, g.ky + TEAR[1][1] * g.s + 4 * g.s);
  for (let i = 2; i < TEAR.length; i++) ctx.lineTo(g.kx + TEAR[i][0] * g.s + 3 * g.s, g.ky + TEAR[i][1] * g.s + 3 * g.s);
  ctx.strokeStyle = t.hairline;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1.5 * g.s;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.moveTo(g.kx + TEAR[1][0] * g.s, g.ky + TEAR[1][1] * g.s);
  for (let i = 2; i < TEAR.length; i++) ctx.lineTo(g.kx + TEAR[i][0] * g.s, g.ky + TEAR[i][1] * g.s);
  ctx.strokeStyle = t.stroke;
  ctx.lineWidth = 2 * g.s;
  ctx.stroke();
  ctx.restore();

  // any pencil that crosses the hole is on the desk now: keep it visible
  ctx.save();
  tearPath(ctx, g);
  ctx.clip();
  strokePath(gc, g);
  ctx.restore();
};

// The corner lifting before it lets go. Drawn under the HUD so the label rides it.
const drawPeel = (gc: GameContext, g: Geo) => {
  if (!rip15) return;
  const { ctx } = gc;
  const t = getTheme(gc.state);
  const f = Math.min(1, rip15.d / (RIP_PULL * g.s));
  const w = 80 * g.s * f, h = 100 * g.s * f;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g.kx, g.ky);
  ctx.lineTo(g.kx + w, g.ky);
  ctx.lineTo(g.kx, g.ky + h);
  ctx.closePath();
  ctx.fillStyle = t.bg;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(g.kx + w, g.ky);
  ctx.lineTo(g.kx + w * 0.30 + 10 * g.s * f, g.ky + h * 0.30 + 10 * g.s * f);
  ctx.lineTo(g.kx, g.ky + h);
  ctx.closePath();
  ctx.fillStyle = t.panelEdge;
  ctx.fill();
  ctx.strokeStyle = t.stroke;
  ctx.lineWidth = 1.5 * g.s;
  ctx.stroke();
  ctx.restore();
};

const drawSeals = (gc: GameContext, g: Geo) => {
  const { ctx } = gc;
  const t = getTheme(gc.state);
  for (const col of COLS) {
    for (let i = 0; i < 2; i++) {
      const sp = sealPos(col, i, g);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, SEAL_R * g.s, 0, Math.PI * 2);
      ctx.fillStyle = INK[col];
      ctx.fill();
      ctx.lineWidth = 2.5 * g.s;
      ctx.strokeStyle = t.stroke;
      ctx.stroke();
      if (done15[col]) {
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, (SEAL_R + 6) * g.s, 0, Math.PI * 2);
        ctx.lineWidth = 2 * g.s;
        ctx.strokeStyle = INK[col];
        ctx.stroke();
      }
    }
  }
};

// ── the level ────────────────────────────────────────────────────────────────
export const drawLevel15 = (gc: GameContext) => {
  const { ctx, state, monoFont } = gc;
  const { paperX, paperY, paperW, paperH } = getLayout(ctx);
  const t = getTheme(state);
  const g = geoOf(gc);

  if (state.levelSubPhase === 'win') {
    if (ripped15) gc.afterPanel = (gg) => drawTear(gg, geoOf(gg));
    drawWinScreen(gc, 'OUTSIDE.', 'The paper was never the boundary. That is the entire point of this institution.', 16);
    return;
  }
  if (freshEntry(gc)) {
    resetLines();
    rip15 = null;
    ripped15 = false;
    sputtered15 = false;
    bumps15 = 0;
    winAt15 = 0;
    prevDown15 = false;
    clock15.last = 0;
    clock15.elapsed = 0;
    say(gc, OPENING);
  }

  const { elapsed } = levelClock(gc, clock15);
  const live = inputOpen(gc) && !winAt15;

  // ── input: click-to-draw (touchpad friendly) or press-and-drag ─────────────
  if (!live) {
    prevDown15 = gc.mouseDown;      // frozen: swallow the edge, never act on it
  } else {
    const pt = { x: gc.mouseX, y: gc.mouseY };
    const down = gc.mouseDown && !prevDown15;
    const up   = !gc.mouseDown && prevDown15;
    prevDown15 = gc.mouseDown;

    if (down) {
      if (stroke15 && stroke15.clickMode) {
        // clicking while drawing: finish on the partner seal, abandon elsewhere
        const partner = sealPos(stroke15.color, 1 - stroke15.startIdx, g);
        const dx = pt.x - partner.x, dy = pt.y - partner.y;
        if (Math.sqrt(dx * dx + dy * dy) <= START_R * g.s) completeStroke(gc);
        else cancelStroke();
      } else if (!ripped15 && Math.hypot(pt.x - g.kx, pt.y - g.ky) < RIP_GRAB * g.s) {
        rip15 = { x0: pt.x, y0: pt.y, d: 0, t0: elapsed, follow: false };
      } else {
        const hit = sealAt(pt, START_R * g.s, g);
        if (hit) {
          paths15[hit.col] = [sealPos(hit.col, hit.i, g)];
          done15[hit.col] = false;
          stroke15 = { color: hit.col, startIdx: hit.i, t0: elapsed, moved: 0, clickMode: false };
        }
      }
    }

    if (up) {
      if (rip15 && !rip15.follow) {
        // a quick tap on the corner keeps peeling as the cursor moves, no hold needed
        if (elapsed - rip15.t0 < TAP_SECS && rip15.d < TAP_MOVE * g.s) rip15.follow = true;
        else rip15 = null;
      } else if (stroke15 && !stroke15.clickMode) {
        if (elapsed - stroke15.t0 < TAP_SECS && stroke15.moved < TAP_MOVE * g.s) stroke15.clickMode = true;
        else cancelStroke();
      }
    }

    // ── per-frame pen / peel travel ─────────────────────────────────────────
    if (rip15) {
      rip15.d = Math.hypot(pt.x - rip15.x0, pt.y - rip15.y0);
      if (rip15.d > RIP_PULL * g.s) doRip(gc);
    } else if (stroke15) {
      extendStroke(gc, g);
    }
  }

  // ── paper content ─────────────────────────────────────────────────────────
  if (!ripped15 && rip15 && rip15.d > 8 * g.s) drawPeel(gc, g);
  strokePath(gc, g);
  drawSeals(gc, g);

  ctx.fillStyle = t.fgDim;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${Math.round(11 * g.s)}px ${monoFont}`;
  ctx.fillText(`PAIRS CONNECTED: ${connected()}/4`, paperX + 22 * g.s, paperY + paperH - 10 * g.s);

  const rw = 110 * g.s, rh = 38 * g.s;
  drawButton(gc, 'RESET', paperX + paperW - 20 * g.s - rw, paperY + paperH - 8 * g.s - rh, rw, rh, () => {
    if (!inputOpen(gc) || winAt15) return;
    resetLines();
  }, 16);

  // The torn corner is painted over the item label: the Q.15 goes with it.
  if (ripped15) gc.afterPanel = (gg) => drawTear(gg, geoOf(gg));

  const dev = window as unknown as { __gc?: { lv?: Record<string, unknown> } };
  if (dev.__gc) dev.__gc.lv = {
    elapsed,
    ripped: ripped15,
    peeling: rip15 ? rip15.d : 0,
    connected: connected(),
    done: { green: done15.green, yellow: done15.yellow, red: done15.red, blue: done15.blue },
    drawing: stroke15 ? stroke15.color : null,
    clickMode: !!(stroke15 && stroke15.clickMode),
    points: stroke15 ? paths15[stroke15.color].length : 0,
    bumps: bumps15,
    sputtered: sputtered15,
    seals: {
      green:  [sealPos('green', 0, g),  sealPos('green', 1, g)],
      yellow: [sealPos('yellow', 0, g), sealPos('yellow', 1, g)],
      red:    [sealPos('red', 0, g),    sealPos('red', 1, g)],
      blue:   [sealPos('blue', 0, g),   sealPos('blue', 1, g)],
    },
    corner: { x: g.kx, y: g.ky },
    paper: { l: g.pl, t: g.pt, r: g.pr, b: g.pb },
    desk:  { l: g.oL, t: g.oT, r: g.oR, b: g.oB },
  };
};
