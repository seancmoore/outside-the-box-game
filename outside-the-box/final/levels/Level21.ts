import { GameContext } from '../types';
import { getTheme }    from '../theme';
import { getLayout }   from '../layout';
import { uiScale, triggerStamp } from '../renderer';
import { freshEntry, drawWinScreen, say, inputOpen, levelClock } from './lateralHelpers';
import Vec2            from '../../../Wolfie2D/DataTypes/Vec2';
import StateMachine    from '../../../Wolfie2D/DataTypes/State/StateMachine';
import State           from '../../../Wolfie2D/DataTypes/State/State';
import GameEvent       from '../../../Wolfie2D/Events/GameEvent';

// ── Q21 — Frodrick Rematch ────────────────────────────────────────────────────
// Frodrick is back with a paddle 46% of the court tall and perfect tracking, so a
// fair rally cannot be won. The way through is not skill: hold the left mouse
// button down on his paddle and it freezes (fountain-pen red) for as long as you
// hold. Frozen, he stops tracking entirely — he still blocks the ball like any
// solid paddle, but he can no longer chase it, so a held Frodrick is a stationary
// target you can place shots around. While you hold it the examiner turns away
// and the standing label reads UNSUPERVISED. First to three.

// Offset into pongBallBounce.mp3 where the actual hit sound sits (seconds).
const BOUNCE_OFFSET = 0.45;

const PLAYER_H       = 0.18;   // player paddle height (fraction of court)
const FRODRICK_H     = 0.46;   // Frodrick's paddle — absurdly long
const PADDLE_W       = 0.018;
const BALL_R         = 0.013;
const PLAYER_LEFT    = 0.025;
const AI_RIGHT       = 0.975;
const SPEED_INIT     = 0.48;
const SPEED_MAX      = 0.95;
const PLAYER_SPEED   = 1.1;
const FRODRICK_SPEED = 4.8;    // near-instant tracking — essentially unbeatable
const WIN_SCORE      = 3;

const FROZEN_INK = '#C03A2E';  // fountain-pen red

const LINE_OPEN   = 'he has returned...';
const LINE_FROZE  = '...I saw nothing.';
const LINE_SCORED = 'Frodrick is filing a complaint. It will be ignored.';
const LINE_LOST   = 'Three to nothing. He did not even have to move. Well. He could not have.';

// ── Wolfie2D AI data ──────────────────────────────────────────────────────────
interface FrodrickData {
  ballPos: Vec2;
  ballVel: Vec2;
  aiY:     number;
  frozen:  boolean;   // true while the player is holding the paddle
}

// ── Wolfie2D States ───────────────────────────────────────────────────────────

/** Ball heading away — Frodrick drifts back to center */
class FrodrickIdleState extends State {
  onEnter(_o: Record<string, any>): void {}
  onExit():  Record<string, any> { return {}; }
  handleInput(_e: GameEvent): void {}

  update(dt: number): void {
    const d = (this.parent as FrodrickAI).data;
    if (d.frozen) return;
    const diff = 0.5 - d.aiY;
    d.aiY += Math.sign(diff) * Math.min(Math.abs(diff) * 6 * dt, FRODRICK_SPEED * dt);
    d.aiY  = Math.max(FRODRICK_H / 2, Math.min(1 - FRODRICK_H / 2, d.aiY));
    if (d.ballVel.x > 0) this.finished('chase');
  }
}

/** Ball heading toward Frodrick — perfect tracking, no delay, no noise */
class FrodrickChaseState extends State {
  onEnter(_o: Record<string, any>): void {}
  onExit():  Record<string, any> { return {}; }
  handleInput(_e: GameEvent): void {}

  update(dt: number): void {
    const d = (this.parent as FrodrickAI).data;
    if (d.frozen) return;
    const diff    = d.ballPos.y - d.aiY;
    const maxStep = FRODRICK_SPEED * dt;
    d.aiY += Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
    d.aiY  = Math.max(FRODRICK_H / 2, Math.min(1 - FRODRICK_H / 2, d.aiY));
    if (d.ballVel.x <= 0) this.finished('idle');
  }
}

