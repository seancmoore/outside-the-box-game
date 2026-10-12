import { GameContext } from '../types';
import { getTheme }    from '../theme';
import { getLayout }   from '../layout';
import { drawButton, drawSeal, drawMedallion, drawHeart, roundRect, uiScale } from '../renderer';
import { say, wrong, inputOpen, levelClock } from './lateralHelpers';

// ── Q50 — Your Name ───────────────────────────────────────────────────────────
// The final item asks the one question the candidate answered before the exam
// began: the name typed into Q1. Anything else is not the name on file, costs a
// heart and clears the field. The right name opens the CORRECT screen and then
// the certificate: tier-coloured double border, spinning medallion, elapsed
// time, and a serial line that records the standing you finished on.

const WRONG_LINE = 'That is not the name you gave me. I have it written down.';
const WIN_LINE   = 'Certified. Corporate would like to remind you this is not a real certificate.';

// Module state (reset on fresh entry, in drawNameRecall).
let fails50 = 0;
const clock50 = { last: 0, elapsed: 0 };

// ── Certificate content per tier ──────────────────────────────────────────────
const TIERS = {
  gold: {
    label:       'GOLD',
    color:       '#C79A2E',
    colorDim:    'rgba(199,154,46,0.34)',
    title:       'Distinguished Excellence Award',
    timeLabel:   'Elite Completion',
    body: [
      'This certificate stands as irrefutable proof of your undeniable',
      'critical thinking and problem solving prowess.',
      'Employers should be drooling at the thought of you joining their team.',
    ],
    footnote: 'Completed in record time. Outstanding.',
  },
  silver: {
    label:       'SILVER',
    color:       '#8C97A0',
    colorDim:    'rgba(140,151,160,0.34)',
    title:       'Certificate of Achievement',
    timeLabel:   'Strong Completion',
    body: [
      'This certificate is proof of your undeniable critical thinking',
      'and problem solving skills.',
      'Any employer would be lucky, truly lucky, to have you on their team.',
    ],
    footnote: 'Solid performance. Well earned.',
  },
  bronze: {
    label:       'BRONZE',
    color:       '#B0703A',
    colorDim:    'rgba(176,112,58,0.34)',
    title:       'Certificate of Completion',
    timeLabel:   'Completion',
    body: [
      'This certificate is proof that you possess critical thinking',
      'and problem solving skills.',
      'The right employer will recognise your potential. Keep going.',
    ],
    footnote: 'Finished is finished. That counts.',
  },
} as const;

type Tier = keyof typeof TIERS;

