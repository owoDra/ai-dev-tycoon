/**
 * 場面の並びと長さ。動画（Root.tsx）と、BGM の録音（capture/sound.ts）が同じ時刻を使うよう、React に依存しない形で置く。
 * 場面の長さは、ナレーションが収まるように伸ばす（layout）
 */

export type SceneId = 'title' | 'assign' | 'trouble' | 'delivered' | 'harness' | 'bring' | 'facts' | 'end';

export interface SceneSpec {
  readonly id: SceneId;
  /** ナレーションがなくても確保する長さ（秒） */
  readonly seconds: number;
  /** BGM の勢い（0〜1）。ゲームの BGM は勢いでレイヤーが増える */
  readonly momentum: number;
  /** AUTONOMY STREAK のレイヤーを足すか */
  readonly streak?: boolean;
}

export const scenes: readonly SceneSpec[] = [
  { id: 'title', seconds: 5.5, momentum: 0.2 },
  { id: 'assign', seconds: 7, momentum: 0.4 },
  { id: 'trouble', seconds: 6, momentum: 0.7, streak: true },
  { id: 'delivered', seconds: 6, momentum: 0.9 },
  { id: 'harness', seconds: 9, momentum: 0.6 },
  { id: 'bring', seconds: 9, momentum: 0.75 },
  { id: 'facts', seconds: 6.5, momentum: 0.9 },
  { id: 'end', seconds: 9, momentum: 1 },
];

/** 場面の切り替え（重なる長さ、秒） */
export const TRANSITION_SECONDS = 0.5;
/** ナレーションの後に空ける長さ（秒） */
const VOICE_TAIL_SECONDS = 0.7;

/** ナレーション1本（場面ごと）の長さ（秒）。capture/voice.ts が public/voice/durations.json に書く */
export type VoiceDurations = Partial<Record<SceneId, number>>;

export interface PlacedScene extends SceneSpec {
  /** 動画の先頭からの開始時刻（秒） */
  readonly start: number;
  /** 実際の長さ（秒） */
  readonly length: number;
}

/** 場面を並べる。ナレーションの開始は場面の頭から narrationDelay 秒後で、それが収まるまで場面を伸ばす */
export function layout(voice: VoiceDurations, narrationDelay: (id: SceneId) => number): PlacedScene[] {
  let start = 0;
  return scenes.map((scene) => {
    const spoken = voice[scene.id];
    const need = spoken === undefined ? 0 : narrationDelay(scene.id) + spoken + VOICE_TAIL_SECONDS;
    const length = Math.max(scene.seconds, need);
    const placed = { ...scene, start, length };
    start += length - TRANSITION_SECONDS;
    return placed;
  });
}

/** 動画全体の長さ（秒） */
export function totalSeconds(placed: readonly PlacedScene[]): number {
  const last = placed[placed.length - 1];
  return last ? last.start + last.length : 0;
}
