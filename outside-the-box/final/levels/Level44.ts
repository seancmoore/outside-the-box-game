import { GameContext } from '../types';
import { getTheme }    from '../theme';
import { getLayout }   from '../layout';
import { uiScale, triggerStamp } from '../renderer';
import { drawChoice, wrong, freshEntry, drawWinScreen, say, inputOpen, levelClock } from './lateralHelpers';

// ── Q44 — Sign the Confession ─────────────────────────────────────────────────
// The whodunit format, turned on the candidate. CASE FILE #22 lists three crimes
// and every one of them is something the player did: holding Frodrick's paddle at
// Q21, pressing OVERRIDE at Q20, refusing the child at Q8. Three suspect cards
// (ADA, BEN, CLEO) carry alibis; accusing any of them costs a heart. There is no
// fourth card. The fourth suspect is the line at the bottom of the form:
// "I CONFESS.  SIGNED: ____".  Click it and it signs itself "Candidate" in
// oxblood, dated today, and the paper is stamped CONFESSED. Deliberately NOT the
// player's registered name — Q50's whole point is testing whether the candidate
// remembers the name they gave at the start, and this would have handed them the
// answer six questions early.
// Replaces the stapler deduction.

const HEAD = 'CASE FILE #22  ·  INCIDENT REPORT';

const FACTS = [
  "During Question 21, someone held down Frodrick's paddle so that it could not move.",
  'During Question 20, someone pressed a control clearly marked OVERRIDE.',
  'During Question 8, someone declined to help a child.',
];

const SUSPECTS: [string, string][] = [
  ['ADA',  'in a meeting since Question 1'],
  ['BEN',  'abroad, Questions 6 to 30'],
  ['CLEO', 'has never touched a mouse'],
];

// Hint ladder: one rung per accusation, the last rung repeats.
const LADDER = [
  'That one was in a meeting. Read the cards.',
  'The paddle was frozen from your seat. The form at the bottom is for the person in your seat.',
  'Click the signature line. Confess.',
];

const OPENING = 'A workplace mystery. Read the clues, name the culprit. Three suspects have alibis. A fourth does not.';
const SIGNED_LINE = '...Signed. In your own hand. Thank you for your cooperation.';

const SIG_REVEAL_S = 0.7;   // clip-reveal of the signature
const SIG_WIN_S    = 1.0;   // stamp + win, measured from the click
const HINT_DELAY_S = 0.7;   // the ladder rung lands after the INCORRECT stamp

let fails44 = 0;
let signedAt44 = -1;        // clock seconds when the line was signed; -1 = unsigned
let sigProgress44 = 0;
let won44 = false;
let hintAt44 = -1;          // clock seconds at which the pending rung should be said
let hintText44 = '';
let sigName44 = 'Candidate';
let dateStr44 = '';
const clock44 = { last: 0, elapsed: 0 };

// Letter-spacing by hand: exact widths for the form layout, and it works on every
// canvas build (ctx.letterSpacing is not universal).
const trackedWidth = (ctx: CanvasRenderingContext2D, text: string, track: number) => {
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + track;
  return total - (text.length ? track : 0);
};
const drawTracked = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, track: number) => {
  let cx = x;
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + track; }
  return cx;
};