function getTier(finalMs: number): Tier {
  const minutes = finalMs / 60000;
  if (minutes < 20) return 'gold';
  if (minutes < 28) return 'silver';
  return 'bronze';
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatDate(): string {
  const d = new Date();
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// A fresh serial per completion (not derived from the name, so two runs by the
// same candidate — or two candidates who typed the same name — don't collide).
let serialNo50 = '';
function newSerial(): string {
  return `No. OTB-50-${1000 + Math.floor(Math.random() * 9000)}`;
}
function ensureSerial(): string {
  if (!serialNo50) serialNo50 = newSerial();
  return serialNo50;
}

function sanitizeFileName(name: string): string {
  return (name || 'Candidate').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Candidate';
}

// The card is authored at this reference size (a proper landscape diploma
// ratio, ~1.56:1) and scaled uniformly from there — on screen, or upscaled
// for a crisp export — so it always reads as a certificate, never a square.
const CERT_REF_W = 1000;
const CERT_REF_H = 640;

// Where the live card sits on the game canvas: always the reference ratio,
// sized to the viewport and nudged up to leave room for the buttons below it.
function certificateRect(gc: GameContext) {
  const w = gc.ctx.canvas.width, h = gc.ctx.canvas.height;
  let certW = Math.min(w * 0.86, 1040);
  let certH = certW * (CERT_REF_H / CERT_REF_W);
  const maxH = h * 0.60;
  if (certH > maxH) { certW *= maxH / certH; certH = maxH; }
  const certX = (w - certW) / 2;
  const certY = (h - certH) / 2 - h * 0.045;
  return { x: certX, y: certY, w: certW, h: certH };
}

// A throwaway GameContext pointed at a different canvas — lets the gc-based
// drawing helpers (drawSeal, drawMedallion) render onto an offscreen context.
const withCtx = (gc: GameContext, ctx: CanvasRenderingContext2D): GameContext => ({ ...gc, ctx });

// ── The card itself: paper, border, every line of copy, both signatures. No
// backdrop dimming and no buttons — those belong to the live screen only, not
// to an exported image/video. Draws at `rect`'s own size on whatever context
// it is given, using a local scale derived from rect (not the game's global
// uiScale), so this renders identically whether it is small and live, or
// rendered 2x into an offscreen canvas for a crisp download. `opts.spin`
// controls the medallion: 0.9 (the default) for a live spin, exactly 0 to
// freeze it front-on, showing the "OtB" face — what the still image exports.
function paintCertificateCard(
  gc: GameContext, ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  opts: { spin?: number } = {},
) {
  const { state, displayFont, bodyFont, monoFont } = gc;
  const t = getTheme(state);
  const cs = rect.w / CERT_REF_W;   // local card scale — independent of uiScale
  const tier = getTier(state.examFinalMs);
  const tc = TIERS[tier];
  const { x: certX, y: certY, w: certW, h: certH } = rect;
  const cx = certX + certW / 2;
  const Y = (f: number) => certY + certH * f;
  const gCard = withCtx(gc, ctx);

  // paper
  ctx.save();
  ctx.shadowColor = 'rgba(40,25,5,0.40)';
  ctx.shadowBlur = 40 * cs;
  ctx.shadowOffsetY = 14 * cs;
  roundRect(ctx, certX, certY, certW, certH, 4 * cs);
  ctx.fillStyle = state.darkMode ? '#221C13' : '#FCF9F0';
  ctx.fill();
  ctx.restore();

  // tier-coloured double border + corner diamonds
  ctx.strokeStyle = tc.color;
  ctx.lineWidth = 3 * cs;
  roundRect(ctx, certX + 8 * cs, certY + 8 * cs, certW - 16 * cs, certH - 16 * cs, 2 * cs);
  ctx.stroke();
  ctx.strokeStyle = tc.colorDim;
  ctx.lineWidth = 1 * cs;
  roundRect(ctx, certX + 14 * cs, certY + 14 * cs, certW - 28 * cs, certH - 28 * cs, 2 * cs);
  ctx.stroke();
  drawCertCorners(ctx, certX + 8 * cs, certY + 8 * cs, certW - 16 * cs, certH - 16 * cs, tc.color, cs);

  // seal watermark behind the text — bumped up from 0.05, which read as
  // basically invisible, to something you can actually make out
  ctx.save();
  ctx.globalAlpha = 0.14;
  drawSeal(gCard, cx, Y(0.55), certH * 0.3, { color: tc.color });
  ctx.restore();

  // date (left) and standing + serial (right) along the top — bumped up from
  // 10px so the date and the serial number both read clearly at a glance.
  ctx.fillStyle = t.fgDim;
  ctx.font = `bold ${Math.round(13 * cs)}px ${monoFont}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(formatDate(), certX + 28 * cs, Y(0.075));
  drawStandingLine(gc, ctx, cs, certX + certW - 28 * cs, Y(0.075));

  // institute eyebrow
  ctx.fillStyle = tc.color;
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.round(13 * cs)}px ${monoFont}`;
  ctx.fillText('INSTITUTE OF LATERAL COGNITION', cx, Y(0.13));

  // award medallion (the 3D hero). Spin 0 freezes it "OtB"-face-forward —
  // exactly what the still-image export wants.
  drawMedallion(gCard, cx, Y(0.245), certH * 0.062, { spin: opts.spin ?? 0.9 });

  // tier badge
  ctx.fillStyle = tc.color;
  ctx.font = `bold ${Math.round(15 * cs)}px ${monoFont}`;
  ctx.fillText(`✦   ${tc.label} TIER   ✦`, cx, Y(0.355));

  // title (shrunk to fit)
  ctx.fillStyle = t.ink;
  const titlePx = fitText(ctx, tc.title, certW * 0.84, Math.round(30 * cs), displayFont, 'bold');
  ctx.font = `bold ${titlePx}px ${displayFont}`;
  ctx.fillText(tc.title, cx, Y(0.42));

  // certify line
  ctx.fillStyle = t.fgDim;
  ctx.font = `italic ${Math.round(14 * cs)}px ${displayFont}`;
  ctx.fillText('This is to certify that', cx, Y(0.50));

  // candidate name + flourish
  ctx.fillStyle = tc.color;
  const namePx = fitText(ctx, state.playerName, certW * 0.7, Math.round(40 * cs), displayFont, 'bold');
  ctx.font = `bold ${namePx}px ${displayFont}`;
  ctx.fillText(state.playerName, cx, Y(0.585));
  const nameW = Math.min(ctx.measureText(state.playerName).width, certW * 0.7);
  ctx.strokeStyle = tc.colorDim;
  ctx.lineWidth = 1 * cs;
  ctx.beginPath();
  ctx.moveTo(cx - nameW / 2 - 12 * cs, Y(0.63));
  ctx.lineTo(cx + nameW / 2 + 12 * cs, Y(0.63));
  ctx.stroke();

  // body
  ctx.fillStyle = t.fgMid;
  const bodyPx = Math.round(13.5 * cs);
  ctx.font = `${bodyPx}px ${bodyFont}`;
  tc.body.forEach((line, i) => ctx.fillText(line, cx, Y(0.685) + i * (bodyPx * 1.5), certW * 0.82));

  // divider
  ctx.strokeStyle = tc.colorDim;
  ctx.lineWidth = 1 * cs;
  ctx.beginPath();
  ctx.moveTo(certX + certW * 0.12, Y(0.80));
  ctx.lineTo(certX + certW * 0.88, Y(0.80));
  ctx.stroke();

  // grade + time
  ctx.fillStyle = tc.color;
  ctx.font = `bold ${Math.round(14 * cs)}px ${monoFont}`;
  ctx.fillText(`${tc.timeLabel.toUpperCase()}    ·    ${formatTime(state.examFinalMs)}`, cx, Y(0.845));

  // footnote
  ctx.fillStyle = t.fgDim;
  ctx.font = `italic ${Math.round(12.5 * cs)}px ${displayFont}`;
  ctx.fillText(tc.footnote, cx, Y(0.878));

  // signatures — left stays the in-universe examiner; right is the real one:
  // the actual person who made this game, signed in an actual cursive hand.
  const sigY = Y(0.925);
  const lx = certX + certW * 0.27;
  const rx = certX + certW * 0.73;

  // The examiner's own sprite (the character from the bottom panel all exam
  // long), standing right next to the mark he actually made.
  if (gc.playerDownLoaded) {
    const exSize = 42 * cs;
    const exRight = lx - 72 * cs - 22 * cs;
    ctx.drawImage(gc.playerDownImg, exRight - exSize, sigY - 14 * cs - exSize / 2, exSize, exSize);
  }

  drawSignature(ctx, lx, sigY - 14 * cs, tc.color, cs);
  ctx.strokeStyle = t.hairline;
  ctx.lineWidth = 1 * cs;
  ctx.beginPath(); ctx.moveTo(lx - 72 * cs, sigY); ctx.lineTo(lx + 72 * cs, sigY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx - 72 * cs, sigY); ctx.lineTo(rx + 72 * cs, sigY); ctx.stroke();

  ctx.save();
  ctx.fillStyle = tc.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `italic ${Math.round(24 * cs)}px "Segoe Script","Brush Script MT",cursive`;
  ctx.fillText('Sean Moore', rx, sigY - 5 * cs);
  ctx.restore();

  ctx.fillStyle = t.fgDim;
  ctx.font = `bold ${Math.round(11.5 * cs)}px ${monoFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('CHIEF EXAMINER', lx, sigY + 6 * cs);
  ctx.fillText('DESIGNED BY', rx, sigY + 6 * cs);

  // credit / portfolio — moved into the bottom corners as fine print rather
  // than a banner across the middle, under the signature each half belongs to.
  const cornerY1 = certY + certH - 27 * cs;
  const cornerY2 = certY + certH - 12 * cs;
  ctx.fillStyle = t.fgDim;
  ctx.font = `${Math.round(10 * cs)}px ${monoFont}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('OUTSIDE THE BOX', certX + 22 * cs, cornerY1);
  ctx.fillText('BUILT BY SEAN MOORE', certX + 22 * cs, cornerY2);

  ctx.fillStyle = tc.color;
  ctx.font = `bold ${Math.round(15 * cs)}px ${monoFont}`;
  ctx.textAlign = 'right';
  ctx.fillText('sean-moore-portfolio.web.app', certX + certW - 22 * cs, cornerY2);
}

function downloadCertificateImage(gc: GameContext) {
  const scale = 2;         // crisp on a retina share/print
  const pad = 70 * scale;  // room for the drop shadow, unclipped
  const cw = CERT_REF_W * scale, ch = CERT_REF_H * scale;
  const off = document.createElement('canvas');
  off.width = cw + pad * 2;
  off.height = ch + pad * 2;
  const octx = off.getContext('2d');
  if (!octx) return;

  octx.fillStyle = gc.state.darkMode ? '#15110C' : '#EDE4D0';
  octx.fillRect(0, 0, off.width, off.height);

  // Frozen "OtB" face — the still image never shows a half-turned coin.
  paintCertificateCard(gc, octx, { x: pad, y: pad, w: cw, h: ch }, { spin: 0 });

  off.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OtB-Certificate-${sanitizeFileName(gc.state.playerName)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');
}

let recording50 = false;

// Renders the card fresh into its own offscreen canvas for one full medallion
// rotation and hands back a .webm — the animated version of the certificate,
// with none of the page's dimmed backdrop or buttons in frame.
function downloadCertificateVideo(gc: GameContext) {
  if (recording50) return;
  const scale = 1.5;
  const pad = 70 * scale;
  const cw = CERT_REF_W * scale, ch = CERT_REF_H * scale;
  const off = document.createElement('canvas');
  off.width = cw + pad * 2;
  off.height = ch + pad * 2;
  const octx = off.getContext('2d');
  const capturable = off as unknown as { captureStream?: (fps?: number) => MediaStream };
  if (!octx || typeof capturable.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
    // No MediaRecorder support in this browser — the still image is the fallback.
    downloadCertificateImage(gc);
    return;
  }

  recording50 = true;
  const bgFill = gc.state.darkMode ? '#15110C' : '#EDE4D0';
  const stream = capturable.captureStream(30);
  const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  let raf = 0;
  const draw = () => {
    octx.fillStyle = bgFill;
    octx.fillRect(0, 0, off.width, off.height);
    paintCertificateCard(gc, octx, { x: pad, y: pad, w: cw, h: ch }, { spin: 0.9 });
    raf = requestAnimationFrame(draw);
  };

  recorder.onstop = () => {
    cancelAnimationFrame(raf);
    recording50 = false;
    const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OtB-Certificate-${sanitizeFileName(gc.state.playerName)}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  draw();
  recorder.start();
  // One full medallion rotation at the default spin (0.9 rad/s) takes
  // 2π / 0.9 ≈ 7s — long enough for a seamless loop.
  setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 7000);
}

// Shrinks font px until the text fits maxW.
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, px: number, family: string, weight = ''): number {
  ctx.font = `${weight} ${px}px ${family}`;
  const wdt = ctx.measureText(text).width;
  return wdt <= maxW ? px : Math.max(10, Math.floor(px * maxW / wdt));
}

// Small diamond ornaments at the inner-border corners.
function drawCertCorners(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, s: number) {
  const d = 7 * s;
  ctx.fillStyle = color;
  for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-d / 2, -d / 2, d, d);
    ctx.restore();
  }
}

