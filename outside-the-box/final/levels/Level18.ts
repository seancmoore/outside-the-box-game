import { GameContext } from '../types';
import { getTheme }    from '../theme';
import { getLayout }   from '../layout';
import { drawButton, uiScale } from '../renderer';
import { wrong, freshEntry, drawWinScreen, say, inputOpen, levelClock, drawTypeIn } from './lateralHelpers';

// ── Q18 — Binary Logic ────────────────────────────────────────────────────────
// The paper shows "1 + 1 = ?" and a blank to write in. Nothing else: the base-2
// fine print is gone, and so are the multiple-choice buttons. The opening line
// only gestures at there being more than one way to write the answer, rather
// than naming binary outright — the explicit "the machine counts in binary"
// nudge is held back as a later miss-ladder rung instead. Type 2 (the
// conventional answer) and it slams INCORRECT. Type 10 and it passes, because
// that is the only language the grader speaks.

const CORRECT18 = '10';
const MAXLEN18  = 6;

const OPENING = [
  'Simple arithmetic. One plus one.',
  'Well. Just how many ways can you add one and one?',
  'Everything on this exam is binary, when you get down to it. Correct, or incorrect. I sometimes wish the rest of life were that simple.',
];

const LINE_TWO      = 'Two. The machine disagrees. It only knows two digits.';
const LINE_CLOSE    = 'Close. Write it the way the machine would.';
const LINE_MISS_1   = 'That is not even close.';
const LINE_MISS_2   = 'One plus one. Think like the machine. It has exactly two digits to work with.';

let value18   = '';
let focused18 = true;
let fails18   = 0;
let listeners18 = false;
const clock18 = { last: 0, elapsed: 0 };

// letter-spacing for the mono form instruction (mirrors the renderer's helper)
const withTracking18 = (ctx: CanvasRenderingContext2D, px: number, fn: () => void) => {
  const c = ctx as unknown as { letterSpacing?: string };
  const prev = c.letterSpacing;
  try { c.letterSpacing = `${px}px`; } catch { /* unsupported — ignore */ }
  try { fn(); } finally { try { c.letterSpacing = prev ?? '0px'; } catch { /* ignore */ } }
};

const submit18 = (gc: GameContext) => {
  if (!inputOpen(gc)) return;
  const v = value18.trim();
  if (!v) return;

  if (v === CORRECT18) {
    value18 = '';
    gc.state.levelSubPhase = 'win';
    gc.render();
    return;
  }

  value18 = '';
  fails18++;
  wrong(gc);
  if (v === '2') say(gc, LINE_TWO);
  else if (/^0b?10$/i.test(v) || v.toLowerCase() === 'ten') say(gc, LINE_CLOSE);
  else say(gc, fails18 < 2 ? LINE_MISS_1 : LINE_MISS_2);
  focused18 = true;
  gc.render();
};

const ensureListeners18 = (gc: GameContext) => {
  if (listeners18) return;
  listeners18 = true;
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (gc.state.currentLevel !== 18 || gc.state.currentScreen !== 'level') return;
    if (!inputOpen(gc) || !focused18) return;

    if (e.key === 'Enter') { e.preventDefault(); submit18(gc); return; }
    if (e.key === 'Backspace') { e.preventDefault(); value18 = value18.slice(0, -1); gc.render(); return; }
    if (e.key.length === 1 && value18.length < MAXLEN18) {
      if (e.key === ' ') e.preventDefault();
      value18 += e.key;
      gc.render();
    }
  });
};

export const drawLevel18 = (gc: GameContext) => {
  ensureListeners18(gc);

  const { ctx, state, displayFont, monoFont } = gc;
  const { w, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const t  = getTheme(state);
  const s  = uiScale(ctx);
  const cx = w / 2;

  if (state.levelSubPhase === 'win') {
    drawWinScreen(gc, 'TEN.', 'One plus one is 10. In the only language the grader speaks.', 19);
    return;
  }
  if (freshEntry(gc)) {
    value18 = '';
    focused18 = true;
    fails18 = 0;
    clock18.last = 0;
    clock18.elapsed = 0;
    say(gc, ...OPENING);
  }

  // pause-aware level clock: nothing on this item is timed, but it must freeze
  // with the rest of the level while the exam is suspended.
  levelClock(gc, clock18);

  // ── the sum ────────────────────────────────────────────────────────────────
  ctx.fillStyle    = t.ink;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font         = `bold ${Math.round(72 * s)}px ${displayFont}`;
  ctx.fillText('1  +  1  =  ?', cx, topBoxY + topBoxHeight * 0.27, topBoxWidth * 0.9);

  // ── the blank ──────────────────────────────────────────────────────────────
  const fieldW = Math.round(260 * s);
  const fieldH = Math.round(58 * s);
  const fieldX = cx - fieldW / 2;
  const fieldY = topBoxY + topBoxHeight * 0.52;
  drawTypeIn(gc, fieldX, fieldY, fieldW, fieldH, value18, focused18, '…', () => {
    if (!inputOpen(gc)) return;
    focused18 = true;
    gc.render();
  }, { fontSize: 30, center: true });
  // the mock's placeholder stays visible in the focused-but-empty blank
  if (!value18.length) {
    ctx.fillStyle    = t.hairline;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `${Math.round(30 * s)}px ${displayFont}`;
    ctx.fillText('…', fieldX + fieldW / 2, fieldY + fieldH / 2);
  }

  // ── submit ─────────────────────────────────────────────────────────────────
  const btnW = Math.round(200 * s);
  const btnH = Math.round(48 * s);
  const btnX = cx - btnW / 2;
  const btnY = topBoxY + topBoxHeight * 0.74;
  drawButton(gc, 'SUBMIT  →', btnX, btnY, btnW, btnH, () => {
    focused18 = true;
    submit18(gc);
  }, 18);

  // ── form instruction ───────────────────────────────────────────────────────
  ctx.fillStyle = t.fgDim;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(10 * s)}px ${monoFont}`;
  withTracking18(ctx, 1.4 * s, () =>
    ctx.fillText('WRITE YOUR ANSWER IN THE SPACE PROVIDED', cx, topBoxY + topBoxHeight * 0.925, topBoxWidth * 0.9));

  const dev = window as unknown as { __gc?: { lv?: Record<string, unknown> } };
  if (dev.__gc) dev.__gc.lv = {
    value: value18,
    focused: focused18,
    fails: fails18,
    elapsed: clock18.elapsed,
    fieldX, fieldY, fieldW, fieldH,
    btnX, btnY, btnW, btnH,
  };
};
