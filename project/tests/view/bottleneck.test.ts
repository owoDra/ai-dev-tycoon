import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import type { BottleneckRef } from '../../src/core/bottleneck';
import { type Command, reduce } from '../../src/core/commands';
import { createInitialState, type GameState, updateTask } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { bottleneckMove, stageRows } from '../../src/view/bottleneck';

const P = 'saasFeature';
const stage = (taskId: string, s: 'work' | 'review'): BottleneckRef => ({
  kind: 'stage',
  projectId: P,
  taskId,
  stage: s,
});

function started(commands: Command[] = []): GameState {
  return [{ type: 'StartProject', projectId: P } as Command, ...commands].reduce(
    (s, c) => reduce(s, c).state,
    createInitialState('bn'),
  );
}

describe('ボトルネックの移動の案内（view/bottleneck.ts）', () => {
  it('移った先の工程の名前と島、移る前の工程の名前を返す', () => {
    const move = bottleneckMove(P, stage('qa', 'work'), stage('api', 'review'));
    expect(move).toEqual({ from: 'QA', to: ja.bottleneck.review('API 実装'), entityId: 'island:api' });
    expect(bottleneckMove(P, null, { kind: 'human', humanId: 'sato' })).toMatchObject({
      from: null,
      entityId: 'human:sato',
    });
  });

  it('同じボトルネック・ほかの案件・ボトルネックがなくなったときは案内しない', () => {
    expect(bottleneckMove(P, stage('qa', 'work'), stage('qa', 'work'))).toBeNull();
    expect(bottleneckMove(P, null, { kind: 'stage', projectId: 'ecRenewal', taskId: 'qa', stage: 'work' })).toBeNull();
    expect(bottleneckMove(P, stage('qa', 'work'), null)).toBeNull();
  });
});

describe('工程ごとの時間の比較（企画書20章「Implementation 8h → 20m」）', () => {
  it('Before は人間だけの時間、After は今の担当での見込み。AI に任せると実装は短くなりレビューの行が出る', () => {
    const human = stageRows(started(), P);
    const api = (rows: ReturnType<typeof stageRows>) => rows.find((r) => r.key === 'api/work');
    expect(api(human)).toMatchObject({ before: 480, after: 480 });
    expect(human.some((r) => r.stage === 'review')).toBe(false);

    const ai = stageRows(
      started([{ type: 'AssignTask', projectId: P, taskId: 'api', mode: 'aiThenHumanReview', workerId: 'agent' }]),
      P,
    );
    expect(api(ai)?.before).toBe(480);
    expect(api(ai)?.after).toBeLessThan(60);
    expect(ai.find((r) => r.key === 'api/review')?.after).toBeGreaterThan(60);
    expect(ai).toHaveLength(getProject(P).tasks.length + 1);
  });

  it('始まった工程は待ち時間を含む実績で、いまのボトルネックの行に印が付く', () => {
    let s = started();
    s = updateTask(s, P, 'qa', (r) => ({ ...r, status: 'running', lead: { work: 200, review: 0 } }));
    s = { ...s, bottleneck: stage('qa', 'work') };
    const rows = stageRows(s, P);
    expect(rows.find((r) => r.key === 'qa/work')).toMatchObject({ after: 200, bottleneck: true });
    expect(rows.filter((r) => r.bottleneck)).toHaveLength(1);
  });
});
