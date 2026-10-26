import { defaultSoundPaletteId, type SoundPalette, type SoundPaletteId, soundPalettes } from '../content/look/sound';
import type { MusicLayerId, SongId } from '../content/music';
import { musicRules } from '../content/music';
import { audioRules, getSfx, type SfxBus, type SfxDef, type SfxId, sfxCatalog } from '../content/sfx';
import { createMusicPlayer, type MusicPlayer } from './music/player';
import { duckGain, resolveSfx, sfxSeconds, sfxVariation } from './notes';
import { playVoice } from './synth/index';

/** 音量（0〜1）とミュート。app/settings.ts が保存する */
export interface AudioVolumes {
  readonly master: number;
  readonly sfx: number;
  readonly music: number;
  readonly muted: boolean;
}

export interface SfxPlay {
  /** -1〜1。ワールドの出来事の画面上の位置から（notes.ts の screenPan） */
  readonly pan?: number;
  readonly combo?: number;
}

export interface AudioEngine {
  /** 最初のユーザー操作で呼ぶ。AudioContext を作って resume する（自動再生の制限への対応） */
  unlock(): void;
  readonly unlocked: () => boolean;
  play(id: SfxId, options?: SfxPlay): void;
  setVolumes(volumes: AudioVolumes): void;
  setPalette(id: SoundPaletteId, palette?: SoundPalette): void;
  readonly paletteId: () => SoundPaletteId;
  setSong(id: SongId | null): void;
  setMomentum(value: number): void;
  setPaused(paused: boolean): void;
  /** 開発用（サウンドテスト）：BGM の段階の固定とレイヤーのミュート、事前レンダリングの状況 */
  readonly music: () => MusicPlayer | null;
  muteLayers(ids: ReadonlySet<MusicLayerId>): void;
  forceStage(stage: number | null): void;
  readonly prerendered: () => readonly SfxId[];
}

/** リバーブの残響として焼き込みに足す長さ（秒） */
const TAIL_SECONDS = 1.2;
const STEREO = 2;

/** インパルス応答：左右で別のノイズに、減衰のエンベロープ（(1 - t/T)^decay）を掛ける */
export function impulseResponse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(STEREO, length, ctx.sampleRate);
  for (let ch = 0; ch < STEREO; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
  }
  return buffer;
}

/** 効果音をコンテキストへ鳴らす（リアルタイムでも、事前レンダリングでも同じ） */
function renderSfx(
  ctx: BaseAudioContext,
  def: SfxDef,
  palette: SoundPalette,
  out: { dry: AudioNode; send: AudioNode },
  t0: number,
  options: SfxPlay & { jitter?: () => number },
) {
  for (const note of resolveSfx(def, palette, options)) playVoice(ctx, out, note, t0);
}

/**
 * オーディオエンジン。音声ファイルを使わず、Web Audio だけで合成する。
 *
 *   SFX bus ──┐
 *   UI bus  ──┼─► Master EQ ─► Compressor ─► Limiter ─► Master ─► Destination
 *   Music ────┘      ▲   （Music は Duck → 一時停止のローパス → 音量 を通る）
 *   Reverb send ─────┘   （ConvolverNode。インパルス応答はノイズと減衰から起動時に作る）
 *
 * 音は補助で、どの効果音も画面上の変化（演出・トースト・表示）と一緒に鳴る。ミュートしても情報は失われない。
 * game の state は読まず、UI（ui/audio/AudioHost.tsx）と演出（ui/fx/FxHost.tsx）から呼ばれるだけ。
 */
