import { GameContext }  from '../types';
import { getTheme }     from '../theme';
import { getLayout }    from '../layout';
import { uiScale, triggerStamp } from '../renderer';
import { freshEntry, drawWinScreen, say, inputOpen, levelClock } from './lateralHelpers';
import Vec2             from '../../../Wolfie2D/DataTypes/Vec2';
import AABB             from '../../../Wolfie2D/DataTypes/Shapes/AABB';
import StateMachine     from '../../../Wolfie2D/DataTypes/State/StateMachine';
import State            from '../../../Wolfie2D/DataTypes/State/State';
import GameEvent        from '../../../Wolfie2D/Events/GameEvent';

// ── Q25 — Lights Maze ─────────────────────────────────────────────────────────
// A fresh maze every attempt, generated on entry (never the same layout twice),
// with a dense scatter of gates along the one true path that only exist in one
// of the two rooms. Running it blind — memorising a layout, wall-following, or
// bumping your way through — does not work: most of the route is gated, so the
// only way through is to actually read the walls and flip DARK MODE whenever
// the way forward disappears. After the first switch a ◐ TOGGLE shortcut
// appears in the corner of the maze.

// ── Seeded RNG (Xorshift32) ───────────────────────────────────────────────────
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

// ── Maze dimensions ───────────────────────────────────────────────────────────
// Larger than a typical maze level and regenerated every attempt — bigger, and
// never the same twice, so there is nothing to memorise or guess from a prior run.
const ROOM_COLS = 15;
const ROOM_ROWS = 11;
const GRID_COLS = ROOM_COLS * 2 + 1;   // 31
const GRID_ROWS = ROOM_ROWS * 2 + 1;   // 23

const S_RC = Math.floor(ROOM_COLS / 2);   // 5
const S_RR = ROOM_ROWS - 1;              // 7
const E_RC = Math.floor(ROOM_COLS / 2);   // 5

const START_GCOL = S_RC * 2 + 1;   // 11
const START_GROW = S_RR * 2 + 1;   // 15
const EXIT_GCOL  = E_RC * 2 + 1;   // 11

// ── Wall types ────────────────────────────────────────────────────────────────
// 0 = open passage
// 1 = always visible wall (neutral)
// 2 = dark-mode wall: visible in dark mode, INVISIBLE in light mode
// 3 = light-mode wall: visible in light mode, INVISIBLE in dark mode

interface Gate25 { r: number; c: number; type: number; }

// Fraction of eligible path-passage cells converted into a gate. High enough
// that the route is gated for most of its length — wall-following or bumping
// through in a single lighting mode reliably dead-ends.
const GATE_CHANCE = 0.55;
// Minimum gates enforced regardless of how the coin flips landed, scaled to
// maze size, so a short random path can't accidentally generate an easy one.
const MIN_GATE_FRACTION = 0.35;

