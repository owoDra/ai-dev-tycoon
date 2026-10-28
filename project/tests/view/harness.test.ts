import { describe, expect, it } from 'vitest';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { type Command, reduce } from '../../src/core/commands';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { harnessForecast, harnessView } from '../../src/view/harness';
import { workflowTasks } from '../../src/view/project';
import { worldView } from '../../src/view/world';
import { conveyorId } from '../../src/world/layout';

const P = 'corporateSite';
const AGENT = 'agent';
const look = worldLooks[defaultWorldLookId];

function started(commands: readonly Command[] = [], options = {}): GameState {
  let s = reduce(createInitialState('hv', options), { type: 'StartProject', projectId: P }).state;
  for (const c of commands) s = reduce(s, c).state;
  return s;
}

describe('Harness Builder の表示用データ（view/harness.ts）', () => {
  it('解放されていない行は出さない（Harness が未解放なら行がない）', () => {
    expect(harnessView(started(), P, AGENT).rows).toHaveLength(13);
    expect(harnessView(started([], { tutorial: true }), P, AGENT).rows).toEqual([]);
  });

  it('行の要約は今の設定を表し、選択肢は確定時の Command を持つ', () => {
    const s = started([{ type: 'EquipPart', workerId: AGENT, partId: 'hookLinter' }]);
    const automation = harnessView(s, P, AGENT).rows.find((r) => r.id === 'hook:PostToolUse');
    expect(automation?.summary).toBe('Linter Hook');
    const linter = automation?.groups.find((g) => g.options.some((o) => o.id === 'hookLinter'));
    expect(linter?.options.map((o) => o.selected)).toEqual([false, false, true]);
    expect(linter?.options[0]?.command).toEqual({ type: 'RemovePart', workerId: AGENT, partId: 'hookLinter' });
  });

  it('予測は Command を適用した見込みで、state は変えない', () => {
    // レビューなしで AI に任せた Task があると、Eval で品質の見込みが上がる
    const s = started([{ type: 'AssignTask', projectId: P, taskId: 'copy', mode: 'ai', workerId: AGENT }]);
    const f = harnessForecast(s, P, AGENT, { type: 'EquipPart', workerId: AGENT, partId: 'evalAcceptance' });
    expect(f.after.quality).toBeGreaterThan(f.before.quality);
    expect(f.after.humanMinutes).toBeLessThan(f.before.humanMinutes);
    expect(f.after.autonomyMinutes).toBeGreaterThan(f.before.autonomyMinutes);
    expect(s.harnesses).toEqual({});
    expect(harnessForecast(s, P, AGENT, null).after).toEqual(f.before);
  });
});

describe('部品の装着の 3D への反映（view/world.ts）', () => {
  const assign: Command = { type: 'AssignTask', projectId: P, taskId: 'hearing', mode: 'ai', workerId: AGENT };

  it('Agent に Hook のベルト・Eval の盾・Subagent の子機が付く（お願いはベルトにならない）', () => {
    const plain = worldView(step(started([assign]), 1).state, P, look).actors.find((a) => a.kind === 'ai');
    expect(plain?.gear).toEqual({ belt: false, shield: false, drones: 0 });
    const equip = (partId: string): Command => ({ type: 'EquipPart', workerId: AGENT, partId });
    const s = started([assign, equip('requestLinter'), equip('evalAcceptance'), equip('subCode'), equip('subQa')]);
    const geared = worldView(step(s, 1).state, P, look).actors.find((a) => a.kind === 'ai');
    expect(geared?.gear).toEqual({ belt: false, shield: true, drones: 2 });
    const hooked = worldView(step(reduce(s, equip('hookLinter')).state, 1).state, P, look).actors.find(
      (a) => a.kind === 'ai',
    );
    expect(hooked?.gear.belt).toBe(true);
  });

  it('Workflow にまとめた Task の間のコンベアは自動化レーンになる', () => {
    expect(worldView(started(), P, look).lanes).toEqual([]);
    const s = started([
      { type: 'AssignWorkflow', projectId: P, taskIds: workflowTasks(started(), P, 'frontend'), workerId: AGENT },
    ]);
    expect(worldView(s, P, look).lanes).toEqual([conveyorId('frontend', 'a11y'), conveyorId('a11y', 'release')]);
  });
});