// A faux handwritten signature scribble.
function drawSignature(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, s: number) {
  const u = 16 * s;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, 1.8 * s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 2.6 * u, cy + 0.3 * u);
  ctx.bezierCurveTo(cx - 1.8 * u, cy - 1.2 * u, cx - 1.2 * u, cy + 1.0 * u, cx - 0.6 * u, cy - 0.2 * u);
  ctx.bezierCurveTo(cx - 0.2 * u, cy - 1.1 * u, cx + 0.2 * u, cy + 0.9 * u, cx + 0.8 * u, cy - 0.1 * u);
  ctx.bezierCurveTo(cx + 1.4 * u, cy - 1.1 * u, cx + 2.0 * u, cy + 0.6 * u, cx + 2.7 * u, cy - 0.3 * u);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 0.4 * u, cy + 0.7 * u);
  ctx.lineTo(cx + 1.7 * u, cy - 0.5 * u);
  ctx.stroke();
  ctx.restore();
}

// The serial line, right-aligned: STANDING AT COMPLETION <hearts>  ·  No. OTB-50-####
// The hearts are the HUD's own vector heart, so the diploma records what the
// candidate finished on: full for the hearts still held, faded for the spent ones.
function drawStandingLine(gc: GameContext, ctx: CanvasRenderingContext2D, cs: number, rightX: number, y: number) {
  const { state, monoFont } = gc;
  const t = getTheme(state);

  const label = 'STANDING AT COMPLETION';
  const tail  = `   ·   ${ensureSerial()}`;
  // Bumped up from 11/10px — the serial number is the one thing on this card
  // meant to look like a real record, so it needs to actually be readable.
  const heartSize = Math.round(13 * cs);
  const heartStep = heartSize + Math.round(3 * cs);
  const heartsW   = heartStep * 3;
  const gap = 8 * cs;
  const labelPx = Math.round(11 * cs);
  const tailPx  = Math.round(13 * cs);

  ctx.font = `bold ${labelPx}px ${monoFont}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const labelW = ctx.measureText(label).width;
  ctx.font = `bold ${tailPx}px ${monoFont}`;
  const tailW  = ctx.measureText(tail).width;

  let mx = rightX - (labelW + gap + heartsW + tailW);
  ctx.font = `bold ${labelPx}px ${monoFont}`;
  ctx.fillStyle = t.fgDim;
  ctx.fillText(label, mx, y);
  mx += labelW + gap;

  for (let i = 0; i < 3; i++) {
    const hcx = mx + heartStep * i + heartSize / 2;
    ctx.save();
    if (i >= state.lives) ctx.globalAlpha = 0.35;   // the mock fades the spent hearts
    drawHeart(ctx, hcx, y, heartSize, t.accent, t.accentDeep, 1);
    ctx.restore();
  }
  mx += heartsW;

  ctx.font = `bold ${tailPx}px ${monoFont}`;
  ctx.fillStyle = t.ink;
  ctx.fillText(tail, mx, y);
}

// ── The diploma (full-screen presentation) ────────────────────────────────────
function drawCertificate(gc: GameContext) {
  const { ctx, state } = gc;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const s = uiScale(ctx);

  // backdrop focus
  ctx.fillStyle = state.darkMode ? 'rgba(0,0,0,0.34)' : 'rgba(40,30,15,0.12)';
  ctx.fillRect(0, 0, w, h);

  const rect = certificateRect(gc);
  const { x: certX, y: certY, w: certW, h: certH } = rect;
  const cx = certX + certW / 2;

  paintCertificateCard(gc, ctx, rect, { spin: 0.9 });

  // main menu
  const btnW = Math.min(certW * 0.34, 240);
  const btnH = Math.max(42, h * 0.058);
  const menuY = certY + certH + h * 0.028;
  drawButton(gc, 'MAIN MENU', cx - btnW / 2, menuY, btnW, btnH, () => {
    state.currentScreen = 'mainmenu';
    state.examStartTime = 0;
    gc.resetPlayerName();
    gc.render();
  }, 18);

  // download the card — a still image always, or a short clip of the spin
  const dlW  = Math.min(certW * 0.30, 210);
  const dlH  = Math.max(36, h * 0.044);
  const dlY  = menuY + btnH + h * 0.016;
  const dlGap = 14 * s;
  drawButton(gc, 'DOWNLOAD IMAGE', cx - dlW - dlGap / 2, dlY, dlW, dlH, () => {
    downloadCertificateImage(gc);
  }, 13);
  drawButton(gc, recording50 ? 'RECORDING…' : 'DOWNLOAD VIDEO', cx + dlGap / 2, dlY, dlW, dlH, () => {
    downloadCertificateVideo(gc);
  }, 13);
}

// The examiner's closing remark, drawn on the CORRECT screen. The engine hides
// the examiner panel for the whole level-50 endgame, so if the panel is not on
// screen (gc.chrome.remarks is missing) the level draws the remark itself, with
// the same typewriter reveal the panel uses.
function drawWinRemark(gc: GameContext) {
  if (gc.chrome.remarks) return;   // the real panel is up and already says it
  const { ctx, state, bodyFont, monoFont } = gc;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const t = getTheme(state);
  const s = uiScale(ctx);
  const cx = w / 2;

  const lines = state.guideLines && state.guideLines.length ? state.guideLines : [WIN_LINE];
  const totalChars = lines.reduce((sum, line) => sum + line.length, 0);
  const isTyping = state.guideReveal < totalChars;

  let charsLeft = Math.max(0, state.guideReveal);
  const shown: string[] = [];
  for (const line of lines) {
    if (charsLeft <= 0) break;
    shown.push(line.slice(0, Math.min(charsLeft, line.length)));
    charsLeft -= line.length;
  }
  if (shown.length && (isTyping || state.guideCursor)) shown[shown.length - 1] += ' |';

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = t.fgDim;
  ctx.font = `${Math.round(11 * s)}px ${monoFont}`;
  ctx.fillText("EXAMINER'S REMARKS", cx, h * 0.775);

  ctx.fillStyle = t.fg;
  ctx.font = `${Math.round(16 * s)}px ${bodyFont}`;
  const gapY = 26 * s;
  shown.forEach((line, i) => ctx.fillText(line, cx, h * 0.825 + i * gapY, w * 0.7));
}

// ── Win reveal (full-screen) ──────────────────────────────────────────────────
function drawWin(gc: GameContext) {
  const { ctx, state, displayFont, bodyFont } = gc;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const t = getTheme(state);
  const s = uiScale(ctx);
  const cx = w / 2;

  if (state.winChimeFor !== 50) {
    state.winChimeFor = 50;
    serialNo50 = newSerial();   // a fresh serial for this completion
    gc.sounds.ui('seal');
    say(gc, WIN_LINE);
  }

  ctx.fillStyle = t.pass;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(56 * s)}px ${displayFont}`;
  ctx.fillText('CORRECT.', cx, h * 0.34);

  ctx.fillStyle = t.fgMid;
  ctx.font = `${Math.round(22 * s)}px ${bodyFont}`;
  ctx.fillText(`That is right. You are ${state.playerName}.`, cx, h * 0.46, w * 0.7);

  ctx.fillStyle = t.fgDim;
  ctx.font = `${Math.round(15 * s)}px ${bodyFont}`;
  ctx.fillText('Examination complete. Your certificate awaits.', cx, h * 0.53, w * 0.7);

  const btnW = Math.min(w * 0.32, 300);
  const btnH = Math.max(48, h * 0.07);
  drawButton(gc, 'VIEW CERTIFICATE  →', cx - btnW / 2, h * 0.62, btnW, btnH, () => {
    state.levelSubPhase = 'certificate';
    gc.render();
  }, 20);

  gc.afterPanel = drawWinRemark;
}

