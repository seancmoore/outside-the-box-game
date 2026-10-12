import { GameContext } from '../types';
import { getTheme }    from '../theme';
import { getLayout }   from '../layout';
import { uiScale, triggerStamp } from '../renderer';
import { drawChoice, wrong, freshEntry, drawWinScreen, say, inputOpen, levelClock } from './lateralHelpers';

// ── Q23 - Truth Table ────────────────────────────────────────────────────────
// CASE FILE #7: the vault security protocol (P → Q) ∧ (Q → P). A five column
// truth table whose twelve open cells cycle blank / T / F on click, plus four
// conclusion buttons. "Satisfied when both conditions match" is the right
// conclusion, but it only passes once the table itself agrees; a half filled
// table gets a nudge instead of silence. Wrong conclusions cost a heart.
// Quirks: the paper caption reads CONFIDENTIAL, a gold CORPORATE APPROVED seal
// sits on the case file, the win stamp reads CASE CLOSED, and after 45 idle
// seconds the examiner remembers that Corporate bills by the hour.

const P_COL = ['T', 'T', 'F', 'F'] as const;
const Q_COL = ['T', 'F', 'T', 'F'] as const;
const ANSWER: ('T' | 'F')[][] = [
  ['T', 'T', 'T'],
  ['F', 'T', 'F'],
  ['T', 'F', 'F'],
  ['T', 'T', 'T'],
];
const COL_HEADS = ['P', 'Q', 'P → Q', 'Q → P', 'Result'];

const CAPTION = '·  CONFIDENTIAL  ·';
const NUDGE   = 'Your table disagrees with you. Fix one of you.';
const REREAD  = 'Read the table you filled in. Then read it again.';
const BILLED  = 'Take your time. Corporate bills by the hour.';
const IDLE_S  = 45;

const OPTS: { text: string; right: boolean }[] = [
  { text: 'Protocol is always satisfied',             right: false },
  { text: 'Satisfied only when the vault is sealed',  right: false },
  { text: 'Satisfied when both conditions match',     right: true  },
  { text: 'Protocol is never satisfied',              right: false },
];

type Cell = 'T' | 'F' | '?';

const fresh23 = (): Cell[][] => Array.from({ length: 4 }, () => ['?', '?', '?'] as Cell[]);
const nextVal = (c: Cell): Cell => (c === '?' ? 'T' : c === 'T' ? 'F' : '?');
const allFilled  = (cells: Cell[][]) => cells.every(r => r.every(c => c !== '?'));
const allCorrect = (cells: Cell[][]) => cells.every((r, ri) => r.every((c, ci) => c === ANSWER[ri][ci]));

// ── Module state (reset on fresh entry) ──────────────────────────────────────
let cells23: Cell[][] = fresh23();
let billed23 = false;
let idleBase23 = 0;
const clock23 = { last: 0, elapsed: 0 };

