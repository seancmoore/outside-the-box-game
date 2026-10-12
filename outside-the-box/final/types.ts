import { SoundManager } from './audio';
export { SoundManager };

export type GameScreen = "intro" | "mainmenu" | "levelselect" | "level";

export interface GameState {
  currentScreen: GameScreen;
  currentLevel: number;
  lives: number;
  paused: boolean;
  controlsOpen: boolean;
  darkMode: boolean;
  storyTitle: string;
  storyLines: string[];
  playerName: string;
  nameInput: string;
  nameFocused: boolean;
  pauseCheatInput: string;
  pauseCheatFocused: boolean;
  playMode: "play" | "levelselect";
  gameOver: boolean;
  levelTimerEnd: number;   // ms timestamp; 0 = no active timer
  skips: number;
  levelSubPhase: string;   // reusable per-level sub-state, reset to "" on level change
  guideTarget:  string;    // joined lines — used to detect text changes
  guideReveal:  number;    // characters revealed by the typewriter
  guideCursor:  boolean;   // blinking cursor visibility
  movementIntroSeen: boolean;  // true after the level 11-20 intro popup is dismissed
  level21IntroSeen:  boolean;  // true after the level 21 return popup is dismissed
  cheatsEnabled:     boolean;  // true when player name is "380TA"
  cheatsPopupOpen:   boolean;  // true when the cheats popup is visible
  examStartTime:     number;   // performance.now() timestamp when exam began; 0 = not running
  examFinalMs:       number;   // elapsed ms at the moment level 30 was completed; 0 = not yet
  fxStampText?:      string;   // transient stamp-slam feedback text (CORRECT / INCORRECT)
  fxStampColor?:     string;
  fxStampAt?:        number;   // performance.now() when the stamp fired; undefined = none
  winChimeFor?:      number;   // currentLevel the win chime has already played for

  // ── Per-level chrome overrides (all reset automatically on level change) ────
  guideLines?:       string[]; // replaces LEVEL_DATA remarks when set (typewriter re-runs on change)
  paperCaption?:     string;   // replaces the "EXAMINATION PAPER" cartouche
  hudHiddenHearts?:  number[]; // heart indexes drawn as empty slots (Q42: one is on the paper)
  hudExtraHeart?:    boolean;  // draw a fourth, subtly wrong heart (Q34)
  hudHeartsLabel?:   string;   // replaces "CANDIDATE STANDING"
  pauseDisabled?:    boolean;  // the pause control does not pause (Q35 uses it as an instrument)
  pauseCheatPlaceholder?: string; // placeholder text in the INVIGILATOR OVERRIDE box (Q39)
  pauseCheatDone?:   boolean;  // the › button has been pressed on this level (Q39)
  pauseCartouche?:   string;   // replaces "EXAMINATION SUSPENDED" (Q22)
  pauseTransparent?: boolean;  // pause panel goes see-through so the level shows behind it (Q22)
}

export interface HitArea {
  x: number;
  y: number;
  w: number;
  h: number;
  action: () => void;
  noCursor?: boolean;   // if true, hovering won't change the cursor to pointer
  onRightClick?: () => void;   // optional right-mouse action (Q38)
}

export interface Rect { x: number; y: number; w: number; h: number; }

// Rectangles of the shared chrome, refreshed every frame by the renderer so levels
// can point at, glow, or hit-test the furniture (logo, item label, pause, examiner, hearts).
export interface ChromeRects {
  logo?: Rect;
  bulb?: Rect;         // the lightbulb inside the logo image
  qLabel?: Rect;
  pause?: Rect;
  paper?: Rect;
  play?: Rect;
  examiner?: Rect;
  remarks?: Rect;      // the remarks text block (speechX, startY, speechW, height)
  heartsRow?: Rect;
  hearts?: Rect[];
  caption?: Rect;
}

export interface BlockEntity {
  x: number;
  y: number;
  size: number;
  value: string;
  type: string;
  held: boolean;
  destroyed: boolean;
  draw: (ctx: CanvasRenderingContext2D) => void;
  collidesWithRect: (x: number, y: number, width: number, height: number) => boolean;
  moveTo: (x: number, y: number) => void;
  setHeld: (held: boolean) => void;
  destroy: () => void;
  update: (deltaSeconds: number, blocks: BlockEntity[]) => void;
  canBePickedUp: () => boolean;
  onPickedUp: () => boolean;
  onReleased: () => void;
  getMoveSpeedMultiplier: () => number;
}

export interface AnswerSlotEntity {
  x: number;
  y: number;
  size: number;
  block: BlockEntity | null;
}

