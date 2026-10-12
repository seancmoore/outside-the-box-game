import { GameContext } from '../types';
import { getTheme }    from '../theme';
import { getLayout }   from '../layout';
import { uiScale, triggerStamp } from '../renderer';
import { freshEntry, drawWinScreen, say, inputOpen, levelClock } from './lateralHelpers';

// ── Q28 — FRODRICK.EXE ────────────────────────────────────────────────────────
// The exam guide's integrity check fails and the paper becomes an arena. A black
// monitor with phosphor eyes sweeps overhead under a FRODRICK.EXE name tag; you
// are the small ink-blue ship at the bottom. A/D or the arrows move, SPACE fires.
// There is no lateral trick here on purpose: this is the Act III set piece, an
// honest bullet-dodge between two trick questions. The trap is standing under him
// when he fires. Every shot that lands on you slams INCORRECT and costs a heart.
//
// HP, damage, phase thresholds, and i-frames are unchanged from the original
// build: 110 boss HP, 5 damage a hit (22 hits), phases at 75 and 40 HP, 0.42s
// of blinking invincibility after a hit. The palette moved to fountain-pen ink.
// Fire rate was tightened up across all three phases to make him a tougher
// fight — see BOSS_FIRE_INTERVALS below.

// ── Tunables ────────────────────────────────────────────────────────────────
const PLAYER_W           = 40;
const PLAYER_H           = 26;
const PLAYER_SPEED       = 380;     // px/s
const PLAYER_BULLET_W    = 4;
const PLAYER_BULLET_H    = 14;
const PLAYER_BULLET_SPD  = 720;     // px/s
const PLAYER_FIRE_CD     = 0.22;    // seconds between shots
const PLAYER_DMG         = 5;
const PLAYER_IFRAMES     = 0.42;    // seconds of invincibility after a hit

const BOSS_W             = 150;
const BOSS_H             = 90;
const BOSS_HP_MAX        = 110;     // 22 hits to kill
const BOSS_BULLET_R      = 7;
const BOSS_Y_OFFSET      = 36;      // arena-relative top of the monitor

// Per-phase boss tuning: [phase 0 (HP 110→80), phase 1 (75→45), phase 2 (40→0)]
const BOSS_BULLET_SPEEDS  = [275, 360, 440];
// Tightened from the original [1.00, 0.75, 0.55] — Frodrick opens fire noticeably
// sooner in every phase, so there's less standing-around time between volleys.
const BOSS_FIRE_INTERVALS = [0.70, 0.50, 0.35];
const BOSS_OSC_HZ         = [0.45, 0.72, 1.10];   // horizontal sweep speed

// Fountain-pen ink in place of the source's neon.
const INK_RED    = '#C03A2E';
const INK_BLUE   = '#2E6BA8';
const INK_GREEN  = '#3F8F55';
const INK_YELLOW = '#D8A81F';
const PHASE_COLOR = [INK_GREEN, INK_YELLOW, INK_RED];
const SHIP_EDGE  = '#1C3F63';       // the ship's darker outline
const EYE_GREEN  = '111,207,136';   // phosphor tint of the ink green, on the black monitor

const HITS_LADDER: Record<number, string> = {
  1: 'Hit. Sidestep his shots, then get back under him.',
  2: 'One heart left. He fires from wherever he is. Do not be there.',
};
const PHASE_LADDER: Record<number, string> = {
  1: 'He is speeding up. So should you.',
  2: 'He is not calming down.',
};

const GLITCH_FORMS = ['Q.2▒', 'Q.■8', '0.28', 'Q_28', 'Q.2B', '█.28'];

interface Bullet { x: number; y: number; vx: number; vy: number; life: number; }

// ── Module-level state (reset on fresh entry) ────────────────────────────────
let listenersAdded28 = false;

let playerX28        = 0;
let playerHitTimer28 = 0;            // counts down; >0 = invincible after a hit
let bossX28          = 0;
let bossT28          = 0;            // accumulated time for the sin oscillation
let bossHP28         = BOSS_HP_MAX;
let bossPhase28      = 0;
let phaseFlash28     = 0;            // brief flash on phase change
let playerBullets28: Bullet[] = [];
let bossBullets28:   Bullet[] = [];
let playerFireT28    = 0;
let bossFireT28      = 0;
let hitsTaken28      = 0;
let hitsLanded28     = 0;
let seed28           = 0x9E3779B1;
let glitchNextAt28   = 0.8;          // seconds (pause-aware clock)
let glitchUntil28    = 0;
let glitchForm28     = GLITCH_FORMS[0];
const clock28 = { last: 0, elapsed: 0 };