// The gold CORPORATE APPROVED seal, pinned to the top right of the case file.
const drawApproved = (gc: GameContext, cx: number, cy: number, r: number) => {
  const { ctx, state, monoFont } = gc;
  const t = getTheme(state);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(9 * Math.PI / 180);
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = t.seal;
  ctx.lineWidth = 2.2 * (r / 37);
  ctx.setLineDash([3.5 * (r / 37), 2 * (r / 37)]);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = t.seal;
  ctx.beginPath(); ctx.arc(0, 0, r * (30 / 37), 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1 * (r / 37);
  ctx.beginPath(); ctx.arc(0, 0, r * (30 / 37), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = t.seal;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `bold ${(8 * r / 37).toFixed(2)}px ${monoFont}`;
  ctx.fillText('CORPORATE', 0, -3 * r / 37);
  ctx.fillText('APPROVED',  0,  9 * r / 37);
  ctx.restore();
};

// ── Draw ─────────────────────────────────────────────────────────────────────
export const drawLevel23 = (gc: GameContext) => {
  const { ctx, state, displayFont, bodyFont } = gc;
  const { w, topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const t  = getTheme(state);
  const s  = uiScale(ctx);
  const cx = w / 2;

  // The case file stays confidential on every screen of this level.
  state.paperCaption = CAPTION;

  if (state.levelSubPhase === 'win') {
    drawWinScreen(
      gc,
      'CASE CLOSED.',
      'The vault is secure when both conditions match. (P → Q) ∧ (Q → P) is just P ↔ Q.',
      24,
    );
    return;
  }

  if (freshEntry(gc)) {
    cells23 = fresh23();
    billed23 = false;
    idleBase23 = 0;
    clock23.last = 0;
    clock23.elapsed = 0;
  }

  // ── Idle clock (pause aware): Corporate bills by the hour ─────────────────
  const { elapsed } = levelClock(gc, clock23);
  const idle = elapsed - idleBase23;
  if (!billed23 && idle >= IDLE_S) { billed23 = true; say(gc, BILLED); }

  // ── Case file header ──────────────────────────────────────────────────────
  ctx.fillStyle    = t.ink;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font         = `bold ${Math.round(15 * s)}px ${displayFont}`;
  ctx.fillText('CASE FILE #7. VAULT SECURITY PROTOCOL', cx, topBoxY + topBoxHeight * 0.054, topBoxWidth * 0.7);

  ctx.font      = `${Math.round(12 * s)}px ${bodyFont}`;
  ctx.fillStyle = t.fgMid;
  ctx.fillText('The vault has two conditions:    P: the vault is sealed.    Q: the guard is on duty.',
    cx, topBoxY + topBoxHeight * 0.119, topBoxWidth * 0.82);

  ctx.font      = `bold ${Math.round(12 * s)}px ${bodyFont}`;
  ctx.fillStyle = t.fgDim;
  ctx.fillText('Security passes when:    (P → Q)  ∧  (Q → P)', cx, topBoxY + topBoxHeight * 0.179, topBoxWidth * 0.7);

  // ── CORPORATE APPROVED seal (top right of the play area) ──────────────────
  drawApproved(gc, topBoxX + topBoxWidth - 66 * s, topBoxY + 54 * s, 37 * s);

  // ── Truth table ───────────────────────────────────────────────────────────
  const tblW = topBoxWidth * 0.76;
  const colW = tblW / 5;
  const rowH = topBoxHeight * 0.097;
  const tblH = rowH * 5;
  const tblX = cx - tblW / 2;
  const tblY = topBoxY + topBoxHeight * 0.22;

  // header band sits on the page ground so it reads as a header
  ctx.fillStyle = t.bg;
  ctx.fillRect(tblX, tblY, tblW, rowH);

  // hairline grid
  ctx.strokeStyle = t.hairline;
  ctx.lineWidth   = 1;
  for (let r = 1; r < 5; r++) {
    ctx.beginPath();
    ctx.moveTo(tblX, tblY + r * rowH);
    ctx.lineTo(tblX + tblW, tblY + r * rowH);
    ctx.stroke();
  }
  for (let c = 1; c < 5; c++) {
    ctx.beginPath();
    ctx.moveTo(tblX + c * colW, tblY);
    ctx.lineTo(tblX + c * colW, tblY + tblH);
    ctx.stroke();
  }

  // the given / fillable divide, then the outer rule
  ctx.strokeStyle = t.stroke;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(tblX + 2 * colW, tblY);
  ctx.lineTo(tblX + 2 * colW, tblY + tblH);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.strokeRect(tblX, tblY, tblW, tblH);

  // column heads
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font         = `bold ${Math.round(13 * s)}px ${bodyFont}`;
  COL_HEADS.forEach((h, i) => {
    ctx.fillStyle = i < 2 ? t.fgDim : t.fgMid;
    ctx.fillText(h, tblX + colW * i + colW / 2, tblY + rowH / 2, colW - 10);
  });

  const canPlay = inputOpen(gc);

  for (let r = 0; r < 4; r++) {
    const ry  = tblY + (r + 1) * rowH;
    const rcy = ry + rowH / 2;

    // the two given columns
    ctx.fillStyle    = t.fgDim;
    ctx.font         = `bold ${Math.round(15 * s)}px ${bodyFont}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(P_COL[r], tblX + colW * 0.5, rcy);
    ctx.fillText(Q_COL[r], tblX + colW * 1.5, rcy);

    // the twelve open cells
    for (let fi = 0; fi < 3; fi++) {
      const cellX  = tblX + (fi + 2) * colW;
      const cellCX = cellX + colW / 2;
      const val    = cells23[r][fi];

      const over = gc.mouseX >= cellX && gc.mouseX <= cellX + colW &&
                   gc.mouseY >= ry    && gc.mouseY <= ry + rowH;
      if (over && canPlay) {
        ctx.fillStyle = state.darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)';
        ctx.fillRect(cellX + 1, ry + 1, colW - 2, rowH - 2);
      }

      ctx.font         = `bold ${Math.round(17 * s)}px ${displayFont}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = val === 'T' ? t.pass : val === 'F' ? t.danger : t.fgDim;
      ctx.fillText(val === '?' ? '—' : val, cellCX, rcy);

      const cr = r, cfi = fi;
      gc.hitAreas.push({
        x: cellX, y: ry, w: colW, h: rowH,
        action: () => {
          if (!inputOpen(gc)) return;
          cells23[cr][cfi] = nextVal(cells23[cr][cfi]);
          idleBase23 = clock23.elapsed;   // the candidate is working; stop the meter
          gc.sounds.ui('tick');
          gc.render();
        },
      });
    }
  }

  ctx.fillStyle    = t.fgDim;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font         = `${Math.round(10 * s)}px ${bodyFont}`;
  ctx.fillText('Click cells to cycle T / F / blank', cx, tblY + tblH + 14 * s);

  // ── Conclusions ───────────────────────────────────────────────────────────
  // Sized as fractions of topBoxHeight (not fixed uiScale px) so the two rows
  // always land inside the play area instead of overflowing its bottom edge
  // on short/cramped viewports where topBoxHeight doesn't grow with s.
  const tableOK  = allFilled(cells23) && allCorrect(cells23);
  const optBtnW  = topBoxWidth * 0.44;
  const optBtnH  = topBoxHeight * 0.088;
  const optGapX  = topBoxWidth * 0.03;
  const optGapY  = topBoxHeight * 0.018;
  const optY0    = topBoxY + topBoxHeight * 0.77;

  OPTS.forEach((opt, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx  = cx - optBtnW - optGapX / 2 + col * (optBtnW + optGapX);
    const by  = optY0 + row * (optBtnH + optGapY);

    drawChoice(gc, opt.text, bx, by, optBtnW, optBtnH, () => {
      if (!inputOpen(gc)) return;
      if (!opt.right) { say(gc, REREAD); wrong(gc); return; }
      if (!tableOK)   { say(gc, NUDGE); wrong(gc); return; }
      triggerStamp(gc, 'CASE CLOSED', t.pass);
      state.winChimeFor = state.currentLevel;   // keep CASE CLOSED, not CORRECT
      gc.sounds.ui('chime');
      state.levelSubPhase = 'win';
      gc.render();
    }, { fontSize: 13 });
  });

  // ── Test hook ─────────────────────────────────────────────────────────────
  (gc as unknown as { lv?: Record<string, unknown> }).lv = {
    cells: cells23.map(r => r.join('')),
    tableOK,
    idle,
    elapsed,
    billed: billed23,
  };
};
