type SoundKey = "bgmMovement" | "bgmLevel4" | "bgmLevel6" | "bgmLevel8" | "bgmLevel21" | "clickDontClick" | "eraser" | "pongBounce" | "mazeOof" | "allOfTheLights" | "boom" | "correctAnswer" | "wrongAnswer" | "dash" | "typing";

type SoundPlayOptions = {
  loop?: boolean;
  volume?: number;
  restart?: boolean;
  startTime?: number;   // seconds offset into the file to begin playback
};

const SOUND_PATHS: Record<SoundKey, string> = {
  bgmMovement:    "./assets/sounds/BGM1_FROM_PIXABAY.mp3",
  bgmLevel4:      "./assets/sounds/level4.mp3",
  bgmLevel6:      "./assets/sounds/pongEasyBGMusic.mp3",
  bgmLevel8:      "./assets/sounds/crying.mp3",
  bgmLevel21:     "./assets/sounds/pongBGMusicHard.mp3",
  clickDontClick: "./assets/sounds/clickDontClickSoundEffect.mp3",
  eraser:         "./assets/sounds/eraser.mp3",
  pongBounce:     "./assets/sounds/pongBallBounce.mp3",
  mazeOof:        "./assets/sounds/mazeOof.mp3",
  allOfTheLights: "./assets/sounds/allOfTheLights.mp3",
  boom:           "./assets/sounds/boom.wav",
  correctAnswer:  "./assets/sounds/correctAnswer.wav",
  wrongAnswer:    "./assets/sounds/wrongAnswer.wav",
  dash:           "./assets/sounds/dash.wav",
  typing:         "./assets/sounds/typing.mp3",
};

export class SoundManager {
  private readonly loopedAudio = new Map<SoundKey, HTMLAudioElement>();
  // Tracks the pending play() promise so stop() can chain after it
  private readonly pendingPlays = new Map<SoundKey, Promise<void>>();
  // Pre-warmed Audio elements for one-shot sounds.  Holding references prevents
  // GC and keeps the data in the browser cache so the first play has no delay.
  private readonly preloaded: HTMLAudioElement[] = [];
  private masterVolume = 1;
  // WebAudio context for procedural UI sound effects (no asset files needed).
  private audioCtx: AudioContext | null = null;

  constructor() {
    const PREWARM: SoundKey[] = ["correctAnswer", "dash", "boom"];
    for (const key of PREWARM) {
      const a = new Audio(SOUND_PATHS[key]);
      a.preload = "auto";
      a.load();
      this.preloaded.push(a);
    }
  }

  public play(key: SoundKey, options: SoundPlayOptions = {}) {
    const { loop = false, volume = 1, restart = true, startTime } = options;
    const source = SOUND_PATHS[key];
    const finalVolume = this.clampVolume(volume * this.masterVolume);

    if (loop) {
      const existing = this.loopedAudio.get(key) ?? new Audio(source);
      existing.loop = true;
      existing.volume = finalVolume;
      if (restart) {
        existing.currentTime = startTime ?? 0;
      }

      this.loopedAudio.set(key, existing);
      if (existing.paused) {
        const p = existing.play().catch(() => {}) as Promise<void>;
        this.pendingPlays.set(key, p);
      }
      return;
    }

    // One-shot
    const audio = new Audio(source);
    audio.volume = finalVolume;
    audio.currentTime = startTime ?? 0;
    void audio.play().catch(() => {});
  }

  public setMasterVolume(volume: number) {
    this.masterVolume = this.clampVolume(volume);

    for (const audio of this.loopedAudio.values()) {
      audio.volume = this.masterVolume;
    }

    if (this.sirenGain && this.audioCtx) {
      this.sirenGain.gain.setValueAtTime(Math.max(0.0002, 0.11 * this.masterVolume), this.audioCtx.currentTime);
    }
  }

  public getMasterVolume() {
    return this.masterVolume;
  }

  public stop(key: SoundKey) {
    const audio = this.loopedAudio.get(key);
    if (!audio) {
      return;
    }

    const doStop = () => {
      audio.pause();
      audio.currentTime = 0;
    };

    // If a play() promise is still pending, chain the pause after it resolves.
    // Without this, browsers can resume playback once the pending promise settles.
    const pending = this.pendingPlays.get(key);
    if (pending) {
      void pending.then(doStop).catch(() => {});
      this.pendingPlays.delete(key);
    } else {
      doStop();
    }
  }

  private clampVolume(volume: number) {
    return Math.min(1, Math.max(0, volume));
  }

  // ── Procedural stress alarm (Q17) — a wailing siren, no asset file ───────────
  private sirenOsc:  OscillatorNode | null = null;
  private sirenLFO:  OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;

