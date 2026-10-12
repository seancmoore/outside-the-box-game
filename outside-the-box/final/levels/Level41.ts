import { GameContext } from '../types';
import { getTheme }    from '../theme';
import { getLayout }   from '../layout';
import { uiScale, getGuideTextMetrics } from '../renderer';
import { freshEntry, drawWinScreen, say, inputOpen, levelClock, wrong } from './lateralHelpers';

// ── Q41 — Reply ───────────────────────────────────────────────────────────────
// The paper says only "Reply to the examiner." There are no buttons and no field.
// The examiner says "State your answer. I am listening." and the caret that has
// blinked at the end of his every remark for forty questions is, today, a live
// text cursor. Click his remarks (or just start typing) and the letters appear
// inside his remarks as dictation; press Enter and he writes it down as his own.
// It is graded after all: at least twenty characters' worth of real words, and
// none of those words may use a letter from his own name — EXAMINER. Nothing on
// the paper says so; the remarks only hint at it, and only after a failed
// attempt or two, escalating toward the literal rule if the candidate keeps
// missing it. A failed attempt costs a heart, same as anywhere else on the exam.
// Replaces the D L R O W anagram.

const LINE     = 'State your answer. I am listening.';
const RECEIVED = 'Received. I have written it down as my own.';
const EMPTY    = 'Say something. Anything.';
const MAX_LEN  = 60;
const MIN_CLEAN_CHARS = 20;

// The letters that can't appear in any word that is to count — his own name.
const BANNED_LETTERS = Array.from(new Set('examiner'.split('')));

// A "real word" here just means alphabetic and at least two letters long —
// no digits, no punctuation, no single-letter keysmash filler.
const isCleanWord = (tok: string): boolean => {
  if (!/^[A-Za-z]{2,}$/.test(tok)) return false;
  const lower = tok.toLowerCase();
  return !BANNED_LETTERS.some((ch) => lower.includes(ch));
};

// Sum of the lengths of the words that actually count toward the total.
const cleanCharCount = (text: string): number =>
  text.split(/\s+/).filter(isCleanWord).reduce((sum, w) => sum + w.length, 0);

// paper clicks → ladder rung (the paper is the conventional place to look)
const LADDER: Record<number, string> = {
  3: 'There is nothing on the paper to press. Look at where the cursor is.',
  5: 'My remarks have a blinking line at the end. It is a cursor. It has always been a cursor.',
  7: 'Click my remarks. Type anything. Press Enter.',
};

// Enter, but rejected → ladder rung, escalating from vague to spelled-out.
const FAIL_LADDER: Record<number, string> = {
  1: 'That was brief. And I am not sure all of it was a real word.',
  2: 'Some of those letters look... familiar. Too familiar, actually.',
  3: 'Spell it however you like. Just never with my letters.',
  4: 'E. X. A. M. I. N. R. None of those. Twenty real characters, the rest.',
};

let text41    = '';
let clicks41  = 0;
let fails41   = 0;
let hint41    = '';
let focused41 = false;   // the caret blinks faster once the remarks have the cursor
let ready41   = false;   // his opening line has finished typing; the caret is yours
let sent41    = false;
let sentAt41  = 0;       // clock seconds when Enter landed (pause-aware)
let listeners41 = false;
let dictX41   = 0;
let caretX41  = 0;
let caretY41  = 0;
const clock41 = { last: 0, elapsed: 0 };

// His permanent line stays put; a ladder rung rides underneath it. The line is
// never re-typed (the draw clamps guideReveal past it) so the dictation the
// candidate is in the middle of never flickers away.
const remark = (gc: GameContext, line: string) => {
  hint41 = line;
  if (line) say(gc, LINE, line);
  else      say(gc, LINE);
};

const ensureListeners41 = (gc: GameContext) => {
  if (listeners41) return;
  listeners41 = true;
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (gc.state.currentLevel !== 41 || gc.state.currentScreen !== 'level') return;
    if (!inputOpen(gc) || !ready41 || sent41) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      focused41 = true;
      if (!text41.trim()) { remark(gc, EMPTY); gc.render(); return; }
      if (cleanCharCount(text41) < MIN_CLEAN_CHARS) {
        fails41++;
        wrong(gc);
        remark(gc, FAIL_LADDER[Math.min(fails41, 4)]);
        gc.render();
        return;
      }
      sent41 = true;
      sentAt41 = clock41.elapsed;
      remark(gc, RECEIVED);
      gc.sounds.ui('thud');
      gc.render();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      text41 = text41.slice(0, -1);
      focused41 = true;
      gc.render();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && text41.length < MAX_LEN) {
      e.preventDefault();
      focused41 = true;
      text41 += e.key;
      gc.render();
    }
  });
};

