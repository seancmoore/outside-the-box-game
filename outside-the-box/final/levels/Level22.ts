import { GameContext } from '../types';
import { getTheme }    from '../theme';
import { getLayout }   from '../layout';
import { drawButton, uiScale } from '../renderer';
import { freshEntry, drawWinScreen, say, wrong, inputOpen, levelClock } from './lateralHelpers';

// ── Q22 — Did You Catch That ─────────────────────────────────────────────────
// The paper says only "Stay alert." for a random three to eight seconds, then a
// ten digit number flashes for three quarters of a second, then ten empty slots
// ask for it back. Nobody memorises ten digits in 750ms. The trick is the pause
// button: pausing freezes the flash timer, and the pause panel itself goes
// see-through over the flash so the digits stay readable behind it, letting the
// candidate copy them at leisure. Pausing mid flash retitles the notice
// EXAMINATION SUSPENDED (CONVENIENT), and on resume the examiner admits he saw.
// The level cannot be won without having paused during a flash at least once —
// "correctly" typing the code from an honest glance is never actually possible
// in 750ms, so a clean answer that never used the pause trick is rejected too.

const CODE_LEN = 10;
const FLASH_MS = 750;

const LADDER = [
  "Fast, wasn't it. If only there were a way to stop time.",
  'The pause button is right there, candidate. I am not supposed to say that.',
];

const OPENING = 'did you catch that??';
const CAUGHT  = 'did you catch that?? You paused. I saw.';
const NEVER_PAUSED = 'That number... you never once stopped time to look at it. I do not believe you.';

// ── Module state — also the test hook object (window.__gc.lv) ────────────────
// The same object is handed to the harness every frame, so a test can write
// lv22.forceWaitMs / lv22.waitMs (the ?wait= idea from the mock) and have it stick.
const lv22 = {
  phase: 'waiting' as 'waiting' | 'flash' | 'input',
  code: '',
  input: '',
  elapsed: 0,        // ms spent in the current phase (frozen while paused)
  waitMs: 5000,      // this attempt's random wait
  forceWaitMs: 0,    // debug override: fixed wait for every attempt
  flashMs: FLASH_MS,
  misses: 0,
  pausedInFlash: false,
  pausedInFlashEver: false,   // persists across attempts — gates the win
};

const clock22 = { last: 0, elapsed: 0 };
let prevPaused22 = false;
let lightsOn22 = false;
let listenersAdded22 = false;
let urlWaitRead22 = false;

const genCode = () => {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += Math.floor(Math.random() * 10);
  return s;
};

const randWait = () => (lv22.forceWaitMs > 0 ? lv22.forceWaitMs : 3000 + Math.random() * 5000);

const newAttempt22 = () => {
  lv22.code = genCode();
  lv22.waitMs = randWait();
  lv22.input = '';
  lv22.elapsed = 0;
  lv22.pausedInFlash = false;
  lv22.phase = 'waiting';
};

function submitAnswer22(gc: GameContext): void {
  if (lv22.phase !== 'input' || lv22.input.length !== CODE_LEN) return;
  if (!inputOpen(gc)) return;

  if (lv22.input === lv22.code) {
    if (!lv22.pausedInFlashEver) {
      // Correct digits, but never actually paused to read them — not a legitimate
      // catch. Treated the same as a wrong answer: it costs a life too.
      lv22.misses++;
      wrong(gc);
      say(gc, NEVER_PAUSED);
      newAttempt22();
      gc.render();
      return;
    }
    gc.state.levelSubPhase = 'win';
    gc.render();
    return;
  }

  lv22.misses++;
  wrong(gc);
  say(gc, LADDER[Math.min(lv22.misses, LADDER.length) - 1]);
  newAttempt22();
  gc.render();
}