  public startSiren() {
    const ctx = this.ensureCtx();
    if (!ctx || this.sirenOsc) return;

    const out = ctx.createGain();
    out.gain.value = 0.0001;
    out.connect(ctx.destination);
    out.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.11 * this.masterVolume), ctx.currentTime + 0.15);

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 760;

    // LFO sweeps the carrier frequency up/down — classic two-tone wail
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 1.3;   // wails per second
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;    // sweep depth in Hz
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    osc.connect(out);
    osc.start();
    lfo.start();

    this.sirenOsc  = osc;
    this.sirenLFO  = lfo;
    this.sirenGain = out;
  }

  public stopSiren() {
    const ctx = this.audioCtx;
    if (!ctx || !this.sirenOsc || !this.sirenGain) return;

    const out = this.sirenGain;
    const t    = ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(Math.max(0.0002, out.gain.value), t);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

    const osc = this.sirenOsc, lfo = this.sirenLFO;
    setTimeout(() => { try { osc.stop(); lfo?.stop(); } catch { /* already stopped */ } }, 150);

    this.sirenOsc  = null;
    this.sirenLFO  = null;
    this.sirenGain = null;
  }

  // ── Procedural stress voice (Q17) — browser TTS shouting urgency lines ───────
  // No voice-over asset exists yet; this stands in using the Web Speech API so
  // the pressure is there immediately. Swap for a recorded line later by
  // replacing this with a normal SOUND_PATHS entry + play({loop:true}) if a
  // real "quick quick press it!" clip gets added.
  private shoutTimer: ReturnType<typeof setInterval> | null = null;
  private readonly SHOUT_LINES = [
    "Quick! Quick!",
    "Press it! Hurry!",
    "Do it now!",
    "Come on, press it!",
    "You're running out of time!",
  ];

  public startShouting() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (this.shoutTimer !== null) return;

    const say = () => {
      if (this.masterVolume <= 0) return;
      const line = this.SHOUT_LINES[Math.floor(Math.random() * this.SHOUT_LINES.length)];
      const u = new SpeechSynthesisUtterance(line);
      u.rate   = 1.35;
      u.pitch  = 1.3;
      u.volume = this.clampVolume(this.masterVolume);
      window.speechSynthesis.speak(u);
    };
    say();
    this.shoutTimer = setInterval(say, 1600);
  }

  public stopShouting() {
    if (this.shoutTimer !== null) {
      clearInterval(this.shoutTimer);
      this.shoutTimer = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  // ── Procedural UI sound effects (WebAudio synth — no asset files) ────────────

  private ensureCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!this.audioCtx) {
      try { this.audioCtx = new AC(); } catch { return null; }
    }
    if (this.audioCtx.state === "suspended") void this.audioCtx.resume();
    return this.audioCtx;
  }

  // Call from inside a user gesture (click/keydown) so the browser unlocks audio.
  public resumeFx() { this.ensureCtx(); }

  private blip(
    ctx: AudioContext, dest: AudioNode, type: OscillatorType,
    f0: number, f1: number, t0: number, dur: number, gain: number,
  ) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  private noise(
    ctx: AudioContext, dest: AudioNode, t0: number, dur: number,
    gain: number, freq: number, q: number,
  ) {
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  public ui(kind: "click" | "thud" | "chime" | "deny" | "page" | "tick" | "seal") {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const v = this.masterVolume;
    if (v <= 0) return;
    const t0 = ctx.currentTime + 0.001;
    const out = ctx.createGain();
    out.gain.value = v;
    out.connect(ctx.destination);

    switch (kind) {
      case "click":
        this.blip(ctx, out, "triangle", 300, 170, t0, 0.07, 0.08);
        this.noise(ctx, out, t0, 0.03, 0.04, 2200, 0.7);
        break;
      case "tick":
        this.blip(ctx, out, "square", 900, 700, t0, 0.03, 0.03);
        break;
      case "thud":
        this.blip(ctx, out, "sine", 140, 60, t0, 0.16, 0.16);
        this.noise(ctx, out, t0, 0.05, 0.05, 400, 0.6);
        break;
      case "deny":
        this.blip(ctx, out, "square", 180, 110, t0, 0.18, 0.07);
        this.blip(ctx, out, "square", 175, 105, t0 + 0.1, 0.18, 0.07);
        break;
      case "page":
        this.noise(ctx, out, t0, 0.18, 0.05, 1200, 0.5);
        break;
      case "chime":
        this.blip(ctx, out, "sine", 660, 660, t0, 0.5, 0.06);
        this.blip(ctx, out, "sine", 990, 990, t0 + 0.04, 0.5, 0.05);
        this.blip(ctx, out, "sine", 1320, 1320, t0 + 0.08, 0.55, 0.04);
        break;
      case "seal":
        this.blip(ctx, out, "sine", 130, 55, t0, 0.18, 0.16);
        this.blip(ctx, out, "sine", 880, 880, t0 + 0.12, 0.4, 0.05);
        this.blip(ctx, out, "sine", 1320, 1320, t0 + 0.16, 0.4, 0.035);
        break;
    }
  }
}
