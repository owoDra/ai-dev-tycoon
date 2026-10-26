import { type FxSignalKind, type FxTier, fxTable } from '../../../content/fx';
import type { FeelChoice } from '../../../content/look/feel';
import type { SoundPaletteId } from '../../../content/look/sound';
import { getSfx } from '../../../content/sfx';

/**
 * D4 の比較ページのデモ再生。Task 完了 → コンボ → 事件の発生 → 自動修復 → ボトルネックの解消 → Autonomy Streak →
 * 案件完了、までを約60秒で流し、Tier 0〜4 を一通り見せる。演出のきっかけ（FxSignal）を決まった時刻に director へ流すだけで、
 * ゲームの state は変えない。BGM の勢いも時刻ごとに上げていき、強度の段階が上がっていく様子も聞かせる。
 */

/** デモの1拍。select は島を選ぶ（Tier 0 の持ち上げ）、taskStart は作業開始の音だけ */
export interface DemoBeat {
  /** 開始からの秒 */
  readonly at: number;
  readonly kind: FxSignalKind | 'taskStart';
  /** 演出を出す島（ECサイト案件の工程の順番。0 = ヒアリング） */
  readonly island: number;
  readonly amount?: number;
  /** この拍から BGM の勢い（0〜1）をこの値にする */
  readonly momentum?: number;
}

/** デモ全体の長さ（秒）。最後の演出の余韻を含む */
export const DEMO_SECONDS = 60;

/** コンボの Task 完了の間隔（秒） */
const COMBO_GAP = 0.6;
const combo = (from: number, count: number, island: number): DemoBeat[] =>
  Array.from({ length: count }, (_, i) => ({ at: from + i * COMBO_GAP, kind: 'taskDone' as const, island }));

export const demoTimeline: readonly DemoBeat[] = [
  { at: 1.5, kind: 'select', island: 1, momentum: 0 },
  { at: 3, kind: 'select', island: 4 },
  { at: 5, kind: 'taskStart', island: 0, momentum: 0.12 },
  { at: 7, kind: 'taskDone', island: 0, momentum: 0.2 },
  { at: 10, kind: 'taskDone', island: 1 },
  ...combo(12.5, 5, 2).map((b, i) => (i === 0 ? { ...b, momentum: 0.45 } : b)),
  { at: 17, kind: 'reviewCatch', island: 2 },
  { at: 21, kind: 'incident', island: 4, momentum: 0.38 },
  { at: 24.5, kind: 'autoRepair', island: 4 },
  { at: 28, kind: 'taskDone', island: 3, momentum: 0.55 },
  { at: 31, kind: 'bottleneckCleared', island: 4, momentum: 0.65 },
  ...combo(35, 3, 5),
  { at: 39, kind: 'automation', island: 5, amount: 6.4, momentum: 0.8 },
  { at: 44, kind: 'autonomyStreak', island: 5, momentum: 0.92 },
  { at: 49, kind: 'projectComplete', island: 6, momentum: 1 },
];

/** 拍の Tier（演出の Tier。音だけの拍は効果音の Tier） */
export function beatTier(beat: Pick<DemoBeat, 'kind'>): FxTier {
  if (beat.kind === 'taskStart') return getSfx('taskStart').tier;
  return fxTable.find((d) => d.signal === beat.kind)?.tier ?? 0;
}

/** (from, to] 秒の間に来る拍 */
export function beatsBetween(timeline: readonly DemoBeat[], from: number, to: number): DemoBeat[] {
  return timeline.filter((b) => b.at > from && b.at <= to);
}

/** at 秒の時点の BGM の勢い（それまでに指定された最後の値） */
export function momentumAt(timeline: readonly DemoBeat[], at: number): number {
  let m = 0;
  for (const b of timeline) if (b.at <= at && b.momentum !== undefined) m = b.momentum;
  return m;
}

/** おすすめの組み合わせ（演出の強さ × モーションの性格 × 音色のパレット） */
export interface FeelCombo extends FeelChoice {
  readonly palette: SoundPaletteId;
}

/** 比較した3つのうち、採用した A だけを残している（B 派手 × きびきび × シンセポップ、C 控えめ × なめらか × グラス＆ベル は削除） */
export const feelCombos = {
  A: { intensity: 'standard', motion: 'bouncy', palette: 'wood' },
} as const satisfies Record<string, FeelCombo>;
export type FeelComboId = keyof typeof feelCombos;
export const feelComboIds = Object.keys(feelCombos) as FeelComboId[];

/** いまの選択がおすすめのどれと同じか（どれとも違えば null） */
export function matchCombo(choice: FeelCombo): FeelComboId | null {
  return (
    feelComboIds.find((id) => {
      const c = feelCombos[id];
      return c.intensity === choice.intensity && c.motion === choice.motion && c.palette === choice.palette;
    }) ?? null
  );
}
