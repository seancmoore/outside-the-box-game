import { GameContext } from '../types';
import { getTheme }    from '../theme';
import { getLayout }   from '../layout';
import { uiScale, roundRect, getGuideTextMetrics } from '../renderer';
import { freshEntry, drawWinScreen, say, inputOpen, inRect, levelClock, wrong } from './lateralHelpers';

// ── Q33 — Misplaced ───────────────────────────────────────────────────────────
// "Some words on this page are wrong." A paragraph of Institute boilerplate has
// two or three connective words dropped into it at spots where they make no
// sense — the examiner's own remark has the holes they fell out of, rendered as
// genuinely blank space (no "______", no underline) so nothing marks where or
// how many gaps there are until you actually read for them. The paragraph also
// carries decoys: the same or similar connective words used correctly elsewhere,
// and — since gaps are matched by exact source position, not just word text —
// grabbing the right word from the wrong spot fails too. A fresh paragraph,
// wording, and answer set is drawn at random every time the level is entered.
// Accusing a word costs a heart; dragging a word into the wrong gap (or the
// wrong word into any gap) costs a heart; matching every word to its own gap
// passes the item.

interface PuzzleTemplate {
  // Paragraph text, split on spaces. The one occurrence of a word that must be
  // pulled out is wrapped {{like this}} (trailing punctuation goes outside the
  // braces); every other occurrence of the same or a similar word is a decoy
  // left exactly where it belongs.
  paragraph: string;
  // The examiner's remark, split around its gaps: segments.length === the
  // number of gaps + 1, and gap i sits between segments[i] and segments[i+1].
  segments: string[];
}

const TEMPLATES: PuzzleTemplate[] = [
  {
    paragraph:
      'The Institute of Lateral Cognition certifies candidates on the basis of demonstrated thinking, ' +
      'although each item is reviewed twice. Results are final {{because}}, and the Institute reserves ' +
      'the right to revise any verdict without notice, since appeals {{though}} are read, filed, and ' +
      'forgotten in that order.',
    segments: ['Read it like it matters, ', ' it does, ', ' it might not seem worth it.'],
  },
  {
    paragraph:
      'Every ruling of the Institute is final {{however}}, and stands until formally revised, whereas ' +
      'amendments require a fresh review. Appeals are read once, filed without comment {{nonetheless}}, ' +
      'unless the submission itself is late, and forgotten shortly after that.',
    segments: ['It is final, ', ', it stands, ', ', nothing changes that.'],
  },
  {
    paragraph:
      'The Institute certifies candidates based on demonstrated thinking, though the standard is rarely ' +
      'explained. Every verdict is provisional {{yet}}, and may be revised {{still}} without notice, even ' +
      'though appeals rarely change anything {{regardless}}, since the record is already filed.',
    segments: ['Not much changes here, ', ' it never does, ', ' nothing much moves, ', ' of what you argue.'],
  },
];

const LADDER = [
  'Wrong is not the same as misspelled. Some words are simply not where they belong.',
  'I seem to be missing a few. Look at my remarks. Look at the gaps.',
  'Match the word to its own gap, not just any orphan that looks close enough.',
];

interface Puzzle33 {
  words:       string[];   // the paragraph, tokenised
  lostIndices: number[];   // one WORDS index per gap, in gap order
  segments:    string[];
}

const norm = (word: string) => word.replace(/[^A-Za-z]/g, '').toLowerCase();

// Parses a template's {{marker}} tokens into concrete word/index pairs.
const buildPuzzle = (tpl: PuzzleTemplate): Puzzle33 => {
  const raw = tpl.paragraph.split(' ');
  const words: string[] = [];
  const lostIndices: number[] = [];
  for (const tok of raw) {
    const m = tok.match(/^\{\{(.+?)\}\}([.,;:!?]*)$/);
    if (m) {
      words.push(m[1] + m[2]);
      lostIndices.push(words.length - 1);
    } else {
      words.push(tok);
    }
  }
  return { words, lostIndices, segments: tpl.segments };
};

// A blank the same rough width as the word that belongs there — wide enough to
// read as "something is missing here", not wide enough to spell out the length
// of the answer.
const placeholderFor = (word: string) => ' '.repeat(Math.max(4, norm(word).length + 2));

interface WordRect { i: number; text: string; x: number; y: number; w: number; h: number; cx: number; cy: number; }
interface GapRect { x: number; y: number; w: number; h: number; cy: number; fontPx: number; }