class FrodrickAI extends StateMachine {
  data: FrodrickData = {
    ballPos: new Vec2(0.5, 0.5),
    ballVel: new Vec2(0, 0),
    aiY:     0.5,
    frozen:  false,
  };
  constructor() {
    super();
    this.addState('idle',  new FrodrickIdleState(this));
    this.addState('chase', new FrodrickChaseState(this));
    this.initialize('idle', {});
  }
}

// ── Module state ──────────────────────────────────────────────────────────────
let ballPos21    = new Vec2(0.5, 0.5);
let ballVel21    = new Vec2(0, 0);
let playerY21    = 0.5;
let playerScore21 = 0;
let aiScore21    = 0;
let rallying21   = false;
let frozeOnce21  = false;
let scoredOnce21 = false;
let finalYou21   = 0;
let finalFrod21  = 0;
let frodrick     = new FrodrickAI();
const clock21 = { last: 0, elapsed: 0 };

function resetPong21() {
  ballPos21     = new Vec2(0.5, 0.5);
  ballVel21     = new Vec2(0, 0);
  playerY21     = 0.5;
  playerScore21 = 0;
  aiScore21     = 0;
  rallying21    = false;
  frozeOnce21   = false;
  scoredOnce21  = false;
  finalYou21    = 0;
  finalFrod21   = 0;
  clock21.last  = 0;
  clock21.elapsed = 0;
  frodrick      = new FrodrickAI();
}

function serve21() {
  const angle = (Math.random() - 0.5) * 0.6;
  ballPos21 = new Vec2(0.5, 0.5);
  ballVel21 = new Vec2(SPEED_INIT * Math.cos(angle), SPEED_INIT * Math.sin(angle));
  rallying21 = true;
}

// ── SPACE / arrow keys (module listener, added once) ──────────────────────────
let keys21Added = false;
let serveRequested21 = false;
function ensureKeys21() {
  if (keys21Added) return;
  keys21Added = true;
  window.addEventListener('keydown', (e) => {
    const dev = window as unknown as { __gc?: GameContext };
    const g = dev.__gc;
    if (!g || g.state.currentLevel !== 21 || g.state.currentScreen !== 'level') return;
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
    if ((e.key === ' ' || e.key === 'Spacebar') && inputOpen(g)) serveRequested21 = true;
  });
}

