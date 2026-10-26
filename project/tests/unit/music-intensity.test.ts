import { describe, expect, it } from 'vitest';
import { activeLayers, momentum, musicStage, smoothMomentum, songStage } from '../../src/audio/music/intensity';
import { chordTone, patternAt, stepNotes } from '../../src/audio/music/patterns';
import { midiToHz } from '../../src/audio/notes';
import { soundPalettes } from '../../src/content/look/sound';
import { musicMomentum, musicStageThresholds, type SongId, songs } from '../../src/content/music';
import { audioRules } from '../../src/content/sfx';

const songIds = Object.keys(songs) as SongId[];
const grid = Array.from({ length: 101 }, (_, i) => i / 100);

describe('BGM の強度', () => {
  it('3段階以上あり、境目は 0 から始まって昇順', () => {
    expect(musicStageThresholds.length).toBeGreaterThanOrEqual(3);
    expect(musicStageThresholds[0]).toBe(0);
    for (let i = 1; i < musicStageThresholds.length; i++) {
      expect(musicStageThresholds[i]).toBeGreaterThan(musicStageThresholds[i - 1] ?? 0);
    }
  });

  it('勢いが増えると段階は下がらず、0 で最低・1 で最高になる', () => {
    const stages = grid.map((v) => musicStage(v));
    for (let i = 1; i < stages.length; i++) expect(stages[i]).toBeGreaterThanOrEqual(stages[i - 1] ?? 0);
    expect(stages[0]).toBe(0);
    expect(stages.at(-1)).toBe(musicStageThresholds.length - 1);
  });

  it.each(songIds)('%s：勢いに対して有効になるレイヤーが単調に増える（前の段階のレイヤーを含む）', (id) => {
    const song = songs[id];
    let prev: string[] = [];
    for (const v of grid) {
      const layers = activeLayers(song, musicStage(v));
      for (const l of prev) expect(layers).toContain(l);
      expect(layers.length).toBeGreaterThanOrEqual(prev.length);
      prev = layers;
    }
  });

  it('プレイ中の曲は、段階ごとに少なくとも1つずつレイヤーが増える', () => {
    const counts = musicStageThresholds.map((_, s) => activeLayers(songs.play, s).length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1] ?? 0);
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts.at(-1)).toBe(songs.play.layers.length);
  });

  it('結果画面の曲は勢いに関係なく固定の段階で鳴る', () => {
    expect(songStage(songs.result, 0)).toBe(songStage(songs.result, 1));
    expect(songStage(songs.play, 0)).toBeLessThan(songStage(songs.play, 1));
  });

  it('勢いはどの入力についても単調に増え、0〜1 に収まる', () => {
    const base = { running: 1, combo: 2, recent: 1 };
    for (const key of ['running', 'combo', 'recent'] as const) {
      let prev = -1;
      for (let n = 0; n <= 20; n++) {
        const v = momentum({ ...base, [key]: n });
        expect(v).toBeGreaterThanOrEqual(prev);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        prev = v;
      }
    }
    expect(momentum({ running: 0, combo: 0, recent: 0 })).toBe(0);
    expect(momentum({ running: 99, combo: 99, recent: 99 })).toBeCloseTo(1);
  });

  it('勢いは上がるときは速く、下がるときはゆっくり追従し、目標を行き過ぎない', () => {
    const up = smoothMomentum(0, 1, 0.5);
    const down = smoothMomentum(1, 0, 0.5);
    expect(up).toBeCloseTo(musicMomentum.riseRate * 0.5);
    expect(1 - down).toBeCloseTo(musicMomentum.fallRate * 0.5);
    expect(1 - down).toBeLessThan(up);
    expect(smoothMomentum(0.4, 0.5, 10)).toBe(0.5);
    expect(smoothMomentum(0.6, 0.5, 10)).toBe(0.5);
  });
});

describe('楽曲のパターン', () => {
  it.each(songIds)('%s：パターンは1小節の長さで、使う文字が種類に合っている', (id) => {
    const song = songs[id];
    for (const layer of song.layers) {
      expect(layer.pattern.length).toBe(song.stepsPerBar);
      const allowed = layer.kind === 'drum' ? /^[.xo]+$/ : /^[.0-9]+$/;
      expect(layer.pattern).toMatch(allowed);
    }
  });

  it.each(songIds)('%s：全レイヤーの音が可聴域内', (id) => {
    const song = songs[id];
    const all = new Set(song.layers.map((l) => l.id));
    const bars = song.progression.length * song.stepsPerBar;
    for (let step = 0; step < bars; step++) {
      for (const note of stepNotes(song, step, all)) {
        const hz = midiToHz(note.midi);
        expect(hz).toBeGreaterThanOrEqual(audioRules.minHz);
        expect(hz).toBeLessThanOrEqual(audioRules.maxHz);
        for (const palette of Object.values(soundPalettes)) expect(palette.voices[note.voice]).toBeDefined();
      }
    }
  });

  it('和音の構成音と、パターンの読み方', () => {
    const major = songs.play.scale;
    // I = C E G、vi = A C E、3 番目は根音のオクターブ上
    expect([0, 1, 2, 3].map((k) => chordTone(major, 0, k))).toEqual([0, 4, 7, 12]);
    expect([0, 1, 2].map((k) => chordTone(major, 5, k))).toEqual([9, 12, 16]);
    expect(patternAt({ kind: 'drum', pattern: 'x.o.' }, 0)).toBe(1);
    expect(patternAt({ kind: 'drum', pattern: 'x.o.' }, 1)).toBeNull();
    expect(patternAt({ kind: 'drum', pattern: 'x.o.' }, 2)).toBeLessThan(1);
    expect(patternAt({ kind: 'arp', pattern: '0.3.' }, 2)).toBe(3);
  });

  it('有効なレイヤーの音だけが出る', () => {
    const song = songs.play;
    const onlyPad = stepNotes(song, 0, new Set(['pad']));
    expect(onlyPad.map((n) => n.layer)).toEqual(['pad', 'pad', 'pad']);
    expect(stepNotes(song, 0, new Set())).toEqual([]);
    const full = stepNotes(song, 0, new Set(song.layers.map((l) => l.id)));
    expect(new Set(full.map((n) => n.layer))).toEqual(new Set(['pad', 'bass', 'kick', 'arp', 'sparkle']));
  });
});