let fails33   = 0;
let drag33: { i: number; x0: number; y0: number; moved: boolean } | null = null;
let wasDown33 = false;
let solvedAt33 = 0;
let hint33    = '';
let words33: WordRect[] = [];
let gapRects33: (GapRect | null)[] = [];

let puzzle33:    Puzzle33 = buildPuzzle(TEMPLATES[0]);
let placeholders33: string[] = [];
let remarkLine33: string = '';
let solved33:    boolean[] = [];

const pickPuzzle33 = () => {
  const tpl = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  puzzle33 = buildPuzzle(tpl);
  placeholders33 = puzzle33.lostIndices.map((idx) => placeholderFor(puzzle33.words[idx]));
  solved33 = puzzle33.lostIndices.map(() => false);
  let line = puzzle33.segments[0];
  for (let gi = 0; gi < puzzle33.lostIndices.length; gi++) {
    line += placeholders33[gi] + puzzle33.segments[gi + 1];
  }
  remarkLine33 = line;
};

const clock33 = { last: 0, elapsed: 0 };

// The examiner speaks his permanent line; the ladder rung rides underneath it.
const remark = (gc: GameContext, line: string) => {
  hint33 = line;
  if (line) say(gc, remarkLine33, line);
  else say(gc, remarkLine33);
};

// Deferred by a tick: the release is detected inside the draw, and wrong() ends
// with a render of its own, which must not re-enter the frame being drawn.
const failed = (gc: GameContext, line?: string) => {
  setTimeout(() => {
    if (gc.state.currentLevel !== 33 || gc.state.levelSubPhase !== 'active' || solvedAt33) return;
    fails33++;
    wrong(gc);
    const rung = line || LADDER[Math.min(fails33 - 1, LADDER.length - 1)];
    setTimeout(() => {
      if (gc.state.currentLevel === 33 && gc.state.levelSubPhase === 'active' && !solvedAt33) {
        remark(gc, rung);
        gc.render();
      }
    }, 700);
  }, 0);
};

// ── the examiner's gaps, measured inside his remarks ──────────────────────────
// drawBottomPanel draws remark line 0 with fillText(..., speechW), so an
// over-long line is condensed to exactly that width; the same factor is applied
// here so each gap lands on the blank span the panel actually drew.
const measureGaps = (gc: GameContext): (GapRect | null)[] => {
  const r = gc.chrome.remarks;
  if (!r) return puzzle33.lostIndices.map(() => null);
  const { ctx, bodyFont } = gc;
  const m = getGuideTextMetrics(ctx);
  ctx.save();
  ctx.font = `${m.fontPx}px ${bodyFont}`;
  const fullW  = ctx.measureText(remarkLine33).width;
  const squash = fullW > r.w ? r.w / fullW : 1;
  const cy = r.y + m.lineGap / 2;

  let prefix = '';
  const rects = puzzle33.lostIndices.map((_, gi) => {
    prefix += puzzle33.segments[gi];
    const preW = ctx.measureText(prefix).width * squash;
    const placeholder = placeholders33[gi];
    const gapW = ctx.measureText(placeholder).width * squash;
    prefix += placeholder;
    return { x: r.x + preW, y: cy - m.lineGap / 2, w: gapW, h: m.lineGap, cy, fontPx: m.fontPx };
  });
  ctx.restore();
  return rects;
};

const overGapRect = (x: number, y: number, s: number, g: GapRect) =>
  inRect(x, y, { x: g.x - 24 * s, y: g.y - 18 * s, w: g.w + 48 * s, h: g.h + 36 * s });