export function createAudioEngine(): AudioEngine {
  let ctx: AudioContext | null = null;
  let volumes: AudioVolumes = { master: 1, sfx: 1, music: 1, muted: false };
  let paletteId: SoundPaletteId = defaultSoundPaletteId;
  let palette: SoundPalette = soundPalettes[defaultSoundPaletteId];
  let songId: SongId | null = null;
  let momentum = 0;
  let paused = false;
  let player: MusicPlayer | null = null;
  let mutedLayers: ReadonlySet<MusicLayerId> = new Set();
  let forcedStage: number | null = null;
  const lastPlayed = new Map<SfxId, number>();
  /** 事前レンダリングした効果音（パレットを替えたら作り直す） */
  let baked = new Map<SfxId, AudioBuffer>();
  let bakeGeneration = 0;

  let nodes: {
    buses: Record<SfxBus, GainNode>;
    musicVolume: GainNode;
    duck: GainNode;
    pauseFilter: BiquadFilterNode;
    reverb: ConvolverNode;
    master: GainNode;
  } | null = null;

  const applyVolumes = () => {
    if (!ctx || !nodes) return;
    const now = ctx.currentTime;
    const set = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, now, 0.02);
    set(nodes.master, volumes.muted ? 0 : volumes.master);
    set(nodes.buses.sfx, volumes.sfx);
    set(nodes.buses.ui, volumes.sfx);
    set(nodes.musicVolume, volumes.music);
  };

  const applyPaused = () => {
    if (!ctx || !nodes) return;
    nodes.pauseFilter.frequency.setTargetAtTime(
      paused ? musicRules.pausedCutoff : musicRules.openCutoff,
      ctx.currentTime,
      musicRules.fade / 3,
    );
  };

  const build = (c: AudioContext) => {
    const eqLow = c.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 120;
    eqLow.gain.value = 1.5;
    const eqHigh = c.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 8000;
    eqHigh.gain.value = -1.5;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    // リミッター：鋭いコンプレッサーで天井を作る
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    const master = c.createGain();
    eqLow.connect(eqHigh).connect(comp).connect(limiter).connect(master).connect(c.destination);

    const reverb = c.createConvolver();
    reverb.buffer = impulseResponse(c, palette.reverb.seconds, palette.reverb.decay);
    reverb.connect(eqLow);

    const sfx = c.createGain();
    const ui = c.createGain();
    sfx.connect(eqLow);
    ui.connect(eqLow);

    const musicIn = c.createGain();
    const duck = c.createGain();
    const pauseFilter = c.createBiquadFilter();
    pauseFilter.type = 'lowpass';
    pauseFilter.frequency.value = musicRules.openCutoff;
    const musicVolume = c.createGain();
    musicIn.connect(duck).connect(pauseFilter).connect(musicVolume).connect(eqLow);

    nodes = { buses: { sfx, ui }, musicVolume, duck, pauseFilter, reverb, master };
    player = createMusicPlayer(c, musicIn, reverb, () => palette);
    player.muteLayers(mutedLayers);
    player.forceStage(forcedStage);
    player.setMomentum(momentum);
    player.setSong(songId);
    applyVolumes();
    applyPaused();
    scheduleBake();
  };

  /** 複雑な効果音を、アイドル時間に1つずつ OfflineAudioContext で焼き込む */
  const scheduleBake = () => {
    const generation = ++bakeGeneration;
    baked = new Map();
    const queue = sfxCatalog.filter((d) => d.prerender && !d.comboRise);
    const idle = (fn: () => void) =>
      typeof requestIdleCallback === 'function' ? requestIdleCallback(fn) : setTimeout(fn, 50);
    const next = () => {
      const def = queue.shift();
      if (!def || !ctx || generation !== bakeGeneration || typeof OfflineAudioContext === 'undefined') return;
      const seconds = sfxSeconds(def) + TAIL_SECONDS;
      const off = new OfflineAudioContext(STEREO, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
      const send = off.createConvolver();
      send.buffer = impulseResponse(off, palette.reverb.seconds, palette.reverb.decay);
      send.connect(off.destination);
      renderSfx(off, def, palette, { dry: off.destination, send }, 0, {});
      off
        .startRendering()
        .then((buffer) => {
          if (generation === bakeGeneration) baked.set(def.id, buffer);
          idle(next);
        })
        .catch(() => idle(next));
    };
    idle(next);
  };

  const duck = () => {
    if (!ctx || !nodes) return;
    const d = audioRules.duck;
    const g = nodes.duck.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(duckGain(d.attack, d), now + d.attack);
    g.setValueAtTime(d.level, now + d.attack + d.hold);
    g.linearRampToValueAtTime(1, now + d.attack + d.hold + d.release);
  };

  return {
    unlock() {
      try {
        if (!ctx) {
          if (typeof AudioContext === 'undefined') return;
          ctx = new AudioContext({ latencyHint: 'interactive' });
          build(ctx);
        }
        if (ctx.state === 'suspended') void ctx.resume();
      } catch {
        // 音が出せない環境でも、ゲームはそのまま遊べる
      }
    },
    unlocked: () => ctx !== null && ctx.state === 'running',
    play(id, options = {}) {
      if (!ctx || !nodes || ctx.state !== 'running' || volumes.muted) return;
      const def = getSfx(id);
      const nowMs = ctx.currentTime * 1000;
      const cooldown = def.id === 'uiHover' ? audioRules.hoverCooldownMs : audioRules.repeatCooldownMs;
      if (nowMs - (lastPlayed.get(id) ?? Number.NEGATIVE_INFINITY) < cooldown) return;
      lastPlayed.set(id, nowMs);

      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0));
      panner.connect(nodes.buses[def.bus]);
      const jitter = () => Math.random() * 2 - 1;
      const buffer = baked.get(id);
      const t0 = ctx.currentTime + 0.005;
      if (buffer) {
        // 焼き込んだ音は、揺らぎを再生速度と音量で付ける
        const v = sfxVariation(def, jitter);
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        src.buffer = buffer;
        src.playbackRate.value = 2 ** (v.cents / 1200);
        g.gain.value = v.gain;
        src.connect(g).connect(panner);
        src.start(t0);
      } else {
        renderSfx(ctx, def, palette, { dry: panner, send: nodes.reverb }, t0, { ...options, jitter });
      }
      if (def.tier >= audioRules.duckFromTier) duck();
    },
    setVolumes(v) {
      volumes = v;
      applyVolumes();
    },
    setPalette(id, custom) {
      paletteId = id;
      palette = custom ?? soundPalettes[id];
      if (ctx && nodes) {
        nodes.reverb.buffer = impulseResponse(ctx, palette.reverb.seconds, palette.reverb.decay);
        scheduleBake();
      }
    },
    paletteId: () => paletteId,
    setSong(id) {
      songId = id;
      player?.setSong(id);
    },
    setMomentum(value) {
      momentum = value;
      player?.setMomentum(value);
    },
    setPaused(p) {
      paused = p;
      applyPaused();
    },
    music: () => player,
    muteLayers(ids) {
      mutedLayers = ids;
      player?.muteLayers(ids);
    },
    forceStage(stage) {
      forcedStage = stage;
      player?.forceStage(stage);
    },
    prerendered: () => [...baked.keys()],
  };
}
