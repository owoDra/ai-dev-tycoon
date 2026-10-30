/**
 * 紹介動画の音を書き出すページ（capture/sound.ts がゲームの Vite 開発サーバーで開く）。
 * ゲームの音の実装をそのまま使い、効果音は OfflineAudioContext で、BGM はエンジンを鳴らして MediaRecorder で録る
 */
import { createAudioEngine, impulseResponse } from '../../src/audio/engine';
import { resolveSfx, sfxSeconds } from '../../src/audio/notes';
import { playVoice } from '../../src/audio/synth/index';
import { defaultSoundPaletteId, soundPalettes } from '../../src/content/look/sound';
import { getSfx, type SfxId } from '../../src/content/sfx';

const RATE = 48000;
/** 残響の分だけ後ろに足す長さ（秒） */
const TAIL_SECONDS = 1.2;
/** 効果音のピークをそろえる値。音量の釣り合いは動画の側（src/Soundtrack.tsx）で決める */
const SFX_PEAK = 0.7;

/** 16bit ステレオの WAV にして base64 で返す */
function wavBase64(buffer: AudioBuffer): string {
  const frames = buffer.length;
  const channels = buffer.numberOfChannels;
  const data = new DataView(new ArrayBuffer(44 + frames * channels * 2));
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) data.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  data.setUint32(4, 36 + frames * channels * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, channels, true);
  data.setUint32(24, buffer.sampleRate, true);
  data.setUint32(28, buffer.sampleRate * channels * 2, true);
  data.setUint16(32, channels * 2, true);
  data.setUint16(34, 16, true);
  text(36, 'data');
  data.setUint32(40, frames * channels * 2, true);
  const pcm = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const v = Math.max(-1, Math.min(1, pcm[ch]?.[i] ?? 0));
      data.setInt16(44 + (i * channels + ch) * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
  }
  return blobBase64(new Uint8Array(data.buffer));
}

function blobBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** 効果音1つを、ゲームと同じパレットとリバーブで書き出す */
async function renderSfx(id: SfxId): Promise<string> {
  const palette = soundPalettes[defaultSoundPaletteId];
  const def = getSfx(id);
  const off = new OfflineAudioContext(2, Math.ceil(RATE * (sfxSeconds(def) + TAIL_SECONDS)), RATE);
  const bus = off.createGain();
  bus.gain.value = palette.mix.sfx;
  bus.connect(off.destination);
  const send = off.createConvolver();
  send.buffer = impulseResponse(off, palette.reverb.seconds, palette.reverb.decay);
  send.connect(bus);
  for (const note of resolveSfx(def, palette, {})) playVoice(off, { dry: bus, send }, note, 0);
  const buffer = await off.startRendering();
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    for (const v of buffer.getChannelData(ch)) peak = Math.max(peak, Math.abs(v));
  }
  if (peak > 0) {
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) * (SFX_PEAK / peak);
    }
  }
  return wavBase64(buffer);
}

/** BGM の展開。at 秒に勢いと STREAK を切り替える */
interface BgmCue {
  readonly at: number;
  readonly momentum: number;
  readonly streak: boolean;
}

/** エンジンの出力先を録音に向ける。エンジンは destination へつなぐだけなので、そこを差し替える */
let recorded: MediaStream | null = null;
class RecordingContext extends AudioContext {
  #tap: GainNode | null = null;
  override get destination(): AudioDestinationNode {
    if (!this.#tap) {
      this.#tap = this.createGain();
      const stream = this.createMediaStreamDestination();
      this.#tap.connect(stream);
      recorded = stream.stream;
    }
    return this.#tap as unknown as AudioDestinationNode;
  }
}

/** ゲームの BGM（play の曲）を cues に沿って seconds 秒鳴らし、録音を base64 の webm で返す */
async function recordBgm(cues: readonly BgmCue[], seconds: number): Promise<string> {
  window.AudioContext = RecordingContext;
  const engine = createAudioEngine();
  engine.unlock();
  engine.setVolumes({ master: 1, sfx: 0, music: 1, muted: false });
  if (!recorded) throw new Error('録音の出力を作れなかった');
  const recorder = new MediaRecorder(recorded, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 256_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise((done) => {
    recorder.onstop = done;
  });
  recorder.start();
  engine.setSong('play');
  for (const cue of cues) {
    setTimeout(() => {
      engine.setMomentum(cue.momentum);
      engine.setStreak(cue.streak);
    }, cue.at * 1000);
  }
  await new Promise((done) => setTimeout(done, seconds * 1000));
  recorder.stop();
  await stopped;
  engine.setSong(null);
  return blobBase64(new Uint8Array(await new Blob(chunks).arrayBuffer()));
}

Object.assign(window, { renderSfx, recordBgm });