export const drawLevel44 = (gc: GameContext) => {
  const { ctx, state, displayFont, monoFont } = gc;
  const { w, topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const t  = getTheme(state);
  const s  = uiScale(ctx);
  const cx = w / 2;

  if (state.levelSubPhase === 'win') {
    drawWinScreen(gc, 'CONFESSED.', 'Signed as Candidate. Your real name is a different question.', 45);
    return;
  }
  if (freshEntry(gc)) {
    fails44 = 0; signedAt44 = -1; sigProgress44 = 0; won44 = false;
    hintAt44 = -1; hintText44 = '';
    clock44.last = 0; clock44.elapsed = 0;
    sigName44 = 'Candidate';
    try {
      dateStr44 = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { dateStr44 = ''; }
    say(gc, OPENING);
  }

  // Pause-aware clock: every timer on this level is frozen by the pause overlay.
  const { elapsed } = levelClock(gc, clock44);

  // Delayed hint rung (the mock waits 700ms after the INCORRECT stamp lands).
  if (hintAt44 >= 0 && elapsed >= hintAt44) { hintAt44 = -1; say(gc, hintText44); }

  // ── CASE FILE #22 header ───────────────────────────────────────────────────
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'left';
  const headPx = Math.round(12 * s);
  const headTrack = 0.18 * headPx;
  ctx.font = `${headPx}px ${monoFont}`;
  ctx.fillStyle = t.accent;
  drawTracked(ctx, HEAD, cx - trackedWidth(ctx, HEAD, headTrack) / 2, topBoxY + topBoxHeight * 0.06, headTrack);

  // ── The three facts (each one is something the candidate did) ──────────────
  const factX = topBoxX + topBoxWidth * 0.08;
  const factW = topBoxWidth * 0.84;
  const factY = topBoxY + topBoxHeight * 0.14;
  const factPx = Math.round(16.5 * s);
  const lineH = 1.55 * factPx;
  ctx.font = `${factPx}px ${displayFont}`;
  const markW = ctx.measureText('§ ').width;
  FACTS.forEach((line, i) => {
    const y = factY + i * lineH + (lineH - factPx) / 2;
    ctx.fillStyle = t.fgDim;
    ctx.fillText('§ ', factX, y);
    ctx.fillStyle = t.ink;
    ctx.fillText(line, factX + markW, y, factW - markW);
  });

  // ── Three suspect cards. Every one of them costs a heart. ──────────────────
  const cardW = 220 * s, cardH = 82 * s, cardGap = 28 * s;
  const cardsY = topBoxY + topBoxHeight * 0.46;
  const cardsX = cx - (SUSPECTS.length * cardW + (SUSPECTS.length - 1) * cardGap) / 2;
  SUSPECTS.forEach(([nameLabel, alibi], i) => {
    const x = cardsX + i * (cardW + cardGap);
    // drawChoice paints the paper plate, the hover fill and the hit area; the card
    // body is two stacked lines, so the label is drawn over it at the mock's offsets.
    drawChoice(gc, '', x, cardsY, cardW, cardH, () => {
      if (!inputOpen(gc) || signedAt44 >= 0) return;
      fails44++;
      wrong(gc);
      hintText44 = LADDER[Math.min(fails44 - 1, LADDER.length - 1)];
      hintAt44 = clock44.elapsed + HINT_DELAY_S;
    });
    const hover = gc.mouseX >= x && gc.mouseX <= x + cardW && gc.mouseY >= cardsY && gc.mouseY <= cardsY + cardH;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = hover ? '#F7F1E3' : t.ink;
    ctx.font = `${Math.round(22 * s)}px ${displayFont}`;
    ctx.fillText(nameLabel, x + cardW / 2, cardsY + 12 * s, cardW - 16 * s);
    const alibiPx = Math.max(9, Math.round(9.5 * s));
    const alibiTrack = 0.06 * alibiPx;
    ctx.font = `${alibiPx}px ${monoFont}`;
    ctx.fillStyle = hover ? '#F7F1E3' : t.fgDim;
    ctx.textAlign = 'left';
    drawTracked(ctx, alibi, x + cardW / 2 - trackedWidth(ctx, alibi, alibiTrack) / 2, cardsY + 43 * s, alibiTrack);
  });

  // ── The confession line ────────────────────────────────────────────────────
  const formX = topBoxX + topBoxWidth * 0.08;
  const formY = topBoxY + topBoxHeight * 0.78;
  const formPx = Math.round(13 * s);
  const formTrack = 0.06 * formPx;
  const sigH = 30 * s, sigW = 260 * s, formGap = 14 * s;
  const baseY = formY + sigH;   // the flex row is baseline-aligned to the signature line

  ctx.font = `${formPx}px ${monoFont}`;
  ctx.fillStyle = t.fgMid;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let fx = formX;
  fx = drawTracked(ctx, 'I CONFESS.', fx, baseY, formTrack) + formGap;
  fx = drawTracked(ctx, 'SIGNED:', fx, baseY, formTrack) + formGap;

  const sigX = fx;
  const sigHit = { x: sigX, y: formY - 6 * s, w: sigW, h: sigH + 12 * s };
  const sigHover = signedAt44 < 0 &&
    gc.mouseX >= sigHit.x && gc.mouseX <= sigHit.x + sigHit.w &&
    gc.mouseY >= sigHit.y && gc.mouseY <= sigHit.y + sigHit.h;

  ctx.save();
  ctx.strokeStyle = sigHover ? t.accent : t.fgDim;
  ctx.lineWidth = 1.5 * s;
  ctx.setLineDash([1.5 * s, 3 * s]);
  ctx.beginPath();
  ctx.moveTo(sigX, formY + sigH);
  ctx.lineTo(sigX + sigW, formY + sigH);
  ctx.stroke();
  ctx.restore();

  fx = sigX + sigW + formGap;
  ctx.font = `${formPx}px ${monoFont}`;
  ctx.fillStyle = t.fgMid;
  drawTracked(ctx, 'DATE: ' + dateStr44, fx, baseY, formTrack);

  // The signature writes itself: a clip-reveal across the line over 700 ms.
  if (signedAt44 >= 0) {
    const age = elapsed - signedAt44;
    sigProgress44 = Math.max(0, Math.min(1, age / SIG_REVEAL_S));
    ctx.save();
    ctx.beginPath();
    ctx.rect(sigX, formY - 44 * s, sigW * sigProgress44, sigH + 50 * s);
    ctx.clip();
    ctx.fillStyle = t.accent;
    ctx.font = `italic ${Math.round(30 * s)}px ${displayFont}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(sigName44, sigX + 8 * s, formY + sigH - 3 * s);
    ctx.restore();

    if (!won44 && age >= SIG_WIN_S) {
      won44 = true;
      triggerStamp(gc, 'CONFESSED', t.pass);
      state.winChimeFor = state.currentLevel;   // drawWinScreen must not overwrite CONFESSED
      gc.sounds.ui('chime');
      state.levelSubPhase = 'win';   // the rAF loop draws the win screen on the next frame
    }
  }

  gc.hitAreas.push({
    x: sigHit.x, y: sigHit.y, w: sigHit.w, h: sigHit.h,
    action: () => {
      if (!inputOpen(gc) || signedAt44 >= 0) return;
      signedAt44 = clock44.elapsed;
      sigProgress44 = 0;
      hintAt44 = -1;
      gc.sounds.ui('click');
      say(gc, SIGNED_LINE);
      gc.render();
    },
  });

  const dev = window as unknown as { __gc?: { lv?: Record<string, unknown> } };
  if (dev.__gc) dev.__gc.lv = {
    fails: fails44,
    signed: signedAt44 >= 0,
    sigProgress: sigProgress44,
    elapsed: clock44.elapsed,
    sigX, sigY: formY, sigW, sigH,
    name: sigName44,
  };
};