// Painted over the panel: erase the panel's blank space, draw any word already
// returned to its gap, and (only while actively dragging near it) a faint
// highlight — no persistent rule or underline giving the gap away when idle.
const paintPanel = (gc: GameContext) => {
  const { ctx, state, displayFont, bodyFont } = gc;
  const t = getTheme(state);
  const s = uiScale(ctx);
  gapRects33 = measureGaps(gc);

  gapRects33.forEach((g, gi) => {
    if (!g) return;
    const hot = !!drag33 && drag33.moved && overGapRect(gc.mouseX, gc.mouseY, s, g);
    ctx.save();
    ctx.fillStyle = t.panel;
    ctx.fillRect(g.x - 1, g.cy - g.h * 0.42, g.w + 2, g.h * 0.92);
    if (solved33[gi]) {
      ctx.fillStyle = t.accent;
      ctx.font = `italic ${g.fontPx}px ${bodyFont}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(norm(puzzle33.words[puzzle33.lostIndices[gi]]), g.x, g.cy, g.w);
    } else if (hot) {
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = t.accent;
      ctx.fillRect(g.x - 3 * s, g.cy - 11 * s, g.w + 6 * s, 19 * s);
    }
    ctx.restore();
  });

  // the lifted word, riding the cursor
  if (drag33 && drag33.moved) {
    const fontPx = Math.round(21 * s);
    const label = puzzle33.words[drag33.i];
    ctx.save();
    ctx.font = `${fontPx}px ${displayFont}`;
    const tw = ctx.measureText(label).width;
    const bw = tw + 16 * s, bh = fontPx * 1.5;
    ctx.translate(gc.mouseX, gc.mouseY);
    ctx.rotate(-3 * Math.PI / 180);
    ctx.shadowColor = 'rgba(40,25,5,0.30)';
    ctx.shadowBlur = 16 * s;
    ctx.shadowOffsetY = 8 * s;
    ctx.fillStyle = t.panel;
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 4);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = t.stroke;
    ctx.lineWidth = 1.5;
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 4);
    ctx.stroke();
    ctx.fillStyle = t.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
};

export const drawLevel33 = (gc: GameContext) => {
  const { ctx, state, displayFont, monoFont } = gc;
  const { topBoxY, topBoxWidth, topBoxHeight, w } = getLayout(ctx);
  const t  = getTheme(state);
  const s  = uiScale(ctx);
  const cx = w / 2;

  if (state.levelSubPhase === 'win') {
    gc.afterPanel = paintPanel;
    drawWinScreen(gc, 'RETURNED.', 'The words were fine. They were just in the wrong paragraph. Corporate calls that a typo.', 34);
    return;
  }
  if (freshEntry(gc)) {
    pickPuzzle33();
    fails33 = 0; drag33 = null; wasDown33 = false;
    solvedAt33 = 0; hint33 = ''; words33 = []; gapRects33 = [];
    clock33.last = 0; clock33.elapsed = 0;
    remark(gc, '');
  }
  levelClock(gc, clock33);

  // ── directive ──────────────────────────────────────────────────────────────
  ctx.fillStyle = t.fgDim;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(13 * s)}px ${monoFont}`;
  ctx.fillText('Q U A L I T Y   C O N T R O L', cx, topBoxY + topBoxHeight * 0.08);

  // ── the document: justified paragraph, one rect per word ───────────────────
  const docW = Math.min(820 * s, topBoxWidth * 0.82);
  const docX = cx - docW / 2;
  const docY = topBoxY + topBoxHeight * 0.22;
  const padX = 36 * s, padT = 28 * s, padB = 30 * s;
  const contentW = docW - padX * 2;
  const maxBottom = topBoxY + topBoxHeight - 8 * s;

  const removedIndices = new Set(puzzle33.lostIndices.filter((_, gi) => solved33[gi]));
  const visible = puzzle33.words
    .map((text, i) => ({ text, i }))
    .filter((entry) => !removedIndices.has(entry.i));

  let fontPx = Math.round(21 * s);
  let lines: { text: string; i: number; w: number }[][] = [];
  let lineH = fontPx * 1.65;
  for (let attempt = 0; attempt < 8; attempt++) {
    ctx.font = `${fontPx}px ${displayFont}`;
    const spaceW = ctx.measureText(' ').width;
    lines = [];
    let row: { text: string; i: number; w: number }[] = [];
    let rowW = 0;
    for (const entry of visible) {
      const ww = ctx.measureText(entry.text).width;
      const next = row.length ? rowW + spaceW + ww : ww;
      if (row.length && next > contentW) { lines.push(row); row = []; rowW = 0; }
      row.push({ text: entry.text, i: entry.i, w: ww });
      rowW = row.length === 1 ? ww : rowW + spaceW + ww;
    }
    if (row.length) lines.push(row);
    lineH = fontPx * 1.65;
    if (docY + padT + lines.length * lineH + padB <= maxBottom || fontPx <= 14) break;
    fontPx -= 1;
  }
  ctx.font = `${fontPx}px ${displayFont}`;
  const spaceW = ctx.measureText(' ').width;
  const docH = padT + lines.length * lineH + padB;

  ctx.fillStyle = t.bg;
  ctx.fillRect(docX, docY, docW, docH);
  ctx.strokeStyle = t.hairline;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(docX, docY, docW, docH);

  words33 = [];
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  lines.forEach((row, li) => {
    const cy = docY + padT + lineH * (li + 0.5);
    const natural = row.reduce((sum, word) => sum + word.w, 0) + spaceW * (row.length - 1);
    const justify = li < lines.length - 1 && row.length > 1;
    const gapPx = justify ? spaceW + (contentW - natural) / (row.length - 1) : spaceW;
    let x = docX + padX;
    for (const word of row) {
      words33.push({ i: word.i, text: word.text, x: x - 2 * s, y: cy - lineH * 0.42, w: word.w + 4 * s, h: lineH * 0.84, cx: x + word.w / 2, cy });
      x += word.w + gapPx;
    }
  });

  for (const wr of words33) {
    const lifted = !!drag33 && drag33.moved && drag33.i === wr.i;
    const hover = !lifted && !drag33 && inputOpen(gc) && inRect(gc.mouseX, gc.mouseY, wr);
    if (hover) {
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = t.accent;
      roundRect(ctx, wr.x, wr.y, wr.w, wr.h, 3);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = lifted ? 0.25 : 1;
    ctx.fillStyle = t.ink;
    ctx.fillText(wr.text, wr.x + 2 * s, wr.cy);
    ctx.restore();
    // cursor affordance only; picking up and dropping is polled, not clicked
    gc.hitAreas.push({ x: wr.x, y: wr.y, w: wr.w, h: wr.h, action: () => {} });
  }

  // ── pick up / carry / release (polled every frame) ─────────────────────────
  if (inputOpen(gc) && !solvedAt33) {
    if (!drag33 && gc.mouseDown && !wasDown33) {
      for (const wr of words33) {
        if (inRect(gc.mouseX, gc.mouseY, wr)) { drag33 = { i: wr.i, x0: gc.mouseX, y0: gc.mouseY, moved: false }; break; }
      }
    }
    if (drag33 && gc.mouseDown && !drag33.moved &&
        Math.hypot(gc.mouseX - drag33.x0, gc.mouseY - drag33.y0) > 6 * s) {
      drag33.moved = true;
      gc.sounds.ui('click');
    }
    if (drag33 && !gc.mouseDown) {
      const held = drag33;
      drag33 = null;
      const heldGapIdx = puzzle33.lostIndices.indexOf(held.i);
      const isAnAnswer = heldGapIdx !== -1;

      if (!held.moved) {
        // a bare click accuses the word
        if (isAnAnswer) remark(gc, 'That is one of the missing words. It is not wrong here. It just is not here.');
        else failed(gc);
      } else {
        const overIdx = gapRects33.findIndex((g, gi) => !solved33[gi] && g && overGapRect(gc.mouseX, gc.mouseY, s, g));
        if (overIdx !== -1) {
          const needIdx = puzzle33.lostIndices[overIdx];
          if (held.i === needIdx) {
            solved33[overIdx] = true;
            gc.sounds.ui('thud');
            if (solved33.every(Boolean)) {
              solvedAt33 = performance.now();
              remark(gc, '...Thank you. Those are mine.');
              setTimeout(() => {
                if (gc.state.currentLevel === 33 && gc.state.levelSubPhase === 'active') {
                  gc.state.levelSubPhase = 'win';
                  gc.render();
                }
              }, 900);
            } else {
              remark(gc, 'That one. Keep looking for the rest.');
            }
          } else if (isAnAnswer) {
            failed(gc, 'Right idea. Wrong gap.');
          } else {
            failed(gc, 'That is not my word.');
          }
        }
      }
    }
  } else if (drag33 && !gc.mouseDown) {
    drag33 = null;
  }
  wasDown33 = gc.mouseDown;

  gc.afterPanel = paintPanel;

  (gc as unknown as { lv?: Record<string, unknown> }).lv = {
    fails: fails33,
    hint: hint33,
    dragging: drag33 ? puzzle33.words[drag33.i] : '',
    moved: !!drag33 && drag33.moved,
    solved: solved33.slice(),
    elapsed: clock33.elapsed,
    lostIndices: puzzle33.lostIndices,
    firstWord: words33[0] ?? null,
    gaps: gapRects33,
  };
};
