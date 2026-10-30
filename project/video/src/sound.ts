import type { SfxId } from '../../src/content/sfx';
import type { SceneId } from './timeline';

/**
 * 効果音のきっかけ。ゲームの効果音（src/content/sfx.ts）を capture/sound.ts が public/audio/sfx/<id>.wav に書き出す。
 * at は場面の頭からの秒数で、画面の動き（pop の delay など）に合わせている
 */
export const sfxCues: readonly {
  readonly scene: SceneId;
  readonly at: number;
  readonly id: SfxId;
  readonly volume?: number;
}[] = [
  { scene: 'title', at: 0.15, id: 'panelOpen' },
  { scene: 'title', at: 0.75, id: 'fanfare', volume: 0.8 },
  { scene: 'assign', at: 0.1, id: 'select' },
  { scene: 'assign', at: 1.4, id: 'uiClick' },
  { scene: 'trouble', at: 0.1, id: 'streak' },
  { scene: 'trouble', at: 1.2, id: 'warning' },
  { scene: 'delivered', at: 0.1, id: 'taskDone' },
  { scene: 'delivered', at: 0.6, id: 'coin' },
  { scene: 'harness', at: 1.0, id: 'uiToggle' },
  { scene: 'harness', at: 1.17, id: 'uiToggle' },
  { scene: 'harness', at: 1.33, id: 'uiToggle' },
  { scene: 'harness', at: 1.5, id: 'uiToggle' },
  { scene: 'harness', at: 1.67, id: 'uiToggle' },
  { scene: 'harness', at: 1.83, id: 'uiToggle' },
  { scene: 'harness', at: 4.2, id: 'automation' },
  { scene: 'bring', at: 0.1, id: 'panelOpen' },
  { scene: 'bring', at: 1.0, id: 'combo' },
  { scene: 'facts', at: 0.47, id: 'uiClick' },
  { scene: 'facts', at: 0.77, id: 'uiClick' },
  { scene: 'facts', at: 1.07, id: 'uiClick' },
  { scene: 'facts', at: 2.2, id: 'coin' },
  { scene: 'end', at: 0.4, id: 'bottleneckCleared' },
];

/** 書き出す効果音の一覧 */
export const sfxIds = [...new Set(sfxCues.map((c) => c.id))];
