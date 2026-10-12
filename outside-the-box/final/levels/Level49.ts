import { GameContext } from '../types';
import { getTheme }    from '../theme';
import { getLayout }   from '../layout';
import { uiScale }     from '../renderer';
import { drawChoice, freshEntry, drawWinScreen, wrong, say, inputOpen, levelClock } from './lateralHelpers';

// ── Q49 — The Lock ────────────────────────────────────────────────────────────
// The last lock before the end. Three tumbler dials, and every digit is an answer
// the candidate already gave somewhere earlier in the exam. The three clues are
// drawn at random from a pool of twenty callbacks spanning the whole paper, in a
// random order, so the combination is different on every entry.
//
// Quirks kept from the mock: the mouse wheel spins a dial while the pointer is
// over its digit window; the examiner turns to face each dial as it lands on its
// digit; the paper's cartouche flips to COMBINATION once all three are right.

type Clue = readonly [string, number];

const POOL: Clue[] = [
  ['the face you turned up on the loaded die (Q13)', 6],
  ['how many hearts the entry fee charged you (Q42)', 1],
  ['how many digits "1 + 1" had in binary (Q18)', 2],
  ['points needed to beat Frodrick at pong (Q6)', 3],
  ['the number you clicked after erasing every F (Q7)', 0],
  ['the answer to the calculus item (Q9)', 9],
  ['seconds on the clock you were told to do nothing about (Q17)', 7],
  ['stamps on the desk at your self-assessment (Q29)', 2],
  ['hearts in your HUD the day one did not belong (Q34)', 4],
  ['rounds of the institutional Simon (Q35)', 3],
  ['buttons printed on the trimmed page, counting the one past the trim (Q37)', 5],
  ['buttons on your mouse (Q38)', 2],
  ['the alphabet position of the letter the invigilator issued (Q39)', 4],
  ['suspects with alibis in the incident report (Q44)', 3],
  ['lines on the page whose facts you changed (Q47)', 2],
  ['rules you were told you could break at the end (Q48)', 1],
  ['gates in the maze that only existed in one light (Q25)', 3],
  ['conditions on the vault (Q23)', 2],
  ['letters in the word you typed instead of clicking (Q27)', 8],
  ['refreshes it took to use the ghost button (Q43)', 0],
];

// The examiner turns to the dial that just landed. Middle dial: she looks straight
// down the barrel, which is exactly what she does the rest of the time.
const FACE: Array<'left' | 'down' | 'right'> = ['left', 'down', 'right'];

const LADDER = [
  'Clunk. That is not it. Every digit is something you already answered.',
  'Clunk. The clues name the item each digit came from. Go and remember it.',
  'Clunk. Three dials, ten faces each. I have all afternoon. You do not.',
];

let code49: number[] = [];
let clues49: string[] = [];
let digits49 = [0, 0, 0];
let fails49 = 0;
let faceDir49: 'left' | 'down' | 'right' = 'down';
let faceUntil49 = 0;
const clock49 = { last: 0, elapsed: 0 };

const deal49 = () => {
  const pool = POOL.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  const picked = pool.slice(0, 3);
  code49 = picked.map(c => c[1]);
  clues49 = picked.map(c => c[0]);
};