const rnd28 = () => {
  seed28 ^= seed28 << 13;
  seed28 ^= seed28 >>> 17;
  seed28 ^= seed28 << 5;
  return ((seed28 >>> 0) % 10000) / 10000;
};

const phaseFor = (hp: number): number => (hp > 75 ? 0 : hp > 40 ? 1 : 2);

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

const ensureListeners28 = (gc: GameContext): void => {
  if (listenersAdded28) return;
  listenersAdded28 = true;
  // Stop SPACE / the arrows from scrolling the page while this level is active.
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (gc.state.currentLevel !== 28 || gc.state.currentScreen !== 'level') return;
    if (e.code === 'Space' || e.key === ' ' || e.key.indexOf('Arrow') === 0) e.preventDefault();
  });
};

const reset28 = (ax: number, aw: number) => {
  playerX28        = ax + aw / 2 - PLAYER_W / 2;
  playerHitTimer28 = 0;
  bossX28          = ax + (aw - BOSS_W) / 2;
  bossT28          = 0;
  bossHP28         = BOSS_HP_MAX;
  bossPhase28      = 0;
  phaseFlash28     = 0;
  playerBullets28  = [];
  bossBullets28    = [];
  playerFireT28    = 0;
  bossFireT28      = 0;
  hitsTaken28      = 0;
  hitsLanded28     = 0;
  seed28           = 0x9E3779B1;
  glitchNextAt28   = 0.8;
  glitchUntil28    = 0;
  glitchForm28     = GLITCH_FORMS[0];
  clock28.last     = 0;
  clock28.elapsed  = 0;
};

