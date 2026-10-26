import type { SoundPalette } from '../../content/look/sound';
import { type MusicLayerId, musicEnvelopes, musicRules, type Song, type SongId, songs } from '../../content/music';
import type { SfxEnvelope } from '../../content/sfx';
import { midiToHz, type VoiceNote } from '../notes';
import { playVoice } from '../synth/index';
import { activeLayers, smoothMomentum, songStage } from './intensity';
import { type MusicNote, stepNotes } from './patterns';
import { createSequencer, stepSeconds } from './sequencer';

export interface MusicPlayer {
  /** 曲を替える。null で止める */
  setSong(id: SongId | null): void;
  readonly song: () => SongId | null;
  /** 勢いの目標（0〜1）。実際の勢いは tick ごとに滑らかに近づく */
  setMomentum(target: number): void;
  /** いまの（滑らかにした後の）勢いと段階 */
  readonly momentum: () => number;
  readonly stage: () => number;
  /** 開発用：段階を固定する（null で勢いに従う） */
  forceStage(stage: number | null): void;
  /** 開発用：鳴らさないレイヤー */
  muteLayers(ids: ReadonlySet<MusicLayerId>): void;
  dispose(): void;
}

/** 楽曲の1音を鳴らせる形にする */
function toVoice(note: MusicNote, song: Song, palette: SoundPalette, gain: number, pan: number, send: number) {
  const shape = musicEnvelopes[song.layers.find((l) => l.id === note.layer)?.kind ?? 'drum'];
  const seconds = note.len * stepSeconds(song.tempo, song.stepsPerBeat);
  const hold = Math.max(0, seconds - shape.attack - shape.decay);
  const env: SfxEnvelope = { ...shape, hold: shape.sustain > 0 ? hold : 0 };
  const voice: VoiceNote = {
    spec: palette.voices[note.voice],
    at: 0,
    hz: midiToHz(note.midi),
    env,
    gain: gain * note.velocity * palette.trims[note.voice],
    pan,
    send: send * palette.space,
  };
  return voice;
}

/**
 * アダプティブ BGM。シーケンサーで1ステップずつ音を予約し、勢いから決めた段階のレイヤーだけを鳴らす。
 * レイヤーを足すときはレイヤーごとの音量をフェードインし、減らすときは新しい音の予約をやめて残響に任せる。
 */
export function createMusicPlayer(
  ctx: BaseAudioContext & { currentTime: number },
  out: AudioNode,
  reverb: AudioNode,
  palette: () => SoundPalette,
): MusicPlayer {
  let songId: SongId | null = null;
  let target = 0;
  let value = 0;
  let forced: number | null = null;
  let muted: ReadonlySet<MusicLayerId> = new Set();
  let lastTick = ctx.currentTime;
  const layerGains = new Map<MusicLayerId, GainNode>();
  let active = new Set<MusicLayerId>();

  const layerGain = (id: MusicLayerId) => {
    let g = layerGains.get(id);
    if (!g) {
      g = ctx.createGain();
      g.gain.value = 0;
      g.connect(out);
      layerGains.set(id, g);
    }
    return g;
  };

  const stage = () => {
    const song = songId ? songs[songId] : null;
    if (!song) return 0;
    return forced ?? songStage(song, value);
  };

  /** 段階に合わせてレイヤーの音量をフェードする */
  const updateLayers = () => {
    const song = songId ? songs[songId] : null;
    const next = new Set(song ? activeLayers(song, stage()).filter((id) => !muted.has(id)) : []);
    const now = ctx.currentTime;
    for (const id of new Set([...active, ...next])) {
      const on = next.has(id);
      if (on === active.has(id)) continue;
      const g = layerGain(id).gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(on ? 1 : 0, now, musicRules.layerFade / 3);
    }
    active = next;
  };

  const sequencer = createSequencer({
    now: () => ctx.currentTime,
    lookahead: musicRules.lookahead,
    schedule(step, time) {
      const song = songId ? songs[songId] : null;
      if (!song) return;
      for (const note of stepNotes(song, step, active)) {
        const layer = song.layers.find((l) => l.id === note.layer);
        if (!layer) continue;
        const voice = toVoice(note, song, palette(), layer.gain, layer.pan ?? 0, layer.send ?? 0);
        playVoice(ctx, { dry: layerGain(note.layer), send: reverb }, voice, time);
      }
    },
  });

  const timer = setInterval(() => {
    const now = ctx.currentTime;
    value = smoothMomentum(value, target, Math.max(0, now - lastTick));
    lastTick = now;
    updateLayers();
    sequencer.tick();
  }, musicRules.tickMs);

  return {
    song: () => songId,
    setSong(id) {
      if (id === songId) return;
      songId = id;
      // 前の曲のレイヤーはすべて消し、新しい曲の段階で入れ直す
      for (const g of layerGains.values()) g.gain.setTargetAtTime(0, ctx.currentTime, musicRules.fade / 3);
      active = new Set();
      if (!id) {
        sequencer.stop();
        return;
      }
      sequencer.start(ctx.currentTime + musicRules.fade, songs[id].tempo, songs[id].stepsPerBeat);
      updateLayers();
    },
    setMomentum(v) {
      target = Math.min(1, Math.max(0, v));
    },
    momentum: () => value,
    stage,
    forceStage(s) {
      forced = s;
      updateLayers();
    },
    muteLayers(ids) {
      muted = ids;
      updateLayers();
    },
    dispose() {
      clearInterval(timer);
      sequencer.stop();
      for (const g of layerGains.values()) g.disconnect();
    },
  };
}
