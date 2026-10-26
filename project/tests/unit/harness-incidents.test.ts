import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import type { IncidentId } from '../../src/content/types';
import { type Command, reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { getIncidentDef, incidentChance, incidentHolds, readIncident } from '../../src/core/incidents';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { runHeadless } from '../helpers/headless';
import { strategies } from '../helpers/strategies';

const AGENT = 'agent';

/** 事件が起きる遊び方。案件を始めて担当と Harness を決める Command の列 */
interface Scenario {
  readonly projectId: string;
  readonly setup: (started: GameState) => Command[];
}

const equip = (...parts: string[]): Command[] =>
  parts.map((partId) => ({ type: 'EquipPart', workerId: AGENT, partId }));
const workflow = (projectId: string): Command => ({
  type: 'AssignWorkflow',
  projectId,
  taskIds: getProject(projectId).tasks.map((t) => t.id),
  workerId: AGENT,
});

/** 8種類それぞれが起きやすい遊び方（企画書19章） */
const SCENARIOS: Readonly<Record<IncidentId, Scenario>> = {
  // 資料をすべて渡して長く続ける
  contextOverflow: { projectId: 'paymentFix', setup: (s) => strategies.aiWithReview('paymentFix')(s) },
  staleContext: { projectId: 'paymentFix', setup: (s) => strategies.aiWithReview('paymentFix')(s) },
  instructionConflict: { projectId: 'paymentFix', setup: (s) => strategies.aiWithReview('paymentFix')(s) },
  // 失敗しやすい Model で、Eval の修復を繰り返す
  retrySpiral: {
    projectId: 'corporateSite',
    setup: (s) => [
      ...strategies.aiWithReview('corporateSite')(s),
      { type: 'SetModel', workerId: AGENT, modelId: 'lite' },
      ...equip('evalAcceptance', 'evalUnitTest'),
    ],
  },
  // 確認なしで Workflow を長く走らせる
  agentDrift: { projectId: 'corporateSite', setup: () => [workflow('corporateSite')] },
  missingValidation: { projectId: 'ecRenewal', setup: (s) => strategies.allAiNoReview('ecRenewal')(s) },
  coordinationExplosion: {
    projectId: 'corporateSite',
    setup: (s) => [
      ...strategies.aiWithReview('corporateSite')(s),
      ...equip('subResearch', 'subCode', 'subQa', 'subReview', 'subDocs'),
    ],
  },
  // AI に任せた仕事の確認が人間に押し寄せる
  humanBottleneck: { projectId: 'saasFeature', setup: (s) => strategies.aiWithReview('saasFeature')(s) },
};

/** 事件が起きるまで1分ずつ進める。起きたらその時点の state を返す */
function untilIncident(id: IncidentId, scenario: Scenario): GameState | null {
  for (let i = 0; i < 12; i++) {
    let s = reduce(createInitialState(`hinc-${id}-${i}`), {
      type: 'StartProject',
      projectId: scenario.projectId,
    }).state;
    for (const c of scenario.setup(s)) s = reduce(s, c).state;
    for (let t = 0; t < 3000 && s.projects[scenario.projectId]?.completedAt === null; t++) {
      s = step(s, 1).state;
      if (s.incidents.some((r) => r.id === id)) return s;
    }
  }
  return null;
}

describe('8種類の事件が、遊びの中で発生し、解決できる（企画書19章）', () => {
  it.each(Object.entries(SCENARIOS) as [IncidentId, Scenario][])('%s', (id, scenario) => {
    const s = untilIncident(id, scenario);
    expect(s, `${id} が起きない`).not.toBeNull();
    if (!s) return;
    const run = s.incidents.find((r) => r.id === id);
    if (!run) throw new Error('事件がない');
    const def = getIncidentDef(id);
    expect(incidentHolds(def, readIncident(s, AGENT, run.projectId, run.taskId))).toBe(true);

    const r = reduce(s, { type: 'ResolveIncident', incident: id, workerId: AGENT });
    expect(r.state.incidents.some((x) => x.id === id)).toBe(false);
    expect(r.events).toContainEqual<GameEvent>({ type: 'IncidentResolved', incident: id, workerId: AGENT });
    // 解決アクションが原因を取り除くので、同じ Task ではもう起きない
    const after = readIncident(r.state, AGENT, run.projectId, run.taskId);
    expect(incidentHolds(def, after)).toBe(false);
    expect(incidentChance(def, after)).toBe(0);
  });
});

describe('Human Bottleneck が起きやすい案件', () => {
  it('SaaS の新機能追加は、同じ遊び方（すべて AI → 人間レビュー）の EC サイトリニューアルより Human Bottleneck が多い', () => {
    const count = (projectId: string) => {
      let n = 0;
      for (let i = 0; i < 20; i++) {
        let s = reduce(createInitialState(`hb-${i}`), { type: 'StartProject', projectId }).state;
        for (const c of strategies.aiWithReview(projectId)(s)) s = reduce(s, c).state;
        const r = runHeadless({ seed: `hb-${i}`, initial: s, until: 3000 });
        n += r.events.filter((e) => e.type === 'IncidentStarted' && e.incident === 'humanBottleneck').length;
      }
      return n;
    };
    const saas = count('saasFeature');
    const ec = count('ecRenewal');
    console.log(
      `[企画書19章] Human Bottleneck の発生回数（20 seed）：SaaS の新機能追加 ${saas} 回 vs EC サイトリニューアル ${ec} 回`,
    );
    expect(saas).toBeGreaterThan(ec);
  });
});

describe('Harness の部品で事件を防ぐ', () => {
  it('Eval を付けていれば Missing Validation は起きない', () => {
    let s = reduce(createInitialState('guard'), { type: 'StartProject', projectId: 'ecRenewal' }).state;
    for (const c of strategies.allAiNoReview('ecRenewal')(s)) s = reduce(s, c).state;
    const def = getIncidentDef('missingValidation');
    expect(incidentChance(def, readIncident(s, AGENT, 'ecRenewal', 'implementation'))).toBeGreaterThan(0);
    s = reduce(s, { type: 'EquipPart', workerId: AGENT, partId: 'evalAcceptance' }).state;
    expect(incidentChance(def, readIncident(s, AGENT, 'ecRenewal', 'implementation'))).toBe(0);
  });

  it('お願い（指示文のルール）では Retry Spiral を防げず、Hook なら防げる（企画書14章）', () => {
    const base = reduce(createInitialState('guard'), { type: 'StartProject', projectId: 'ecRenewal' }).state;
    const def = getIncidentDef('retrySpiral');
    const reading = (s: GameState) => ({ ...readIncident(s, AGENT, 'ecRenewal', 'implementation'), retries: 3 });
    const request = reduce(base, { type: 'EquipPart', workerId: AGENT, partId: 'requestUnitTest' }).state;
    const hook = reduce(base, { type: 'EquipPart', workerId: AGENT, partId: 'hookUnitTest' }).state;
    expect(incidentChance(def, reading(request))).toBeGreaterThan(0);
    expect(incidentChance(def, reading(hook))).toBe(0);
  });

  it('Subagent を最適な数に減らすと Coordination Explosion は解消する', () => {
    let s = reduce(createInitialState('trim'), { type: 'StartProject', projectId: 'corporateSite' }).state;
    for (const partId of ['subResearch', 'subCode', 'subQa', 'subReview']) {
      s = reduce(s, { type: 'EquipPart', workerId: AGENT, partId }).state;
    }
    s = {
      ...s,
      incidents: [
        { id: 'coordinationExplosion', workerId: AGENT, projectId: 'corporateSite', taskId: 'design', since: 0 },
      ],
    };
    const r = reduce(s, { type: 'ResolveIncident', incident: 'coordinationExplosion', workerId: AGENT });
    expect(r.state.harnesses[AGENT]?.parts).toEqual(['subResearch', 'subCode']);
  });
});
