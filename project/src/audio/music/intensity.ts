import { type MusicLayerId, musicMomentum, musicStageThresholds, type Song } from '../../content/music';

/** BGM の勢いを決める、いまのゲームの様子（UI が state と演出の director から集める） */
export interface MomentumInput {
  /** 作業中の Task の数 */
  readonly running: number;
  /** いまのコンボ数 */
  readonly combo: number;
  /** 直近 recentWindowMs の間に完了した Task の数 */
  readonly recent: number;
}

type MomentumConfig = typeof musicMomentum;

const ratio = (value: number, full: number) => (full > 0 ? Math.min(1, Math.max(0, value / full)) : 0);

/** ゲームの勢い（0〜1）。どの入力についても、増えれば勢いは下がらない */
export function momentum(input: MomentumInput, cfg: MomentumConfig = musicMomentum): number {
  const w = cfg.weights;
  const sum =
    w.running * ratio(input.running, cfg.runningFull) +
    w.combo * ratio(input.combo, cfg.comboFull) +
    w.recent * ratio(input.recent, cfg.recentFull);
  return Math.min(1, Math.max(0, sum));
}

/** 勢いを目標へ近づける。上がるときは riseRate、下がるときは fallRate（1秒あたり）で、行き過ぎない */
export function smoothMomentum(
  current: number,
  target: number,
  dtSeconds: number,
  cfg: MomentumConfig = musicMomentum,
) {
  if (target > current) return Math.min(target, current + cfg.riseRate * dtSeconds);
  return Math.max(target, current - cfg.fallRate * dtSeconds);
}

/** 勢い（0〜1）→ 強度の段階（0 から）。勢いが増えれば段階は下がらない */
export function musicStage(value: number, thresholds: readonly number[] = musicStageThresholds): number {
  let stage = 0;
  thresholds.forEach((min, i) => {
    if (value >= min) stage = i;
  });
  return stage;
}

/** その曲を鳴らす段階（結果画面の曲のように段階が固定の曲は、勢いに関係なく固定の段階） */
export function songStage(song: Song, value: number): number {
  return song.fixedStage ?? musicStage(value);
}

/** その段階で鳴らすレイヤー。段階が上がるほどレイヤーが増える（減ることはない） */
export function activeLayers(song: Song, stage: number): MusicLayerId[] {
  return song.layers.filter((l) => l.fromStage <= stage).map((l) => l.id);
}
