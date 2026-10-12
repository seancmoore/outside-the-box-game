import { GameContext } from '../types';
import { getTheme }    from '../theme';
import { getLayout }   from '../layout';
import { uiScale }     from '../renderer';
import { drawChoice, wrong, freshEntry, drawWinScreen, say, inputOpen } from './lateralHelpers';

// ── Q30 — Checkpoint (callback to Q16: the examiner leaked BLUE) ──────────────
// Calm level. Joke: the typewriter starts to say the answer, backspaces, covers.

const INK: Record<string, string> = { RED: '#C03A2E', BLUE: '#2E6BA8', GREEN: '#3F8F55', YELLOW: '#D8A81F' };
const A = 'Checkpoint. Past the halfway mark of your certification. Quick: were you actually listening to me earlier? The answer is BLU';
const CUT = 'The answer is BLU'.length;
const B = 'Corporate says I am not allowed to say it twice.';

let slip30 = { phase: 0, i: 0, next: 0 };

export const drawLevel30 = (gc: GameContext) => {
  const { ctx, state, displayFont, monoFont } = gc;
  const { w, topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const t  = getTheme(state);
  const s  = uiScale(ctx);
  const cx = w / 2;

  if (state.levelSubPhase === 'win') {
    drawWinScreen(gc, 'YOU REMEMBERED.', 'Halfway there. Twenty-five questions left, and they get stranger.', 31);
    return;
  }
  if (freshEntry(gc)) { slip30 = { phase: 0, i: 0, next: 0 }; say(gc, A); }

  // the slip: once the typewriter has revealed the answer, backspace it and cover
  if (slip30.phase === 0 && state.guideLines && state.guideLines[0] === A && state.guideReveal >= A.length) {
    slip30 = { phase: 1, i: 0, next: performance.now() + 350 };
  }
  if (slip30.phase === 1 && performance.now() >= slip30.next) {
    slip30.i++;
    const shown = A.slice(0, A.length - slip30.i);
    state.guideLines = [shown];
    state.guideTarget = shown; state.guideReveal = shown.length;   // keep the typewriter from re-running
    slip30.next = performance.now() + 45;
    if (slip30.i >= CUT) { slip30.phase = 2; const base = A.slice(0, A.length - CUT); state.guideLines = [base + B]; state.guideTarget = base + B; state.guideReveal = base.length; }
  }

  ctx.fillStyle = t.fgDim;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(13 * s)}px ${monoFont}`;
  ctx.fillText('C H E C K P O I N T   ·   I T E M   3 0   O F   5 0', cx, topBoxY + topBoxHeight * 0.10);
  ctx.fillStyle = t.ink;
  ctx.font = `${Math.round(30 * s)}px ${displayFont}`;
  ctx.fillText('Back at Question 16, I told you which one to pick.', cx, topBoxY + topBoxHeight * 0.28, topBoxWidth * 0.78);
  ctx.fillText('Which was it?', cx, topBoxY + topBoxHeight * 0.40, topBoxWidth * 0.78);

  const labels = ['RED', 'BLUE', 'GREEN', 'YELLOW'];
  const bw = 160 * s, bh = 60 * s, gap = 36 * s;
  const totW = labels.length * bw + (labels.length - 1) * gap;
  const bx0 = cx - totW / 2, by = topBoxY + topBoxHeight * 0.91 - bh;
  labels.forEach((lab, i) => {
    drawChoice(gc, lab, bx0 + i * (bw + gap), by, bw, bh, () => {
      if (!inputOpen(gc)) return;
      if (lab === 'BLUE') { state.levelSubPhase = 'win'; gc.render(); }
      else { wrong(gc); say(gc, 'I told you. Between us. The system was glitching.'); }
    }, { fontSize: 21, fill: INK[lab], textColor: '#F7F1E3' });
  });
};
