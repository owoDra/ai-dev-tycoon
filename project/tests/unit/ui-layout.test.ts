import { describe, expect, it } from 'vitest';
import { layoutFormFor, MAX_HUD_ITEMS, uiLayout } from '../../src/content/look/layout';
import { reduce } from '../../src/core/commands';
import { sandboxInitialState, sandboxProblems } from '../../src/dev/explore/d3/sandbox';
import { islandId } from '../../src/view/world';

describe('画面構成（content/look/layout.ts）', () => {
  it('PC でもスマホでも HUD に常時表示する項目は上限以内で、重複しない', () => {
    for (const form of [uiLayout.wide, uiLayout.compact]) {
      expect(form.dock.items.length).toBeLessThanOrEqual(MAX_HUD_ITEMS);
      expect(new Set(form.dock.items).size).toBe(form.dock.items.length);
    }
  });

  it('ブレークポイント未満の幅はスマホの構成になる', () => {
    expect(layoutFormFor(uiLayout, 375)).toEqual({ compact: true, form: uiLayout.compact });
    expect(layoutFormFor(uiLayout, 1440)).toEqual({ compact: false, form: uiLayout.wide });
  });

  it('モーダルは画面いっぱいにせず、外側に暗い背景を残す（押せば閉じる）', () => {
    for (const form of [uiLayout.wide, uiLayout.narrow, uiLayout.compact]) {
      expect(form.sheet.heightRatio).toBeGreaterThan(0);
      expect(form.sheet.heightRatio).toBeLessThanOrEqual(0.9);
    }
    expect(uiLayout.flow.dismiss).toContain('backdropClick');
  });
});

describe('D3 の遊び場の問題（仮）', () => {
  it('担当が決まっていない Task を問題にし、担当を決めると消える', () => {
    const state = sandboxInitialState();
    const problems = sandboxProblems(state, undefined);
    expect(problems.map((p) => p.entityId)).toContain(islandId('uiDesign'));
    const next = reduce(state, {
      type: 'AssignTask',
      projectId: 'ecRenewal',
      taskId: 'uiDesign',
      mode: 'ai',
      workerId: 'agent',
    }).state;
    expect(sandboxProblems(next, undefined).map((p) => p.entityId)).not.toContain(islandId('uiDesign'));
  });
});