// ── Final question (in the exam-paper frame) ──────────────────────────────────
function drawNameRecall(gc: GameContext) {
  const { ctx, state, displayFont, bodyFont, monoFont } = gc;
  const { topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const t = getTheme(state);
  const s = uiScale(ctx);
  const cx = topBoxX + topBoxWidth / 2;

  if (state.levelSubPhase !== 'active') {
    state.nameInput = '';
    state.nameFocused = false;
    state.winChimeFor = -1;
    state.levelSubPhase = 'active';
    fails50 = 0;
    clock50.last = 0;
    clock50.elapsed = 0;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = t.accent;
  ctx.font = `${Math.round(12 * s)}px ${monoFont}`;
  ctx.fillText('FINAL ITEM  ·  50 OF 50', cx, topBoxY + topBoxHeight * 0.12);

  ctx.fillStyle = t.ink;
  ctx.font = `bold ${Math.round(26 * s)}px ${displayFont}`;
  ctx.fillText('One last question, candidate.', cx, topBoxY + topBoxHeight * 0.25);
  ctx.font = `bold ${Math.round(22 * s)}px ${displayFont}`;
  ctx.fillText('What is your name?', cx, topBoxY + topBoxHeight * 0.37);

  // input
  const inputW = topBoxWidth * 0.5;
  const inputH = Math.max(46, topBoxHeight * 0.13);
  const inputX = cx - inputW / 2;
  const inputY = topBoxY + topBoxHeight * 0.46;
  roundRect(ctx, inputX, inputY, inputW, inputH, 5);
  ctx.fillStyle = t.bg;
  ctx.fill();
  ctx.strokeStyle = state.nameFocused ? t.accent : t.hairline;
  ctx.lineWidth = state.nameFocused ? 3 : 1.5;
  ctx.stroke();

  const displayText = state.nameInput.length > 0
    ? state.nameInput
    : state.nameFocused ? '' : 'Type your answer…';
  ctx.fillStyle = state.nameInput.length > 0 ? t.ink : t.fgDim;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(22 * s)}px ${bodyFont}`;
  ctx.fillText(displayText, inputX + 16, inputY + inputH / 2, inputW - 32);

  if (state.nameFocused) {
    const measured = ctx.measureText(state.nameInput).width;
    const cursorX = inputX + 16 + Math.min(measured, inputW - 32);
    // pause-aware blink: the caret holds still while the exam is suspended
    const blink = Math.floor(clock50.elapsed / 0.53) % 2 === 0;
    if (blink) {
      ctx.strokeStyle = t.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cursorX, inputY + inputH * 0.22);
      ctx.lineTo(cursorX, inputY + inputH * 0.78);
      ctx.stroke();
    }
  }

  gc.hitAreas.push({
    x: inputX, y: inputY, w: inputW, h: inputH,
    action: () => { state.nameFocused = true; gc.render(); },
  });

  const submitW = Math.min(topBoxWidth * 0.3, 220);
  const submitH = Math.max(44, topBoxHeight * 0.12);
  drawButton(gc, 'SUBMIT →', cx - submitW / 2, topBoxY + topBoxHeight * 0.66, submitW, submitH, () => {
    if (!inputOpen(gc)) return;
    const typed = state.nameInput.trim().toLowerCase();
    const correct = state.playerName.toLowerCase();
    state.nameFocused = false;
    if (typed === correct) {
      state.examFinalMs = state.examStartTime > 0 ? performance.now() - state.examStartTime : 0;
      state.levelSubPhase = 'win';
      gc.render();
    } else {
      state.nameInput = '';
      fails50++;
      say(gc, WRONG_LINE);
      wrong(gc);
    }
  }, 20);
}

export const drawLevel50 = (gc: GameContext) => {
  const { state } = gc;

  // Pause-aware level clock: it only advances on the question screen and stops
  // dead while the exam is suspended.
  levelClock(gc, clock50);

  if (state.levelSubPhase === 'certificate') drawCertificate(gc);
  else if (state.levelSubPhase === 'win') drawWin(gc);
  else drawNameRecall(gc);

  // Test hook: internals only. The level is still played with real input.
  const dev = window as unknown as { __gc?: { lv?: Record<string, unknown> } };
  if (dev.__gc) dev.__gc.lv = {
    t: clock50.elapsed,
    typed: state.nameInput,
    focused: state.nameFocused,
    fails: fails50,
    registered: state.playerName,
    tier: getTier(state.examFinalMs),
    standing: state.lives,
    phase: state.levelSubPhase,
  };
};