export const drawLevel28 = (gc: GameContext) => {
  ensureListeners28(gc);

  const { ctx, state, displayFont, bodyFont, monoFont } = gc;
  const { topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const t = getTheme(state);
  const s = uiScale(ctx);

  if (state.levelSubPhase === 'win') {
    drawWinScreen(gc, 'TERMINATED.', 'FRODRICK.EXE has been removed from the examination. Again.', 29);
    return;
  }

  const ax = topBoxX, ay = topBoxY, aw = topBoxWidth, ah = topBoxHeight;
  const bossY   = ay + BOSS_Y_OFFSET;
  const playerY = ay + ah - 64;

  if (freshEntry(gc)) reset28(ax, aw);

  // The HUD admits how close this is getting.
  state.hudHeartsLabel = state.lives === 1 ? 'CANDIDATE STANDING (BARELY)' : undefined;

  // ── Simulation step (pause-aware: dt is 0 whenever input is closed) ────────
  const live = inputOpen(gc);
  const { dt: rawDt } = levelClock(gc, clock28);
  const dt = live ? rawDt : 0;

  if (dt > 0) {
    // player movement
    let pvx = 0;
    const k = gc.keysDown;
    if (k.has('a') || k.has('A') || k.has('ArrowLeft'))  pvx -= 1;
    if (k.has('d') || k.has('D') || k.has('ArrowRight')) pvx += 1;
    playerX28 += pvx * PLAYER_SPEED * dt;

    // player firing (hold SPACE to autofire)
    playerFireT28 += dt;
    if ((k.has(' ') || k.has('Spacebar')) && playerFireT28 >= PLAYER_FIRE_CD) {
      playerFireT28 = 0;
      playerBullets28.push({ x: playerX28 + PLAYER_W / 2, y: playerY, vx: 0, vy: -PLAYER_BULLET_SPD, life: 0 });
      gc.sounds.play('dash', { volume: 0.18, restart: true });
    }

    // boss horizontal oscillation
    bossT28 += dt;
    const oscRange = (aw - BOSS_W - 40) / 2;
    bossX28 = ax + (aw - BOSS_W) / 2 + Math.sin(bossT28 * Math.PI * 2 * BOSS_OSC_HZ[bossPhase28]) * oscRange;

    // boss firing: one drop, then a triple, then a five-way fan
    bossFireT28 += dt;
    if (bossFireT28 >= BOSS_FIRE_INTERVALS[bossPhase28]) {
      bossFireT28 = 0;
      const speed = BOSS_BULLET_SPEEDS[bossPhase28];
      const bcx = bossX28 + BOSS_W / 2;
      const bcy = bossY + BOSS_H;
      if (bossPhase28 === 0) {
        bossBullets28.push({ x: bcx, y: bcy, vx: 0, vy: speed, life: 0 });
      } else if (bossPhase28 === 1) {
        bossBullets28.push({ x: bcx - 30, y: bcy, vx: 0, vy: speed, life: 0 });
        bossBullets28.push({ x: bcx,      y: bcy, vx: 0, vy: speed, life: 0 });
        bossBullets28.push({ x: bcx + 30, y: bcy, vx: 0, vy: speed, life: 0 });
      } else {
        for (let i = -2; i <= 2; i++) {
          const a = i * 0.22;
          bossBullets28.push({ x: bcx, y: bcy, vx: speed * Math.sin(a), vy: speed * Math.cos(a), life: 0 });
        }
      }
      gc.sounds.play('boom', { volume: 0.18, restart: true });
    }

    // bullets
    for (const b of playerBullets28) { b.x += b.vx * dt; b.y += b.vy * dt; }
    for (const b of bossBullets28)   { b.x += b.vx * dt; b.y += b.vy * dt; }

    // player bullet vs boss
    let killed = false;
    for (let i = playerBullets28.length - 1; i >= 0; i--) {
      const b = playerBullets28[i];
      if (b.x >= bossX28 && b.x <= bossX28 + BOSS_W && b.y >= bossY && b.y <= bossY + BOSS_H) {
        playerBullets28.splice(i, 1);
        hitsLanded28++;
        bossHP28 = Math.max(0, bossHP28 - PLAYER_DMG);
        const newPhase = phaseFor(bossHP28);
        if (newPhase !== bossPhase28) {
          bossPhase28 = newPhase;
          phaseFlash28 = 1;
          const line = PHASE_LADDER[newPhase];
          if (line) say(gc, line);
        }
        gc.sounds.play('correctAnswer', { volume: 0.20, restart: true });
        if (bossHP28 === 0) { killed = true; break; }
      }
    }
    if (killed) {
      state.levelSubPhase = 'win';
      return;
    }

    // boss bullet vs player (circle vs rect), with i-frames
    if (playerHitTimer28 <= 0) {
      for (let i = bossBullets28.length - 1; i >= 0; i--) {
        const b = bossBullets28[i];
        const nx = Math.max(playerX28, Math.min(b.x, playerX28 + PLAYER_W));
        const ny = Math.max(playerY,   Math.min(b.y, playerY   + PLAYER_H));
        const dx = b.x - nx, dy = b.y - ny;
        if (dx * dx + dy * dy < BOSS_BULLET_R * BOSS_BULLET_R) {
          bossBullets28.splice(i, 1);
          playerHitTimer28 = PLAYER_IFRAMES;
          hitsTaken28++;
          // wrong(gc) without its trailing gc.render(): we are already inside a
          // frame, and re-entering render mid-draw would wipe this frame's hit areas.
          triggerStamp(gc, 'INCORRECT', t.danger);
          gc.sounds.ui('deny');
          gc.loseLife();
          const line = HITS_LADDER[hitsTaken28];
          if (line) say(gc, line);
          break;
        }
      }
    } else {
      playerHitTimer28 = Math.max(0, playerHitTimer28 - dt);
    }

    // cull off-arena bullets
    playerBullets28 = playerBullets28.filter(b => b.y > ay - 30);
    bossBullets28   = bossBullets28.filter(b => b.y < ay + ah + 30 && b.x > ax - 30 && b.x < ax + aw + 30);

    if (phaseFlash28 > 0) phaseFlash28 = Math.max(0, phaseFlash28 - dt * 4);
  }

  // Keep the ship inside the arena even when the window is resized mid-fight.
  playerX28 = Math.max(ax + 6, Math.min(ax + aw - PLAYER_W - 6, playerX28));

  // ── Draw ──────────────────────────────────────────────────────────────────
  const phaseColor = PHASE_COLOR[bossPhase28];
  const bx = bossX28, by = bossY;

  // arena tint
  ctx.save();
  ctx.beginPath();
  ctx.rect(ax, ay, aw, ah);
  ctx.clip();

  ctx.fillStyle = state.darkMode ? '#0a0010' : '#f0e8f0';
  ctx.fillRect(ax, ay, aw, ah);
  if (phaseFlash28 > 0) {
    // A white flash is invisible on pale paper, so light mode flashes the new phase colour.
    ctx.fillStyle = state.darkMode
      ? `rgba(255,255,255,${phaseFlash28 * 0.5})`
      : rgba(phaseColor, phaseFlash28 * 0.35);
    ctx.fillRect(ax, ay, aw, ah);
  }

  // boss: monitor body
  ctx.fillStyle = '#1a1a26';
  ctx.fillRect(bx, by, BOSS_W, BOSS_H);
  ctx.strokeStyle = phaseColor;
  ctx.lineWidth   = 3;
  ctx.strokeRect(bx, by, BOSS_W, BOSS_H);

  // CRT scanlines across his face
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0; y < BOSS_H; y += 4) ctx.fillRect(bx, by + y, BOSS_W, 1);

  // eyes flicker when angry
  const flicker = Math.sin(performance.now() / 60) > (0.7 - bossPhase28 * 0.3) ? 0.4 : 1;
  ctx.fillStyle = `rgba(${EYE_GREEN},${flicker})`;
  const eyeY = by + BOSS_H * 0.35;
  ctx.fillRect(bx + BOSS_W * 0.22, eyeY, 16, 12);
  ctx.fillRect(bx + BOSS_W * 0.62, eyeY, 16, 12);

  // mouth gets jaggier with each phase
  ctx.strokeStyle = `rgba(${EYE_GREEN},${flicker})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const mouthY = by + BOSS_H * 0.72;
  const teeth  = 4 + bossPhase28 * 2;
  for (let i = 0; i <= teeth; i++) {
    const tx = bx + BOSS_W * 0.25 + (i / teeth) * BOSS_W * 0.5;
    const ty = mouthY + (i % 2 === 0 ? 0 : 6 + bossPhase28 * 2);
    if (i === 0) ctx.moveTo(tx, ty);
    else ctx.lineTo(tx, ty);
  }
  ctx.stroke();

  // name tag
  ctx.fillStyle    = INK_GREEN;
  ctx.font         = `bold ${Math.round(11 * s)}px ${displayFont}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('FRODRICK.EXE', bx + BOSS_W / 2, by - 16);

  // boss HP bar along the top of the arena
  const hpBarW = aw * 0.6;
  const hpBarX = ax + (aw - hpBarW) / 2;
  const hpBarY = ay + 8;
  const hpBarH = 10;
  ctx.strokeStyle = t.hairline;
  ctx.lineWidth   = 1;
  ctx.strokeRect(hpBarX + 0.5, hpBarY + 0.5, hpBarW, hpBarH);
  ctx.fillStyle = phaseColor;
  ctx.fillRect(hpBarX + 1, hpBarY + 1, (hpBarW - 2) * (bossHP28 / BOSS_HP_MAX), hpBarH - 2);

  // player ship (blinks through the i-frames)
  const blink = playerHitTimer28 > 0 && Math.floor(playerHitTimer28 * 18) % 2 === 0;
  if (!blink) {
    const px = playerX28;
    ctx.fillStyle = INK_BLUE;
    ctx.beginPath();
    ctx.moveTo(px + PLAYER_W / 2,   playerY);
    ctx.lineTo(px + PLAYER_W,       playerY + PLAYER_H);
    ctx.lineTo(px + PLAYER_W * 0.7, playerY + PLAYER_H - 4);
    ctx.lineTo(px + PLAYER_W * 0.3, playerY + PLAYER_H - 4);
    ctx.lineTo(px,                  playerY + PLAYER_H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = SHIP_EDGE;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = INK_YELLOW;
    const glowH = 4 + Math.sin(performance.now() / 60) * 2;
    ctx.fillRect(px + PLAYER_W * 0.42, playerY + PLAYER_H - 2, PLAYER_W * 0.16, glowH);
  }

  // player bullets
  ctx.fillStyle = INK_BLUE;
  for (const b of playerBullets28) {
    ctx.fillRect(b.x - PLAYER_BULLET_W / 2, b.y - PLAYER_BULLET_H, PLAYER_BULLET_W, PLAYER_BULLET_H);
  }

  // boss bullets
  ctx.fillStyle = phaseColor;
  for (const b of bossBullets28) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, BOSS_BULLET_R, 0, Math.PI * 2);
    ctx.fill();
  }

  // controls line
  ctx.fillStyle    = t.fgDim;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font         = `bold ${Math.round(11 * s)}px ${bodyFont}`;
  ctx.fillText('A / D or ← →  to move    ·    SPACE to fire', ax + aw / 2, ay + ah - 14);

  ctx.restore();

  // ── Integrity failure bleeding into the paper's own header ────────────────
  // Scanlines over the header band and a twitching, corrupting item label. The
  // header is chrome, so it is drawn after the level: hook in with afterPanel.
  const elapsed = clock28.elapsed;
  if (elapsed >= glitchNextAt28) {
    glitchForm28   = GLITCH_FORMS[Math.floor(rnd28() * GLITCH_FORMS.length)];
    glitchUntil28  = elapsed + 0.07 + rnd28() * 0.06;
    glitchNextAt28 = glitchUntil28 + 0.9 + rnd28() * 1.6;
  }
  const corrupted = elapsed < glitchUntil28;
  // The CSS twitch cycle: three brief nudges per 1.3s, frozen while paused.
  const cyc = (elapsed % 1.3) / 1.3;
  let jx = 0, jy = 0, aberrate = false;
  if (cyc >= 0.07 && cyc < 0.11)      { jx =  1; jy =  0; aberrate = true; }
  else if (cyc >= 0.11 && cyc < 0.14) { jx = -1; jy =  1; }
  else if (cyc >= 0.49 && cyc < 0.52) { jx = -2; jy =  0; aberrate = true; }
  else if (cyc >= 0.52 && cyc < 0.55) { jx =  1; jy = -1; }
  else if (cyc >= 0.85 && cyc < 0.88) { jx =  0; jy =  2; aberrate = true; }

  gc.afterPanel = (g) => {
    const paper = g.chrome.paper;
    const label = g.chrome.qLabel;
    const gx = g.ctx;
    const { headerH } = getLayout(gx);
    if (label) {
      const lx = label.x + 6, lcy = label.y + label.h / 2;
      const text = corrupted ? glitchForm28 : `Q.${g.state.currentLevel}`;
      gx.save();
      // paint over the clean label the HUD just drew, then redraw it glitching
      gx.fillStyle = getTheme(g.state).panel;
      gx.fillRect(label.x - 2, label.y - 2, label.w + 8, label.h + 4);
      gx.font         = `bold ${Math.round(22 * s)}px ${monoFont}`;
      gx.textAlign    = 'left';
      gx.textBaseline = 'middle';
      if (aberrate) {
        gx.fillStyle = 'rgba(192,58,46,0.55)';
        gx.fillText(text, lx + jx - 2, lcy + jy);
        gx.fillStyle = 'rgba(46,107,168,0.55)';
        gx.fillText(text, lx + jx + 2, lcy + jy);
      }
      gx.fillStyle = getTheme(g.state).ink;
      gx.fillText(text, lx + jx, lcy + jy);
      gx.restore();
    }
    if (paper && headerH > 0) {
      gx.save();
      gx.beginPath();
      gx.rect(paper.x + 1, paper.y + 1, paper.w - 2, headerH - 1);
      gx.clip();
      gx.fillStyle = g.state.darkMode ? 'rgba(244,238,222,0.06)' : 'rgba(30,26,21,0.07)';
      for (let y = 0; y < headerH; y += 4) gx.fillRect(paper.x, paper.y + y, paper.w, 1);
      gx.restore();
    }
  };

  // ── Test hook (read-only fight state plus the mock's HP shortcut) ─────────
  const dev = window as unknown as { __gc?: { lv?: Record<string, unknown> } };
  if (dev.__gc) dev.__gc.lv = {
    hp: bossHP28,
    phase: bossPhase28,
    playerX: playerX28,
    bossX: bossX28,
    bossT: bossT28,
    hitsTaken: hitsTaken28,
    hitsLanded: hitsLanded28,
    bb: bossBullets28.map(b => ({ x: b.x, y: b.y })),
    pb: playerBullets28.length,
    // Shortens the fight for tests only; every hit still has to be earned.
    setBossHP: (n: number) => {
      bossHP28 = Math.max(0, Math.min(BOSS_HP_MAX, n));
      bossPhase28 = phaseFor(bossHP28);
      return bossHP28;
    },
  };
};