function ensureListeners22(gc: GameContext): void {
  if (listenersAdded22) return;
  listenersAdded22 = true;
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const st = gc.state;
    if (st.currentLevel !== 22 || st.currentScreen !== 'level') return;
    if (lv22.phase !== 'input') return;
    if (!inputOpen(gc)) return;

    if (e.key === 'Backspace') {
      lv22.input = lv22.input.slice(0, -1);
      e.preventDefault();
      gc.render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitAnswer22(gc);
    } else if (/^[0-9]$/.test(e.key) && lv22.input.length < CODE_LEN) {
      lv22.input += e.key;
      e.preventDefault();
      gc.render();
    }
  });
}

// The ten flashed digits, spread evenly across `innerW` centred on `cx`.
const drawDigits22 = (
  gc: GameContext, code: string, cx: number, y: number, innerW: number, fontPx: number, color: string,
) => {
  const { ctx, displayFont } = gc;
  ctx.fillStyle    = color;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font         = `bold ${fontPx}px ${displayFont}`;
  const x0 = cx - innerW / 2;
  for (let i = 0; i < CODE_LEN; i++) {
    ctx.fillText(code[i] ?? '', x0 + (innerW * (i + 1)) / (CODE_LEN + 1), y);
  }
};

export const drawLevel22 = (gc: GameContext) => {
  ensureListeners22(gc);

  const { ctx, state, displayFont, bodyFont } = gc;
  const { w, topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const t  = getTheme(state);
  const s  = uiScale(ctx);
  const cx = w / 2;
  const cy = topBoxY + topBoxHeight * 0.5;

  if (state.levelSubPhase === 'win') {
    if (lightsOn22) { lightsOn22 = false; gc.sounds.stop('allOfTheLights'); }
    drawWinScreen(gc, 'CORRECT!', 'Sharp eyes. Or a quick thumb on the pause button. I do not judge.', 23);
    return;
  }

  if (freshEntry(gc)) {
    if (!urlWaitRead22) {
      urlWaitRead22 = true;
      const q = Number(new URLSearchParams(window.location.search).get('wait'));
      if (q > 0) lv22.forceWaitMs = q;
    }
    lv22.misses = 0;
    lv22.pausedInFlashEver = false;
    newAttempt22();
    clock22.last = 0;
    clock22.elapsed = 0;
    prevPaused22 = false;
    lightsOn22 = false;
    say(gc, OPENING);
  }

  // Test hook: the same object every frame so writes from the harness survive.
  const dev = window as unknown as { __gc?: { lv?: unknown } };
  if (dev.__gc) dev.__gc.lv = lv22;

  // ── Pause / resume edges ───────────────────────────────────────────────────
  const frozen = state.paused || state.controlsOpen || state.gameOver;
  if (state.paused && !prevPaused22 && lv22.phase === 'flash') {
    lv22.pausedInFlash = true;
    lv22.pausedInFlashEver = true;   // sticks for the rest of the level — gates the win
  }
  if (!state.paused && prevPaused22 && lv22.pausedInFlash) {
    lv22.pausedInFlash = false;
    say(gc, CAUGHT);
  }
  prevPaused22 = state.paused;

  // The suspension notice admits what it is doing for you.
  state.pauseCartouche = lv22.phase === 'flash' ? 'Examination Suspended (convenient)' : undefined;
  // And it goes see-through over a flash, so pausing genuinely reveals the digits
  // rather than just freezing them off-screen.
  state.pauseTransparent = lv22.phase === 'flash';

  // ── Phase clock (levelClock hands back dt = 0 while paused) ────────────────
  const { dt } = levelClock(gc, clock22);
  if (lv22.phase === 'waiting' || lv22.phase === 'flash') {
    lv22.elapsed += dt * 1000;
    if (lv22.phase === 'waiting' && lv22.elapsed >= lv22.waitMs) {
      lv22.phase = 'flash';
      lv22.elapsed = 0;
    } else if (lv22.phase === 'flash' && lv22.elapsed >= lv22.flashMs) {
      lv22.phase = 'input';
      lv22.elapsed = 0;
      lv22.input = '';
      lv22.pausedInFlash = false;
    }
  }

  // A single second of "All of the Lights" rides the flash, and stops with it.
  const wantLights = lv22.phase === 'flash' && !frozen;
  if (wantLights && !lightsOn22) {
    lightsOn22 = true;
    gc.sounds.play('allOfTheLights', { loop: true, volume: 0.85, restart: true });
  } else if (!wantLights && lightsOn22) {
    lightsOn22 = false;
    gc.sounds.stop('allOfTheLights');
  }

  // ── Waiting: the paper says nothing useful ─────────────────────────────────
  if (lv22.phase === 'waiting') {
    ctx.fillStyle    = t.fgDim;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `${Math.round(18 * s)}px ${bodyFont}`;
    ctx.fillText('Stay alert.', cx, cy);
  }

  // ── Flash: giant digits, pulsing tint, MEMORISE NOW ───────────────────────
  // Kept drawing while paused too (frozen, since dt is 0) — the pause panel
  // over it goes see-through (state.pauseTransparent) so this is exactly what
  // reading through the "suspended" notice reveals.
  if (lv22.phase === 'flash') {
    const k = 0.75 + 0.25 * Math.sin((lv22.elapsed / 500) * Math.PI * 2);
    ctx.fillStyle = state.darkMode ? `rgba(255,255,255,${0.08 * k})` : `rgba(0,0,0,${0.08 * k})`;
    ctx.fillRect(topBoxX, topBoxY, topBoxWidth, topBoxHeight);

    drawDigits22(gc, lv22.code, cx, cy - 22 * s, topBoxWidth - 80 * s, Math.round(80 * s), t.ink);

    ctx.fillStyle    = t.seal;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `bold ${Math.round(14 * s)}px ${bodyFont}`;
    ctx.fillText('MEMORISE NOW', cx, cy + 42 * s);
  }

  // ── Input: ten slots, SUBMIT once they are full ───────────────────────────
  if (lv22.phase === 'input') {
    ctx.fillStyle    = t.fgMid;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `${Math.round(18 * s)}px ${bodyFont}`;
    ctx.fillText('Enter the sequence you saw:', cx, cy - 107 * s);

    const boxW  = topBoxWidth * 0.72;
    const boxH  = 64 * s;
    const boxX  = cx - boxW / 2;
    const boxY  = cy - boxH * 0.58;
    const slotW = boxW / CODE_LEN;

    ctx.strokeStyle = t.stroke;
    ctx.lineWidth   = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    for (let i = 0; i < CODE_LEN; i++) {
      const sx = boxX + slotW * i;
      if (i > 0) {
        ctx.strokeStyle = t.hairline;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(sx, boxY + 6);
        ctx.lineTo(sx, boxY + boxH - 6);
        ctx.stroke();
      }

      const charCx = sx + slotW / 2;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.font         = `bold ${Math.round(34 * s)}px ${displayFont}`;

      if (i < lv22.input.length) {
        ctx.fillStyle = t.ink;
        ctx.fillText(lv22.input[i], charCx, boxY + boxH / 2);
      } else if (i === lv22.input.length) {
        // Caret on the next empty slot. Frozen (solid) while the exam is suspended.
        const blink = frozen || Math.floor(clock22.elapsed / 0.53) % 2 === 0;
        if (blink) {
          ctx.strokeStyle = t.ink;
          ctx.lineWidth   = 2;
          ctx.beginPath();
          ctx.moveTo(charCx, boxY + boxH / 2 - 18 * s);
          ctx.lineTo(charCx, boxY + boxH / 2 + 18 * s);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = t.hairline;
        ctx.fillText('_', charCx, boxY + boxH / 2 + 8 * s);
      }
    }

    if (lv22.input.length === CODE_LEN) {
      drawButton(gc, 'SUBMIT →', cx - 85 * s, cy + 34 * s, 170 * s, 46 * s, () => {
        submitAnswer22(gc);
      }, 18);
    }

    ctx.fillStyle    = t.fgDim;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `${Math.round(10 * s)}px ${bodyFont}`;
    ctx.fillText('type digits 0-9   ·   Backspace to erase   ·   Enter to submit',
      cx, topBoxY + topBoxHeight * 0.92);
  }

};
