import { describe, expect, it } from 'vitest';
import {
  comboSemitones,
  duckGain,
  envelopeSeconds,
  midiToHz,
  resolveSfx,
  screenPan,
  sfxSeconds,
} from '../../src/audio/notes';
import { karplusStrong } from '../../src/audio/synth/pluck';
import { fxTable } from '../../src/content/fx';
import { defaultSoundPaletteId, type SoundPaletteId, soundPalettes, voiceSlots } from '../../src/content/look/sound';
import { audioRules, eventSfx, getSfx, sfxCatalog } from '../../src/content/sfx';

const palettes = Object.keys(soundPalettes) as SoundPaletteId[];
/** 揺らぎの両端 */
const extremes = [() => -1, () => 1];

describe('効果音カタログ', () => {
  it('15種類以上あり、ID が重複しない', () => {
    const ids = sfxCatalog.map((d) => d.id);
    expect(ids.length).toBeGreaterThanOrEqual(15);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(sfxCatalog.map((d) => [d.id, d] as const))('%s', (_id, def) => {
    const combos = def.comboRise ? [def.comboRise.minCombo, def.comboRise.minCombo + def.comboRise.maxSteps + 5] : [0];

    it('レイヤーがあり、エンベロープの値が 0 以上で sustain は 0〜1', () => {
      expect(def.layers.length).toBeGreaterThan(0);
      for (const l of def.layers) {
        for (const v of [l.at, l.env.attack, l.env.decay, l.env.hold, l.env.release])
          expect(v).toBeGreaterThanOrEqual(0);
        expect(l.env.sustain).toBeGreaterThanOrEqual(0);
        expect(l.env.sustain).toBeLessThanOrEqual(1);
        expect(Math.abs(l.pan ?? 0)).toBeLessThanOrEqual(1);
        expect(l.send ?? 0).toBeGreaterThanOrEqual(0);
        expect(l.send ?? 0).toBeLessThanOrEqual(1);
      }
    });

    it(`エンベロープの合計時間が上限（${audioRules.maxSfxSeconds} 秒）以内`, () => {
      expect(sfxSeconds(def)).toBeLessThanOrEqual(audioRules.maxSfxSeconds);
      expect(sfxSeconds(def)).toBeGreaterThan(0);
    });

    it.each(palettes)('パレット %s：周波数が可聴域内、ピーク音量の合計が 1 以下（コンボ・揺らぎの両端でも）', (p) => {
      for (const combo of combos) {
        for (const jitter of extremes) {
          const notes = resolveSfx(def, soundPalettes[p], { combo, jitter });
          expect(notes.length).toBe(def.layers.length);
          for (const n of notes) {
            for (const hz of [n.hz, n.glideHz ?? n.hz]) {
              expect(hz).toBeGreaterThanOrEqual(audioRules.minHz);
              expect(hz).toBeLessThanOrEqual(audioRules.maxHz);
            }
          }
          expect(notes.reduce((sum, n) => sum + n.gain, 0)).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  it('パレットはすべての声部を持ち、音量の補正は 0〜1', () => {
    for (const p of palettes) {
      for (const slot of voiceSlots) {
        expect(soundPalettes[p].voices[slot]).toBeDefined();
        expect(soundPalettes[p].trims[slot]).toBeGreaterThan(0);
        expect(soundPalettes[p].trims[slot]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('演出と出来事が参照する効果音はすべてカタログにある', () => {
    for (const def of fxTable) for (const id of def.sfx) expect(() => getSfx(id)).not.toThrow();
    for (const id of Object.values(eventSfx)) expect(() => getSfx(id)).not.toThrow();
  });

  it('コンボはペンタトニックの音階を1段ずつ上がり、上限で止まる', () => {
    const rise = getSfx('combo').comboRise;
    if (!rise) throw new Error('combo に comboRise がない');
    const steps = [2, 3, 4, 5, 6, 7, 8].map((c) => comboSemitones(rise, c));
    expect(steps).toEqual([0, 2, 4, 7, 9, 12, 14]);
    expect(comboSemitones(rise, 100)).toBe(comboSemitones(rise, rise.minCombo + rise.maxSteps));
    // コンボが始まる前は鳴らさない
    expect(resolveSfx(getSfx('combo'), soundPalettes[defaultSoundPaletteId], { combo: 1 })).toEqual([]);
  });

  it('揺らぎは音程を cents の幅で動かし、音量は下げる方向だけ', () => {
    const def = getSfx('taskStart');
    const base = resolveSfx(def, soundPalettes[defaultSoundPaletteId])[0];
    const up = resolveSfx(def, soundPalettes[defaultSoundPaletteId], { jitter: () => 1 })[0];
    const down = resolveSfx(def, soundPalettes[defaultSoundPaletteId], { jitter: () => -1 })[0];
    if (!base || !up || !down) throw new Error('レイヤーがない');
    expect(up.hz / base.hz).toBeCloseTo(2 ** (def.variation.cents / 1200), 6);
    expect(down.hz).toBeLessThan(base.hz);
    expect(up.gain).toBeCloseTo(base.gain, 6);
    expect(down.gain).toBeLessThan(base.gain);
  });
});

describe('音の計算', () => {
  it('MIDI → Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(81)).toBeCloseTo(880);
    expect(midiToHz(60)).toBeCloseTo(261.63, 1);
  });

  it('エンベロープの長さ', () => {
    expect(envelopeSeconds({ attack: 0.1, decay: 0.2, sustain: 0.5, hold: 0.3, release: 0.4 })).toBeCloseTo(1);
  });

  it('画面上の位置からパンを付ける（中央 0・左端 -幅・右端 +幅、画面外は切り詰め）', () => {
    expect(screenPan(500, 1000, 0.7)).toBeCloseTo(0);
    expect(screenPan(0, 1000, 0.7)).toBeCloseTo(-0.7);
    expect(screenPan(1000, 1000, 0.7)).toBeCloseTo(0.7);
    expect(screenPan(3000, 1000, 0.7)).toBeCloseTo(0.7);
    expect(screenPan(10, 0, 0.7)).toBe(0);
  });

  it('ダッキングは下げて保ち、元に戻る', () => {
    const d = audioRules.duck;
    expect(duckGain(-1, d)).toBe(1);
    expect(duckGain(0, d)).toBe(1);
    expect(duckGain(d.attack + d.hold / 2, d)).toBe(d.level);
    expect(duckGain(d.attack + d.hold + d.release / 2, d)).toBeCloseTo((1 + d.level) / 2);
    expect(duckGain(d.attack + d.hold + d.release + 1, d)).toBe(1);
  });

  it('Karplus-Strong の撥弦音は減衰し、振幅は 1 を超えない', () => {
    let seed = 1;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const sampleRate = 8000;
    const data = karplusStrong(220, sampleRate, 1, { damping: 0.99, brightness: 0.8 }, random);
    const rms = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += (data[i] ?? 0) ** 2;
      return Math.sqrt(sum / (to - from));
    };
    expect(data.length).toBe(sampleRate);
    expect(Math.max(...data.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(rms(sampleRate - 800, sampleRate)).toBeLessThan(rms(0, 800) / 4);
  });
});