// ── Maze generation (fresh RNG seed every attempt) ─────────────────────────────
function generateMaze25(seed: number): { grid: number[][]; gates: Gate25[] } {
  const rng = makeRng(seed);

  const grid: number[][] = Array.from({ length: GRID_ROWS }, () =>
    new Array(GRID_COLS).fill(1)
  );

  // Open all room cells
  for (let r = 0; r < ROOM_ROWS; r++)
    for (let c = 0; c < ROOM_COLS; c++)
      grid[r * 2 + 1][c * 2 + 1] = 0;

  // Iterative DFS
  const visited: boolean[][] = Array.from({ length: ROOM_ROWS }, () =>
    new Array(ROOM_COLS).fill(false)
  );
  const stack: [number, number][] = [[S_RR, S_RC]];
  visited[S_RR][S_RC] = true;

  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1];
    const nbrs: [number, number, number, number][] = [];
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < ROOM_ROWS && nc >= 0 && nc < ROOM_COLS && !visited[nr][nc])
        nbrs.push([nr, nc, dr, dc]);
    }
    if (nbrs.length > 0) {
      const idx = Math.floor(rng() * nbrs.length);
      const [nr, nc, dr, dc] = nbrs[idx];
      visited[nr][nc] = true;
      grid[r * 2 + 1 + dr][c * 2 + 1 + dc] = 0;
      stack.push([nr, nc]);
    } else {
      stack.pop();
    }
  }

  // Exit door at top. Bottom is intentionally sealed — player spawns inside
  // the start room, so leaving an opening there lets them walk around the maze.
  grid[0][EXIT_GCOL] = 0;

  // Place mode-toggle gates densely along the unique solution path. Every
  // eligible passage is a coin flip (GATE_CHANCE), with a size-scaled floor
  // enforced afterward so a short random path can't dodge the mechanic
  // entirely. Types strictly alternate, so consecutive gates never share a
  // mode and the route genuinely requires repeated switching, not one flip.
  // A short buffer at each end is left ungated so spawn/exit are never
  // themselves blocked out from under the player.
  const path = findSolutionPath(grid);
  const passages = path.filter(([r, c]) =>
    (r % 2 === 0 && c % 2 === 1) || (r % 2 === 1 && c % 2 === 0)
  );
  const BUFFER = Math.min(2, Math.floor(passages.length * 0.05));
  const eligible = passages.slice(BUFFER, passages.length - BUFFER);

  const gates: Gate25[] = [];
  let nextType = rng() < 0.5 ? 2 : 3;
  for (const [r, c] of eligible) {
    if (rng() < GATE_CHANCE) {
      grid[r][c] = nextType;
      gates.push({ r, c, type: nextType });
      nextType = nextType === 2 ? 3 : 2;
    }
  }

  // Floor: top up with evenly-spaced gates (skipping cells already gated)
  // until at least MIN_GATE_FRACTION of the eligible path is gated.
  const minGates = Math.ceil(eligible.length * MIN_GATE_FRACTION);
  if (eligible.length > 0 && gates.length < minGates) {
    const gatedCells = new Set(gates.map(g => `${g.r},${g.c}`));
    const need = minGates - gates.length;
    const stride = Math.max(1, Math.floor(eligible.length / (need + 1)));
    for (let i = stride; i < eligible.length && gates.length < minGates; i += stride) {
      const [r, c] = eligible[i];
      if (gatedCells.has(`${r},${c}`)) continue;
      grid[r][c] = nextType;
      gates.push({ r, c, type: nextType });
      gatedCells.add(`${r},${c}`);
      nextType = nextType === 2 ? 3 : 2;
    }
  }

  return { grid, gates };
}

// BFS the unique solution path through grid==0 cells from the start room to
// the topmost room on the exit column.
function findSolutionPath(grid: number[][]): Array<[number, number]> {
  const visited: boolean[][] = Array.from({ length: GRID_ROWS }, () =>
    new Array(GRID_COLS).fill(false)
  );
  const parent: Array<Array<[number, number] | null>> =
    Array.from({ length: GRID_ROWS }, () =>
      new Array<[number, number] | null>(GRID_COLS).fill(null)
    );
  const queue: Array<[number, number]> = [[START_GROW, START_GCOL]];
  visited[START_GROW][START_GCOL] = true;
  const TARGET_R = 1;
  const TARGET_C = EXIT_GCOL;
  let reached = false;

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    if (r === TARGET_R && c === TARGET_C) { reached = true; break; }
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
      if (grid[nr][nc] !== 0 || visited[nr][nc]) continue;
      visited[nr][nc] = true;
      parent[nr][nc] = [r, c];
      queue.push([nr, nc]);
    }
  }

  const path: Array<[number, number]> = [];
  let cur: [number, number] | null = reached ? [TARGET_R, TARGET_C] : null;
  while (cur) {
    path.unshift(cur);
    cur = parent[cur[0]][cur[1]];
  }
  return path;
}

