import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { type Command, reduce } from '../../src/core/commands';
import { createInitialState, type GameState } from '../../src/core/state';
import { incidentBugs, tidinessOf, worldView } from '../../src/view/world';

const P = 'corporateSite';
const reward = worldLooks[defaultWorldLookId].reward;

function setup(commands: (s: GameState) => Command[]): GameState {
  const s = reduce(createInitialState('tidy'), { type: 'StartProject', projectId: P }).state;
  return commands(s).reduce((acc, c) => reduce(acc, c).state, s);
}
const assignAll = (mode: 'human' | 'ai' | 'aiThenHumanReview'): Command[] =>
  getProject(P).tasks.map((t) => ({
    type: 'AssignTask',
    projectId: P,
    taskId: t.id,
    mode,
    workerId: mode === 'human' ? 'sato' : 'agent',
  }));

describe('Visual Reward の整理度（企画書61章）', () => {
  it('人間の仕事が減り、AI の仕事が確認で守られるほど整理度が上がる', () => {
    const human = tidinessOf(
      setup(() => assignAll('human')),
      P,
      reward,
    );
    const aiNoCheck = tidinessOf(
      setup(() => assignAll('ai')),
      P,
      reward,
    );
    const aiChecked = tidinessOf(
      setup(() => assignAll('aiThenHumanReview')),
      P,
      reward,
    );
    const workflowEval = tidinessOf(
      setup(() => [
        { type: 'AssignWorkflow', projectId: P, taskIds: getProject(P).tasks.map((t) => t.id), workerId: 'agent' },
        { type: 'EquipPart', workerId: 'agent', partId: 'evalAcceptance' },
      ]),
      P,
      reward,
    );
    expect(human).toBe(0);
    expect(aiNoCheck).toBeGreaterThan(human);
    expect(aiChecked).toBeGreaterThan(aiNoCheck);
    expect(workflowEval).toBe(1);
  });

  it('発生中の事件があると整理度が下がり、事件の島にバグ生物が出る', () => {
    const tidy = setup(() => assignAll('aiThenHumanReview'));
    const messy: GameState = {
      ...tidy,
      incidents: [{ id: 'agentDrift', workerId: 'agent', projectId: P, taskId: 'design', since: 0 }],
    };
    expect(tidinessOf(messy, P, reward)).toBeLessThan(tidinessOf(tidy, P, reward));
    expect(incidentBugs(messy, P)).toEqual([
      { id: 'incident:agentDrift:agent', incident: 'agentDrift', islandId: 'island:design', model: 'bugAgentDrift' },
    ]);
    const vm = worldView(messy, P, worldLooks[defaultWorldLookId]);
    expect(vm.incidents).toHaveLength(1);
    expect(vm.tidiness).toBeCloseTo(tidinessOf(messy, P, reward));
    expect(incidentBugs(messy, 'ecRenewal')).toEqual([]);
  });
});