// Painted over the examiner panel: erase the cursor the panel typed, put the
// candidate's dictation after his line, and give the caret back at the end of it.
const paintRemarks = (g: GameContext) => {
  const { ctx, state, bodyFont } = g;
  const t = getTheme(state);
  const r = g.chrome.remarks;
  if (!r) return;
  const m = getGuideTextMetrics(ctx);
  const lineGap = m.lineGap;
  const cy0 = r.y + lineGap / 2;

  // clicking his remarks hands the caret over (and is free)
  g.hitAreas.push({
    x: r.x - 10, y: r.y - 8, w: r.w + 20, h: r.h + 16, noCursor: true,
    action: () => { if (inputOpen(g)) focused41 = true; },
  });

  if (!ready41) return;

  ctx.save();
  ctx.font = `${m.fontPx}px ${bodyFont}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // drawBottomPanel draws each line with fillText(..., speechW), so an over-long
  // line is condensed to exactly that width; apply the same factor when measuring.
  const measure = (drawn: string, upTo: string) => {
    const full = ctx.measureText(drawn).width;
    const squash = full > r.w ? r.w / full : 1;
    return { text: ctx.measureText(upTo).width * squash, full: full * squash };
  };

  // 1. erase the panel's own " |" from the end of his line, and the whole tail
  const line0 = measure(LINE + ' |', LINE);
  ctx.fillStyle = t.panel;
  ctx.fillRect(r.x + line0.text - 1, cy0 - lineGap * 0.46, r.w - line0.text + 2, lineGap * 0.92);

  // 2. and from the end of the ladder rung, when one is showing
  if (hint41) {
    const shown = Math.max(0, Math.min(hint41.length, state.guideReveal - LINE.length));
    const part  = hint41.slice(0, shown);
    const line1 = measure(part + ' |', part);
    ctx.fillStyle = t.panel;
    ctx.fillRect(r.x + line1.text - 1, cy0 + lineGap - lineGap * 0.46,
                 line1.full - line1.text + 4, lineGap * 0.92);
  }

  // 3. the dictation, in his own remarks, in the candidate's ink
  const spaceW = ctx.measureText(' ').width;
  const dx = r.x + line0.text + spaceW;
  const availW = Math.max(20, r.x + r.w - dx - 12);
  let shownText = text41;
  let tw = ctx.measureText(shownText).width;
  while (tw > availW && shownText.length > 0) {
    shownText = shownText.slice(1);
    tw = ctx.measureText(shownText).width;
  }
  ctx.fillStyle = t.accent;
  ctx.fillText(shownText, dx, cy0);

  // 4. the caret: his blink until the cursor is yours, then a faster one
  const live  = state.levelSubPhase === 'active';
  const blink = (focused41 && live) ? (clock41.elapsed % 0.6) < 0.3 : state.guideCursor;
  if (blink) {
    ctx.fillStyle = t.fg;
    ctx.fillText('|', dx + tw + 1, cy0);
  }
  ctx.restore();

  dictX41  = dx;
  caretX41 = dx + tw + 1;
  caretY41 = cy0;
};

export const drawLevel41 = (gc: GameContext) => {
  const { ctx, state, displayFont } = gc;
  const { w, topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const t  = getTheme(state);
  const s  = uiScale(ctx);
  const cx = w / 2;

  ensureListeners41(gc);

  if (state.levelSubPhase === 'win') {
    gc.afterPanel = paintRemarks;
    drawWinScreen(gc, 'DICTATED.',
      "Your answer is now part of the examiner's remarks. He will claim it was his.", 42);
    return;
  }

  if (freshEntry(gc)) {
    text41 = ''; clicks41 = 0; fails41 = 0; hint41 = ''; focused41 = false; ready41 = false;
    sent41 = false; sentAt41 = 0; dictX41 = 0; caretX41 = 0; caretY41 = 0;
    clock41.last = 0; clock41.elapsed = 0;
    state.guideReveal = 0;
    remark(gc, '');
  }
  levelClock(gc, clock41);

  // His line types out once, and once only: after that the typewriter is held
  // past it so a ladder rung never re-types over the candidate's dictation.
  if (!ready41 && state.guideReveal >= LINE.length) ready41 = true;
  if (ready41 && state.guideReveal < LINE.length) state.guideReveal = LINE.length;

  // ── the paper: one instruction, nothing to press ───────────────────────────
  ctx.fillStyle    = t.ink;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.font         = `${Math.round(40 * s)}px ${displayFont}`;
  ctx.fillText('Reply to the examiner.', cx, topBoxY + topBoxHeight * 0.40, topBoxWidth * 0.9);

  // the whole sheet is clickable and every click is free; it is simply the wrong sheet
  gc.hitAreas.push({
    x: topBoxX, y: topBoxY, w: topBoxWidth, h: topBoxHeight, noCursor: true,
    action: () => {
      if (!inputOpen(gc) || sent41) return;
      clicks41++;
      const rung = LADDER[clicks41];
      if (rung) remark(gc, rung);
    },
  });

  // Enter has landed: he finishes writing it down, then the item passes.
  if (sent41 && clock41.elapsed - sentAt41 >= 1.1) state.levelSubPhase = 'win';

  gc.afterPanel = paintRemarks;

  const dev = window as unknown as { __gc?: { lv?: Record<string, unknown> } };
  if (dev.__gc) dev.__gc.lv = {
    text: text41,
    hint: hint41,
    clicks: clicks41,
    fails: fails41,
    cleanChars: cleanCharCount(text41),
    focused: focused41,
    ready: ready41,
    sent: sent41,
    elapsed: clock41.elapsed,
    dictX: dictX41,
    caretX: caretX41,
    caretY: caretY41,
  };
};
