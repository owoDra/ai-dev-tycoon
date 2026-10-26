import { describe, expect, it } from 'vitest';
import { findBottleneck } from '../../src/core/bottleneck';
import { step } from '../../src/core/step';
import {
  DEMO_PROJECT,
  type DemoSceneId,
  demoInitialState,
  demoSceneOrder,
  demoScenes,
  isDemoDone,
} from '../../src/dev/explore/d2/demo';

/** 幕を最後まで進め、ボトルネックの最大の大きさ（分）と終了時刻を返す */
function playScene(scene: DemoSceneId) {
  let state = demoInitialState(scene);
  let peak = 0;
  while (!isDemoDone(state) && state.clock < 5000) {
    state = step(state, 10).state;
    peak = Math.max(peak, findBottleneck(state)?.minutes ?? 0);
  }
  return { done: isDemoDone(state), clock: state.clock, peak };
}

describe('D2 のデモ再生', () => {
  it('どの幕も全 Task の担当が決まった状態で始まる', () => {
    for (const scene of demoSceneOrder) {
      const run = demoInitialState(scene).projects[DEMO_PROJECT];
      expect(Object.keys(demoScenes[scene]).sort()).toEqual(Object.keys(run?.tasks ?? {}).sort());
      expect(Object.values(run?.tasks ?? {}).every((t) => t.assignment !== null)).toBe(true);
    }
  });

  it('第1幕（全部人間）はボトルネックが強くなり、第2幕（AI＋レビュー）では弱く、早く終わる', () => {
    const before = playScene('before');
    const after = playScene('after');
    expect(before.done && after.done).toBe(true);
    expect(after.peak).toBeLessThan(before.peak);
    expect(after.clock).toBeLessThan(before.clock);
  });
});