export const drawLevel49 = (gc: GameContext) => {
  const { ctx, state, displayFont, bodyFont, monoFont } = gc;
  const { w, topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const t  = getTheme(state);
  const s  = uiScale(ctx);
  const cx = w / 2;

  if (state.levelSubPhase === 'win') {
    drawWinScreen(
      gc,
      'UNLOCKED.',
      code49.join(' · ') + '. Every digit something you already knew. One question left.',
      50,
    );
    return;
  }
  if (freshEntry(gc)) {
    deal49();
    digits49 = [0, 0, 0];
    fails49 = 0;
    faceUntil49 = 0;
    faceDir49 = 'down';
    clock49.last = 0;
    clock49.elapsed = 0;
  }
  if (code49.length !== 3) deal49();

  const { elapsed } = levelClock(gc, clock49);

  // ── dial geometry (needed before drawing so the wheel can be resolved) ────
  const dialW  = topBoxWidth * 0.11901;
  const gap    = topBoxWidth * 0.04952;
  const btnH   = Math.round(30 * s);
  const digitH = Math.round(58 * s);
  const pad    = Math.round(4 * s);
  const totW   = dialW * 3 + gap * 2;
  const dialsX = cx - totW / 2;
  // Started a bit higher (0.43 vs the old 0.47) and the digit window shrunk a
  // touch (58 vs 68px) — together they keep the dial block from running into
  // the SUBMIT button below it, which the old fixed 0.84 fraction did not
  // reliably clear.
  const upY    = topBoxY + topBoxHeight * 0.43;
  const digY   = upY + btnH + pad;
  const dnY    = digY + digitH + pad;

  // `render` is false for the wheel, which is already handled inside a render.
  const spin = (i: number, dir: number, render = true) => {
    if (!inputOpen(gc)) return;
    digits49[i] = (digits49[i] + dir + 10) % 10;
    gc.sounds.ui('tick');
    if (digits49[i] === code49[i]) { faceDir49 = FACE[i]; faceUntil49 = elapsed + 0.5; }
    if (render) gc.render();
  };

  // The wheel spins whichever dial the pointer sits over (the mock's ns-resize
  // digit window). Resolved once per frame, before anything is drawn.
  if (gc.wheelDeltaY !== 0 && gc.mouseY >= digY && gc.mouseY <= digY + digitH) {
    for (let i = 0; i < 3; i++) {
      const dx = dialsX + i * (dialW + gap);
      if (gc.mouseX >= dx && gc.mouseX <= dx + dialW) { spin(i, gc.wheelDeltaY < 0 ? 1 : -1, false); break; }
    }
  }

  const allRight = digits49.every((v, i) => v === code49[i]);

  // The cartouche at the top of the paper names what the sheet has become.
  state.paperCaption = allRight ? '·  COMBINATION  ·' : undefined;

  // The examiner turns to a dial for half a second as it lands. Pause-aware, so
  // suspending the exam holds her mid-glance.
  if (elapsed < faceUntil49) gc.guideCharDir = faceDir49;

  // ── prompt ────────────────────────────────────────────────────────────────
  ctx.fillStyle    = t.ink;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.font         = `bold ${Math.round(23 * s)}px ${displayFont}`;
  ctx.fillText('Enter the code. You already know every digit.', cx, topBoxY + topBoxHeight * 0.06, topBoxWidth * 0.9);

  // ── the three clues ───────────────────────────────────────────────────────
  const clueX  = topBoxX + topBoxWidth * 0.12;
  const clueW  = topBoxWidth * 0.76;
  const clueY  = topBoxY + topBoxHeight * 0.17;
  const lineH  = Math.round(24.5 * s);
  const bodyPx = Math.round(14 * s);
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  clues49.forEach((clue, i) => {
    const y = clueY + i * lineH + lineH / 2;
    const label = 'DIGIT ' + (i + 1);
    ctx.font      = `${bodyPx}px ${monoFont}`;
    ctx.fillStyle = t.fgDim;
    ctx.fillText(label, clueX, y);
    const labelW = ctx.measureText(label).width + 6 * s;
    ctx.font      = `${bodyPx}px ${bodyFont}`;
    ctx.fillStyle = t.fgMid;
    ctx.fillText(clue, clueX + labelW, y, clueW - labelW);
  });

  // ── three tumbler dials ───────────────────────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const dx = dialsX + i * (dialW + gap);

    drawChoice(gc, '▲', dx, upY, dialW, btnH, () => spin(i, 1), { fontSize: 16 });

    // digit window
    ctx.fillStyle = t.bg;
    ctx.fillRect(dx, digY, dialW, digitH);
    // No "you got this one" tell on the window itself: the only feedback the mock
    // gives is the examiner turning her head, and brute-forcing must stay costly.
    ctx.strokeStyle = t.stroke;
    ctx.lineWidth = 2.5 * s;
    ctx.strokeRect(dx, digY, dialW, digitH);
    ctx.fillStyle    = t.ink;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `bold ${Math.round(40 * s)}px ${displayFont}`;
    ctx.fillText(String(digits49[i]), dx + dialW / 2, digY + digitH / 2);

    drawChoice(gc, '▼', dx, dnY, dialW, btnH, () => spin(i, -1), { fontSize: 16 });
  }

  // ── submit ────────────────────────────────────────────────────────────────
  const subW = topBoxWidth * 0.2381;
  const subH = Math.round(48 * s);
  // Anchored to the bottom of the play area (not a fixed fraction of
  // topBoxHeight) so it stays clear of the dial row above it on every viewport.
  const subY = topBoxY + topBoxHeight - 8 * s - subH;
  drawChoice(gc, 'SUBMIT', cx - subW / 2, subY, subW, subH, () => {
    if (!inputOpen(gc)) return;
    if (digits49.every((v, i) => v === code49[i])) {
      state.levelSubPhase = 'win';
      gc.render();
    } else {
      say(gc, LADDER[Math.min(fails49, LADDER.length - 1)]);
      fails49++;
      wrong(gc);
    }
  }, { fontSize: 18 });

  // Test hook: internals only. The level is still played with real input.
  const dev = window as unknown as { __gc?: { lv?: Record<string, unknown> } };
  if (dev.__gc) dev.__gc.lv = { code: code49.slice(), digits: digits49.slice(), t: elapsed, fails: fails49, allRight };
};