// Walls are mode-dependent: type 1 is always solid, type 2 is solid only in
// dark mode, type 3 is solid only in light mode. We build one wall list per
// mode and swap which one the player collides against each frame.
function buildWallsForMode25(grid: number[][], darkMode: boolean): AABB[] {
  const walls: AABB[] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = grid[r][c];
      const solid = cell === 1 ||
                    (cell === 2 && darkMode) ||
                    (cell === 3 && !darkMode);
      if (solid) walls.push(new AABB(new Vec2(c + 0.5, r + 0.5), new Vec2(0.5, 0.5)));
    }
  }
  return walls;
}

// ── Per-attempt maze state — regenerated from a fresh random seed every time
// the level is (re)entered, so no two attempts share a layout. ────────────────
let maze25:        number[][] = [];
let gates25:       Gate25[]   = [];
let solutionPath25: Array<[number, number]> = [];
let wallsDark25:   AABB[] = [];
let wallsLight25:  AABB[] = [];

function regenerateMaze25() {
  const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  const { grid, gates } = generateMaze25(seed);
  maze25  = grid;
  gates25 = gates;
  // The route through the maze if every gate were open: the one the player
  // walks while flipping the lights. Exposed for the harness.
  solutionPath25 = findSolutionPath(grid.map(row => row.map(t => (t === 2 || t === 3) ? 0 : t)));
  wallsDark25  = buildWallsForMode25(grid, true);
  wallsLight25 = buildWallsForMode25(grid, false);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PLAYER_SPEED25 = 7.5;
const PLAYER_HALF25  = 0.10;
const TIMER_SECS25   = 80;
const HIST_LEN25     = 150;
const SETBACK25      = 90;
const SHAKE_SECS25   = 0.18;
const FACE_UP_MS25   = 400;

// ── Copy ──────────────────────────────────────────────────────────────────────
// The opening remark lives in LEVEL_DATA[24]. These two are the level's own.
const FIRST_TOGGLE_LINE = 'Mind the switch. It changes the room, and me, and three of these walls.';
const GATE_LINE         = 'That wall is only there in this light.';
const TIMEOUT_LINE      = 'Time. The clock restarts. So do you, in a sense.';

// ── Wall collision check ───────────────────────────────────────────────────────
// Returns the wall that was struck (so the caller can tell a gate from a brick).
function hitsWall25(pos: Vec2, half: number, walls: AABB[]): AABB | null {
  for (const w of walls) {
    if (Math.abs(pos.x - w.center.x) < half + w.halfSize.x &&
        Math.abs(pos.y - w.center.y) < half + w.halfSize.y)
      return w;
  }
  return null;
}

// ── Shared state data ─────────────────────────────────────────────────────────
interface Maze25Data {
  pos:      Vec2;
  walls:    AABB[];
  keysDown: Set<string>;
  half:     number;
  won:      boolean;
  onWin:    () => void;
  onHitWall: (r: number, c: number) => void;
  histX:    Float32Array;
  histY:    Float32Array;
  histIdx:  number;
}

// ── Wolfie2D States ───────────────────────────────────────────────────────────
class Walk25State extends State {
  onEnter(_o: Record<string, any>): void {}
  onExit():  Record<string, any> { return {}; }
  handleInput(_e: GameEvent): void {}

  update(dt: number): void {
    const d = (this.parent as Player25SM).data;

    let vx = 0, vy = 0;
    if (d.keysDown.has('ArrowLeft')  || d.keysDown.has('a') || d.keysDown.has('A')) vx = -1;
    if (d.keysDown.has('ArrowRight') || d.keysDown.has('d') || d.keysDown.has('D')) vx =  1;
    if (d.keysDown.has('ArrowUp')    || d.keysDown.has('w') || d.keysDown.has('W')) vy = -1;
    if (d.keysDown.has('ArrowDown')  || d.keysDown.has('s') || d.keysDown.has('S')) vy =  1;
    if (vx !== 0 && vy !== 0) { vx *= 0.7071; vy *= 0.7071; }

    const wi = d.histIdx % HIST_LEN25;
    d.histX[wi] = d.pos.x;
    d.histY[wi] = d.pos.y;
    d.histIdx++;

    const spd = PLAYER_SPEED25 * dt;
    d.pos.x += vx * spd;
    d.pos.y += vy * spd;

    const hit = hitsWall25(d.pos, d.half, d.walls);
    if (hit) {
      const setback = Math.min(SETBACK25, d.histIdx);
      const ri = ((d.histIdx - setback) % HIST_LEN25 + HIST_LEN25) % HIST_LEN25;
      d.pos.x = d.histX[ri];
      d.pos.y = d.histY[ri];
      d.onHitWall(Math.round(hit.center.y - 0.5), Math.round(hit.center.x - 0.5));
    }

    if (d.pos.y < 0.9) this.finished('win');
  }
}

class Win25State extends State {
  onEnter(_o: Record<string, any>): void {
    const d = (this.parent as Player25SM).data;
    d.won = true;
    d.onWin();
  }
  onExit():  Record<string, any> { return {}; }
  handleInput(_e: GameEvent): void {}
  update(_dt: number): void {}
}

class Player25SM extends StateMachine {
  data: Maze25Data;
  constructor(data: Maze25Data) {
    super();
    this.data = data;
    this.addState('walk', new Walk25State(this));
    this.addState('win',  new Win25State(this));
    this.initialize('walk', {});
  }
}

// ── Module-level state (reset on fresh entry) ─────────────────────────────────
let player25: Player25SM | null = null;
const clock25 = { last: 0, elapsed: 0 };
let timerFrom25          = 0;        // clock25.elapsed when the current 80s window started
let hasToggledDark25     = false;    // true once the player changes mode (pause menu first)
let prevDarkMode25: boolean | null = null;
let gateHits25           = 0;        // wall hits that landed on a mode gate
let shakeUntil25         = 0;        // clock25.elapsed deadline for the oof shake
let faceUpUntil25        = 0;        // performance.now() deadline for the examiner's reach

// ── Draw function ─────────────────────────────────────────────────────────────
export const drawLevel25 = (gc: GameContext) => {
  const { ctx, state, displayFont, bodyFont, monoFont } = gc;
  const { w, topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const t  = getTheme(state);
  const s  = uiScale(ctx);
  const cx = w / 2;

  if (state.levelSubPhase === 'win') {
    drawWinScreen(gc, 'THROUGH.', 'Most of those walls only ever existed in one of the two rooms.', 26);

    // HALFWAY seal — Q25 is the literal halfway point (25 of 50), so the
    // checkpoint stamp belongs on this interlude screen, not on Q30.
    const sr = Math.min(topBoxWidth, topBoxHeight) * 0.11;
    const sx = topBoxX + topBoxWidth - sr - 34 * s, sy = topBoxY + sr + 22 * s;
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(-12 * Math.PI / 180);
    ctx.strokeStyle = t.seal; ctx.lineWidth = 2.5; ctx.setLineDash([4, 2.4]);
    ctx.beginPath(); ctx.arc(0, 0, sr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = state.darkMode ? 'rgba(212,176,90,0.12)' : 'rgba(176,137,47,0.10)';
    ctx.beginPath(); ctx.arc(0, 0, sr * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = t.seal; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(sr * 0.24)}px ${monoFont}`; ctx.fillText('HALFWAY', 0, -sr * 0.08);
    ctx.font = `italic ${Math.round(sr * 0.2)}px ${displayFont}`; ctx.fillText('25 of 50', 0, sr * 0.22);
    ctx.restore();

    return;
  }

  if (freshEntry(gc)) {
    regenerateMaze25();
    const sx = START_GCOL + 0.5;
    const sy = START_GROW + 0.5;
    const histX = new Float32Array(HIST_LEN25).fill(sx);
    const histY = new Float32Array(HIST_LEN25).fill(sy);
    player25 = new Player25SM({
      pos:      new Vec2(sx, sy),
      walls:    state.darkMode ? wallsDark25 : wallsLight25,
      keysDown: gc.keysDown,
      half:     PLAYER_HALF25,
      won:      false,
      onWin:    () => { gc.state.levelSubPhase = 'win'; },
      onHitWall: (r, c) => {
        gc.sounds.play('mazeOof', { volume: 0.65 });
        shakeUntil25 = clock25.elapsed + SHAKE_SECS25;
        // The first time a mode gate stops you, the examiner names the trick.
        if (maze25[r] && maze25[r][c] >= 2 && gateHits25++ === 0) say(gc, GATE_LINE);
      },
      histX,
      histY,
      histIdx:  0,
    });
    clock25.last         = 0;
    clock25.elapsed      = 0;
    timerFrom25          = 0;
    hasToggledDark25     = false;
    prevDarkMode25       = state.darkMode;
    gateHits25           = 0;
    shakeUntil25         = 0;
    faceUpUntil25        = 0;
  }

  // ── Pause-aware clock: dt is 0 while paused, in the controls, or game over ──
  const { dt, elapsed } = levelClock(gc, clock25);
  const running = inputOpen(gc);
  const step    = running ? dt : 0;

  // ── The light switch ───────────────────────────────────────────────────────
  // Any change of mode (pause menu or the in-maze shortcut) makes the examiner
  // reach up for the switch for 400 ms. Real time, so the reach reads while the
  // pause menu is still open.
  if (prevDarkMode25 !== null && state.darkMode !== prevDarkMode25) {
    faceUpUntil25 = performance.now() + FACE_UP_MS25;
    if (!hasToggledDark25) {
      hasToggledDark25 = true;
      say(gc, FIRST_TOGGLE_LINE);
    }
  }
  prevDarkMode25 = state.darkMode;
  if (performance.now() < faceUpUntil25) gc.guideCharDir = 'up';

  // ── Countdown ──────────────────────────────────────────────────────────────
  let timeLeft = Math.max(0, TIMER_SECS25 - (elapsed - timerFrom25));
  if (running && timeLeft <= 0) {
    timerFrom25 = elapsed;
    timeLeft    = TIMER_SECS25;
    // wrong(gc) without its re-render: we are already inside a draw.
    triggerStamp(gc, 'INCORRECT', t.danger);
    gc.sounds.ui('deny');
    gc.loseLife();
    say(gc, TIMEOUT_LINE);
  }

  // ── Advance the dot ────────────────────────────────────────────────────────
  if (player25 && step > 0) {
    player25.data.walls = state.darkMode ? wallsDark25 : wallsLight25;
    player25.update(step);
  }

  const cellW = topBoxWidth  / GRID_COLS;
  const cellH = topBoxHeight / GRID_ROWS;
  const ox    = topBoxX;
  const oy    = topBoxY;

  // The oof shake: the maze jolts, the furniture does not. Frozen while paused.
  const shake = shakeUntil25 > elapsed ? (shakeUntil25 - elapsed) / SHAKE_SECS25 : 0;
  ctx.save();
  if (shake > 0) ctx.translate(Math.sin(elapsed * 90) * 3 * shake, Math.sin(elapsed * 140) * 1 * shake);

  // ── Walls (type-dependent visibility) ──────────────────────────────────────
  ctx.fillStyle = t.ink;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = maze25[r][c];
      if (cell === 0) continue;
      const visible = cell === 1 ||
                      (cell === 2 && state.darkMode) ||
                      (cell === 3 && !state.darkMode);
      if (visible) ctx.fillRect(ox + c * cellW, oy + r * cellH, cellW + 0.5, cellH + 0.5);
    }
  }

  // ── Exit glow ──────────────────────────────────────────────────────────────
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 380);
  ctx.save();
  ctx.globalAlpha = 0.45 + pulse * 0.45;
  ctx.fillStyle = t.pass;
  ctx.beginPath();
  ctx.arc(ox + (EXIT_GCOL + 0.5) * cellW, oy + 0.5 * cellH, cellW * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── Entry arrow ────────────────────────────────────────────────────────────
  ctx.fillStyle    = t.fgDim;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(cellH * 1.1)}px ${displayFont}`;
  ctx.fillText('▲', ox + (START_GCOL + 0.5) * cellW, oy + (GRID_ROWS - 0.5) * cellH);

  // ── Player dot ─────────────────────────────────────────────────────────────
  if (player25) {
    ctx.fillStyle = t.accent;
    ctx.beginPath();
    ctx.arc(ox + player25.data.pos.x * cellW, oy + player25.data.pos.y * cellH,
            Math.max(3, cellW * 0.11), 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Countdown bar ──────────────────────────────────────────────────────────
  const progress = Math.max(0, timeLeft / TIMER_SECS25);
  const barW     = topBoxWidth * 0.38;
  const barH     = 5;
  const barX     = cx - barW / 2;
  const barY     = oy + topBoxHeight - 14;
  const urgent   = progress < 0.33;

  ctx.strokeStyle = t.hairline;
  ctx.lineWidth   = 1;
  ctx.strokeRect(barX, barY, barW, barH);
  ctx.fillStyle = urgent ? t.danger : `hsl(${Math.round(progress * 120)},50%,42%)`;
  ctx.fillRect(barX + 1, barY + 1, (barW - 2) * progress, barH - 2);

  ctx.fillStyle    = urgent ? t.danger : t.fgDim;
  ctx.font         = `bold ${Math.round(10 * s)}px ${bodyFont}`;
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.ceil(timeLeft)}s`, barX - 4, barY + barH / 2);

  ctx.restore();   // end shake

  // ── Controls hint (sits above the bar, like the mock's label) ──────────────
  ctx.fillStyle    = t.fgDim;
  ctx.font         = `${Math.round(10 * s)}px ${bodyFont}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('WASD / ↑↓←→   toggle light/dark to reveal hidden walls', cx, oy + topBoxHeight - 30);

  // ── ◐ TOGGLE shortcut — only after the first pause-menu switch ─────────────
  if (hasToggledDark25) {
    const btnW = Math.round(96 * s);
    const btnH = Math.round(28 * s);
    const btnX = ox + topBoxWidth - btnW - 6;
    const btnY = oy + 6;
    ctx.fillStyle   = t.bg;
    ctx.strokeStyle = t.seal;
    ctx.lineWidth   = 1.5;
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeRect(btnX, btnY, btnW, btnH);
    ctx.fillStyle    = t.ink;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `bold ${Math.round(12 * s)}px ${bodyFont}`;
    ctx.fillText('◐  TOGGLE', btnX + btnW / 2, btnY + btnH / 2);
    gc.hitAreas.push({
      x: btnX, y: btnY, w: btnW, h: btnH,
      action: () => {
        if (!inputOpen(gc)) return;
        state.darkMode = !state.darkMode;
        gc.render();
      },
    });
  }

  // ── Harness hook ───────────────────────────────────────────────────────────
  (gc as unknown as { lv?: Record<string, unknown> }).lv = {
    pos:      player25 ? { x: player25.data.pos.x, y: player25.data.pos.y } : null,
    dark:     state.darkMode,
    toggled:  hasToggledDark25,
    timeLeft,
    gateHits: gateHits25,
    grid:     maze25,
    gates:    gates25,
    path:     solutionPath25,
    won:      player25 ? player25.data.won : false,
  };
};