export interface PlayerEntity {
  x: number;
  y: number;
  width: number;
  height: number;
  update: () => void;
  draw: (ctx: CanvasRenderingContext2D) => void;
  setBounds: (minX: number, minY: number, maxX: number, maxY: number) => void;
  setBlocks: (blocks: BlockEntity[]) => void;
  setAnswerSlots: (slots: AnswerSlotEntity[]) => void;
  resetPosition: (x: number, y: number) => void;
  getFacingDirection: () => "up" | "down" | "left" | "right";
}

export interface MovementArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GameContext {
  ctx: CanvasRenderingContext2D;
  state: GameState;
  hitAreas: HitArea[];
  render: () => void;
  loseLife: () => void;
  resetPlayerName: () => void;
  resetMovementLevel: () => void;
  submitMovementAnswer: () => void;
  submitPauseCheat: () => void;
  getCurrentAnswer: () => string;
  getAnswerPreview: () => string;
  displayFont: string;
  bodyFont: string;
  monoFont: string;
  logo: HTMLImageElement;
  gameplayFrame: HTMLImageElement;
  pauseButton: HTMLImageElement;
  levelSelectImg: HTMLImageElement;
  startExamImg: HTMLImageElement;
  controlsImg: HTMLImageElement;
  resumeImg: HTMLImageElement;
  quitExamImg: HTMLImageElement;
  lightModeImg: HTMLImageElement;
  darkModeImg: HTMLImageElement;
  levelBGImg: HTMLImageElement;
  bannerImg: HTMLImageElement;
  longBlankButtonImg: HTMLImageElement;
  acceptImg: HTMLImageElement;
  declineImg: HTMLImageElement;
  heartImg: HTMLImageElement;
  lostHeartImg: HTMLImageElement;
  backImg: HTMLImageElement;
  beggarImg: HTMLImageElement;
  tutorialBackgroundImg: HTMLImageElement;
  playerDownImg: HTMLImageElement;
  playerUpImg: HTMLImageElement;
  playerLeftImg: HTMLImageElement;
  playerRightImg: HTMLImageElement;
  logoLoaded: boolean;
  gameplayFrameLoaded: boolean;
  pauseButtonLoaded: boolean;
  levelSelectLoaded: boolean;
  startExamLoaded: boolean;
  controlsLoaded: boolean;
  resumeLoaded: boolean;
  quitExamLoaded: boolean;
  lightModeLoaded: boolean;
  darkModeLoaded: boolean;
  levelBGLoaded: boolean;
  bannerLoaded: boolean;
  longBlankButtonLoaded: boolean;
  acceptLoaded: boolean;
  declineLoaded: boolean;
  heartLoaded: boolean;
  lostHeartLoaded: boolean;
  backLoaded: boolean;
  beggarLoaded: boolean;
  tutorialBackgroundLoaded: boolean;
  playerDownLoaded: boolean;
  playerUpLoaded: boolean;
  playerLeftLoaded: boolean;
  playerRightLoaded: boolean;
  guideCharOffsetX: number;
  guideCharOffsetY: number;
  guideCharDir: "up" | "down" | "left" | "right";
  mouseX:          number;
  mouseY:          number;
  mouseDown:       boolean;
  keysDown:        Set<string>;
  wheelDeltaY:     number;
  sounds:          SoundManager;
  player:          PlayerEntity;
  blocks:          BlockEntity[];
  answerSlots:     AnswerSlotEntity[];
  movementArea:    MovementArea;
  quizPrompt:      string;
  quizAnswer:      string;
  timeLeftSeconds: number;
  assetsReady:     boolean;   // false until image assets have finished fetching
  assetProgress:   number;    // 0..1 fraction of image assets loaded

  // A transparent WebGL canvas layered above the 2D game canvas (pointer-events: none).
  // Hidden unless a level shows it (Q13's three.js die). Sized with the game canvas.
  dieCanvas:       HTMLCanvasElement | null;

  // ── Level hooks (cleared at the start of every render; a level re-registers per draw) ──
  chrome:          ChromeRects;
  afterPanel?:     (gc: GameContext) => void;   // draw on top of the examiner panel + HUD, before overlays
  afterOverlays?:  (gc: GameContext) => void;   // draw on top of the pause overlay (Q22's frozen digits)
  pauseIntercept?: () => void;                  // called instead of pausing when state.pauseDisabled
  pauseCheatHandler?: () => boolean;            // returns true if it consumed the › press (Q39)
  resolveGuide?:   () => string[];              // the examiner lines currently being typed (dev/test hook)
}