// ── Draw function ─────────────────────────────────────────────────────────────
export const drawLevel21 = (gc: GameContext) => {
  ensureKeys21();

  const { ctx, state, displayFont, bodyFont } = gc;
  const { topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const t  = getTheme(state);
  const s  = uiScale(ctx);

  const ox = topBoxX, oy = topBoxY, cw = topBoxWidth, ch = topBoxHeight;
  const cx = ox + cw / 2;

  if (state.levelSubPhase === 'win') {
    state.hudHeartsLabel = undefined;
    drawWinScreen(gc, 'YOU CHEATED!', `Frodrick never saw it coming. ${finalYou21} to ${finalFrod21}.`, 22);
    return;
  }

  if (freshEntry(gc)) {
    resetPong21();
    serveRequested21 = false;
    say(gc, LINE_OPEN);
  }

  // ── Geometry in canvas pixels ──────────────────────────────────────────────
  const pPxW = PADDLE_W * cw;
  const pPxH = PLAYER_H * ch;
  const fPxH = FRODRICK_H * ch;
  const bPxR = BALL_R * cw;
  const frodPxX = ox + (AI_RIGHT - PADDLE_W) * cw;
  const frodPxY = oy + (frodrick.data.aiY - FRODRICK_H / 2) * ch;

  // ── Freeze: the left button held down on Frodrick's paddle ─────────────────
  const grab = 6 * s;   // the mock's horizontal grab tolerance
  const overFrodrick = gc.mouseX >= frodPxX - grab && gc.mouseX <= frodPxX + pPxW + grab &&
                       gc.mouseY >= frodPxY && gc.mouseY <= frodPxY + fPxH;

  // ── Simulation (pause-aware: dt is zero while suspended) ───────────────────
  const { dt } = levelClock(gc, clock21);
  const step = inputOpen(gc) ? dt : 0;

  if (step > 0) {
    const wasFrozen = frodrick.data.frozen;
    frodrick.data.frozen = gc.mouseDown && overFrodrick;
    if (frodrick.data.frozen && !wasFrozen && !frozeOnce21) {
      frozeOnce21 = true;
      say(gc, LINE_FROZE);
    }

    // Player paddle
    const up   = gc.keysDown.has('w') || gc.keysDown.has('W') || gc.keysDown.has('ArrowUp');
    const down = gc.keysDown.has('s') || gc.keysDown.has('S') || gc.keysDown.has('ArrowDown');
    if (up)   playerY21 -= PLAYER_SPEED * step;
    if (down) playerY21 += PLAYER_SPEED * step;
    playerY21 = Math.max(PLAYER_H / 2, Math.min(1 - PLAYER_H / 2, playerY21));

    // Serve
    if (serveRequested21) {
      serveRequested21 = false;
      if (!rallying21) serve21();
    }

    if (rallying21) {
      ballPos21 = new Vec2(ballPos21.x + ballVel21.x * step, ballPos21.y + ballVel21.y * step);

      // Walls
      if (ballPos21.y - BALL_R < 0) {
        ballPos21 = new Vec2(ballPos21.x, BALL_R);
        ballVel21 = new Vec2(ballVel21.x, Math.abs(ballVel21.y));
        gc.sounds.play('pongBounce', { volume: 0.7, startTime: BOUNCE_OFFSET });
      }
      if (ballPos21.y + BALL_R > 1) {
        ballPos21 = new Vec2(ballPos21.x, 1 - BALL_R);
        ballVel21 = new Vec2(ballVel21.x, -Math.abs(ballVel21.y));
        gc.sounds.play('pongBounce', { volume: 0.7, startTime: BOUNCE_OFFSET });
      }

      // Player paddle collision
      const playerRight = PLAYER_LEFT + PADDLE_W;
      if (ballVel21.x < 0 &&
          ballPos21.x - BALL_R < playerRight &&
          ballPos21.x + BALL_R > PLAYER_LEFT &&
          Math.abs(ballPos21.y - playerY21) < PLAYER_H / 2 + BALL_R) {
        const newSpeed = Math.min(SPEED_MAX, Math.abs(ballVel21.x) * 1.05);
        const deflect  = ((ballPos21.y - playerY21) / (PLAYER_H / 2)) * 0.65;
        ballPos21 = new Vec2(playerRight + BALL_R, ballPos21.y);
        ballVel21 = new Vec2(newSpeed, deflect);
        gc.sounds.play('pongBounce', { volume: 0.7, startTime: BOUNCE_OFFSET });
      }

      // Frodrick paddle collision — still solid while frozen; freezing only
      // stops him from tracking, so his position (and the gaps around it)
      // stay put for as long as he's held.
      const aiLeft = AI_RIGHT - PADDLE_W;
      if (ballVel21.x > 0 &&
          ballPos21.x + BALL_R > aiLeft &&
          ballPos21.x - BALL_R < AI_RIGHT &&
          Math.abs(ballPos21.y - frodrick.data.aiY) < FRODRICK_H / 2 + BALL_R) {
        const newSpeed = Math.min(SPEED_MAX, Math.abs(ballVel21.x) * 1.05);
        const deflect  = ((ballPos21.y - frodrick.data.aiY) / (FRODRICK_H / 2)) * 0.65;
        ballPos21 = new Vec2(aiLeft - BALL_R, ballPos21.y);
        ballVel21 = new Vec2(-newSpeed, deflect);
        gc.sounds.play('pongBounce', { volume: 0.7, startTime: BOUNCE_OFFSET });
      }

      // Wolfie2D StateMachine drives Frodrick
      frodrick.data.ballPos = ballPos21;
      frodrick.data.ballVel = ballVel21;
      frodrick.update(step);

      // Scoring
      if (ballPos21.x < 0) {
        aiScore21++;
        rallying21 = false;
        if (aiScore21 >= WIN_SCORE) {
          playerScore21 = 0;
          aiScore21 = 0;
          triggerStamp(gc, 'INCORRECT', t.danger);
          gc.sounds.ui('deny');
          gc.loseLife();
          say(gc, LINE_LOST);
        }
      }
      if (ballPos21.x > 1) {
        playerScore21++;
        rallying21 = false;
        if (!scoredOnce21) { scoredOnce21 = true; say(gc, LINE_SCORED); }
        if (playerScore21 >= WIN_SCORE) {
          finalYou21  = playerScore21;
          finalFrod21 = aiScore21;
          state.levelSubPhase = 'win';
        }
      }
    }
  } else {
    serveRequested21 = false;
  }

  // ── Unsupervised: the examiner turns away, the standing label changes ──────
  if (frodrick.data.frozen) {
    state.hudHeartsLabel = 'CANDIDATE STANDING · UNSUPERVISED';
    gc.guideCharDir = 'right';
    gc.guideCharOffsetX = 0;
    gc.guideCharOffsetY = 0;
  } else {
    state.hudHeartsLabel = undefined;
  }

  // ── Court centre line ──────────────────────────────────────────────────────
  ctx.strokeStyle = t.hairline;
  ctx.lineWidth   = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(cx, oy + 6);
  ctx.lineTo(cx, oy + ch - 6);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Scores ─────────────────────────────────────────────────────────────────
  ctx.fillStyle    = t.fgDim;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.font         = `bold ${Math.round(40 * s)}px ${displayFont}`;
  ctx.fillText(`${playerScore21}`, ox + cw * 0.26, oy + 10 * s);
  ctx.fillText(`${aiScore21}`,     ox + cw * 0.74, oy + 10 * s);
  ctx.font = `${Math.round(11 * s)}px ${bodyFont}`;
  ctx.fillText('YOU',      ox + cw * 0.26, oy + 58 * s);
  ctx.fillText('Frodrick', ox + cw * 0.74, oy + 58 * s);

  // ── Control hint ───────────────────────────────────────────────────────────
  ctx.textBaseline = 'bottom';
  ctx.fillText('W/S or ↑/↓ to move   |   SPACE to serve', cx, oy + ch - 6 * s);

  // ── Serve prompt ───────────────────────────────────────────────────────────
  if (!rallying21) {
    ctx.fillStyle    = t.ink;
    ctx.textBaseline = 'middle';
    ctx.font         = `bold ${Math.round(19 * s)}px ${displayFont}`;
    ctx.fillText('PRESS SPACE TO SERVE', cx, oy + ch * 0.5);
  }

  // ── Paddles ────────────────────────────────────────────────────────────────
  ctx.fillStyle = t.ink;
  ctx.fillRect(ox + PLAYER_LEFT * cw, oy + (playerY21 - PLAYER_H / 2) * ch, pPxW, pPxH);

  const frodDrawY = oy + (frodrick.data.aiY - FRODRICK_H / 2) * ch;
  ctx.fillStyle = frodrick.data.frozen ? FROZEN_INK : t.ink;
  ctx.fillRect(frodPxX, frodDrawY, pPxW, fPxH);

  // Hover cursor over Frodrick's paddle — holding is what matters, not clicking.
  gc.hitAreas.push({ x: frodPxX - grab, y: frodDrawY, w: pPxW + grab * 2, h: fPxH, action: () => {} });

  // ── Ball ───────────────────────────────────────────────────────────────────
  if (rallying21) {
    ctx.fillStyle = t.ink;
    ctx.beginPath();
    ctx.arc(ox + ballPos21.x * cw, oy + ballPos21.y * ch, bPxR, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Test hook ──────────────────────────────────────────────────────────────
  const dev = window as unknown as { __gc?: { lv?: Record<string, unknown> } };
  if (dev.__gc) dev.__gc.lv = {
    you:      playerScore21,
    frod:     aiScore21,
    rallying: rallying21,
    frozen:   frodrick.data.frozen,
    aiY:      frodrick.data.aiY,
    playerY:  playerY21,
    ballX:    ballPos21.x,
    ballY:    ballPos21.y,
    elapsed:  clock21.elapsed,
  };
};
