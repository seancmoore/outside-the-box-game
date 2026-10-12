import { GameContext } from "../types";
import { getTheme } from "../theme";
import { getLayout } from "../layout";
import { roundRect, drawButton, drawDocumentBox, uiScale } from "../renderer";

export const drawPauseOverlay = (gc: GameContext) => {
  const { ctx, state, displayFont, monoFont } = gc;
  const { topBoxX, topBoxY, topBoxWidth, topBoxHeight } = getLayout(ctx);
  const pad = topBoxWidth * 0.05;
  const ox = topBoxX + pad;
  const oy = topBoxY + pad;
  const ow = topBoxWidth - pad * 2;
  const oh = topBoxHeight - pad * 2;
  const cx = ox + ow / 2;
  const t = getTheme(state);
  const s = uiScale(ctx);

  drawDocumentBox(gc, ox, oy, ow, oh, {
    title: state.pauseCartouche ?? "Examination Suspended",
    fillAlpha: state.pauseTransparent ? 0.14 : 1,
  });

  ctx.fillStyle = t.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(33 * s)}px ${displayFont}`;
  ctx.fillText("Paused", cx, oy + oh * 0.17);

  ctx.strokeStyle = t.hairline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox + ow * 0.1, oy + oh * 0.29);
  ctx.lineTo(ox + ow * 0.9, oy + oh * 0.29);
  ctx.stroke();

  // Clear all underlying hit areas so the game behind is blocked
  gc.hitAreas = [];

  const btnW = 220;
  const btnH = Math.max(40, oh * 0.13);
  const btnX = ox + ow * 0.62;
  const sliderW = Math.min(ow * 0.34, 220);
  const sliderH = 10;
  const sliderX = ox + ow * 0.14;
  const sliderY = oy + oh * 0.54;
  const sliderHitH = 28;
  const sliderLabelY = sliderY - 18;
  const leftPanelCenterX = sliderX + sliderW / 2;
  const cheatBoxW = sliderW;
  const cheatBoxH = 38;
  const cheatBoxX = sliderX;
  const cheatBoxY = sliderY + 38;
  const cheatButtonW = 40;
  const cheatButtonH = cheatBoxH;
  const cheatButtonGap = 12;
  const cheatButtonX = cheatBoxX + cheatBoxW + cheatButtonGap;
  const cheatButtonY = cheatBoxY;
  const volumePercent = Math.round(gc.sounds.getMasterVolume() * 100);
  const isOverSlider = (
    gc.mouseX >= sliderX &&
    gc.mouseX <= sliderX + sliderW &&
    gc.mouseY >= sliderY - sliderHitH / 2 &&
    gc.mouseY <= sliderY + sliderHitH / 2
  );
  const applyVolumeFromPointer = () => {
    const normalized = Math.min(1, Math.max(0, (gc.mouseX - sliderX) / sliderW));
    gc.sounds.setMasterVolume(normalized);
  };

  if (gc.mouseDown && isOverSlider) {
    applyVolumeFromPointer();
  }

  if (isOverSlider && gc.wheelDeltaY !== 0) {
    const delta = gc.wheelDeltaY < 0 ? 0.05 : -0.05;
    gc.sounds.setMasterVolume(gc.sounds.getMasterVolume() + delta);
  }

  // ── Right column: resume / quit / appearance ───────────────────────────────
  drawButton(gc, "RESUME", btnX, oy + oh * 0.30, btnW, btnH, () => {
    state.paused = false;
    gc.render();
  }, 18);

  drawButton(gc, "QUIT TO MENU", btnX, oy + oh * 0.30 + btnH + oh * 0.05, btnW, btnH, () => {
    state.paused = false;
    state.lives = 3;
    gc.resetPlayerName();
    state.currentScreen = "mainmenu";
    gc.render();
  }, 16);

  drawButton(gc, state.darkMode ? "LIGHT MODE" : "DARK MODE",
    btnX, oy + oh * 0.30 + (btnH + oh * 0.05) * 2, btnW, btnH, () => {
      state.darkMode = !state.darkMode;
      gc.render();
    }, 16);

  // ── Left column: sound + level-select cheat ────────────────────────────────
  ctx.fillStyle = t.fgDim;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = `${Math.round(11 * s)}px ${monoFont}`;
  ctx.fillText(`SOUND  ${volumePercent}%`, leftPanelCenterX, sliderLabelY);

  ctx.strokeStyle = t.stroke;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sliderX, sliderY - sliderH / 2, sliderW, sliderH);
  ctx.fillStyle = state.darkMode ? "rgba(242,235,218,0.12)" : "rgba(30,26,21,0.08)";
  ctx.fillRect(sliderX, sliderY - sliderH / 2, sliderW, sliderH);
  ctx.fillStyle = t.accent;
  ctx.fillRect(sliderX, sliderY - sliderH / 2, sliderW * gc.sounds.getMasterVolume(), sliderH);

  const knobX = sliderX + sliderW * gc.sounds.getMasterVolume();
  ctx.beginPath();
  ctx.arc(knobX, sliderY, 9, 0, Math.PI * 2);
  ctx.fillStyle = t.accent;
  ctx.fill();
  ctx.strokeStyle = t.stroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  gc.hitAreas.push({
    x: sliderX,
    y: sliderY - sliderHitH / 2,
    w: sliderW,
    h: sliderHitH,
    action: () => {
      applyVolumeFromPointer();
      gc.render();
    },
  });

  ctx.fillStyle = t.fgDim;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = `${Math.round(11 * s)}px ${monoFont}`;
  ctx.fillText("INVIGILATOR OVERRIDE", leftPanelCenterX, cheatBoxY - 8);

  roundRect(ctx, cheatBoxX, cheatBoxY, cheatBoxW, cheatBoxH, 4);
  ctx.fillStyle = t.bg;
  ctx.fill();
  ctx.strokeStyle = state.pauseCheatFocused ? t.accent : t.stroke;
  ctx.lineWidth = state.pauseCheatFocused ? 3 : 1.5;
  ctx.stroke();

  const placeholder = state.pauseCheatPlaceholder ?? "Override Key";
  const issued = !!state.pauseCheatDone;
  ctx.fillStyle = state.pauseCheatInput.length > 0 ? t.ink : (issued ? t.pass : (state.pauseCheatPlaceholder ? t.fgMid : t.fgDim));
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `${issued ? "bold " : ""}${Math.round((state.pauseCheatPlaceholder ? 13 : 15) * s)}px ${monoFont}`;
  const cheatText = state.pauseCheatInput.length > 0
    ? state.pauseCheatInput + (state.pauseCheatFocused ? "|" : "")
    : (state.pauseCheatFocused ? "|" : placeholder);
  ctx.fillText(cheatText, cheatBoxX + 12, cheatBoxY + cheatBoxH / 2, cheatBoxW - 24);

  // submit chevron
  roundRect(ctx, cheatButtonX, cheatButtonY, cheatButtonW, cheatButtonH, 4);
  ctx.fillStyle = issued ? t.pass : t.accent;
  ctx.fill();
  ctx.fillStyle = "#F7F1E3";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(18 * s)}px ${monoFont}`;
  ctx.fillText("›", cheatButtonX + cheatButtonW / 2, cheatButtonY + cheatButtonH / 2);

  gc.hitAreas.push({
    x: cheatBoxX,
    y: cheatBoxY,
    w: cheatBoxW,
    h: cheatBoxH,
    action: () => {
      state.pauseCheatFocused = true;
      gc.render();
    },
  });

  gc.hitAreas.push({
    x: cheatButtonX,
    y: cheatButtonY,
    w: cheatButtonW,
    h: cheatButtonH,
    action: () => {
      gc.submitPauseCheat();
    },
  });
};
