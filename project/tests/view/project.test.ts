import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/core/commands';
import { createInitialState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { bottleneckLabel, defaultWorkerFor, taskRows, workerOptions } from '../../src/view/project';
import { runHeadless } from '../helpers/headless';
import { playProject, strategies } from '../helpers/strategies';

const P = 'ecRenewal';

describe('taskRows', () => {
  it('未開始なら空、開始直後は全 Task が未割り当てで変更可能', () => {
    expect(taskRows(createInitialState('v'), P)).toEqual([]);
    const s = reduce(createInitialState('v'), { type: 'StartProject', projectId: P }).state;
    const rows = taskRows(s, P);
    expect(rows.map((r) => r.name)).toEqual(Object.values(ja.tasks.ecRenewal));
    expect(rows.every((r) => r.status === 'unassigned' && r.editable)).toBe(true);
  });

  it('同じ人に並んだ Task は「人間待ち」、処理中は「作業中」、終わると「完了」になる', () => {
    const assign = (taskId: string) =>
      ({ type: 'AssignTask', projectId: P, taskId, mode: 'aiThenHumanReview', workerId: 'agent' }) as const;
    const { state } = runHeadless({
      seed: 'v',
      commands: [{ type: 'StartProject', projectId: P } as const, assign('hearing'), assign('requirements')].map(
        (command) => ({ at: 0, command }),
      ),
      until: 3,
    });
    const rows = taskRows(state, P);
    expect(rows[0]).toMatchObject({ status: 'running', stage: 'work', editable: false, mode: 'aiThenHumanReview' });
    expect(rows[1]).toMatchObject({ status: 'waiting', editable: true });

    const queued = {
      ...state,
      humanQueues: {
        ...state.humanQueues,
        sato: [{ projectId: 'other', taskId: 'x', queuedAt: 0 }, ...(state.humanQueues.sato ?? [])],
      },
    };
    expect(taskRows(queued, P)[0]?.status).toBe('queued');
  });

  it('見逃した失敗を抱えて完了した Task は「品質低下」になる', () => {
    for (let i = 0; i < 10; i++) {
      const { state } = playProject(P, strategies.allAiNoReview(P), `view-${i}`);
      for (const row of taskRows(state, P)) {
        expect(row.status).toBe(state.projects[P]?.tasks[row.id]?.escaped ? 'defect' : 'done');
      }
    }
  });
});

describe('担当の選択肢', () => {
  it('人間だけのモードは人間、AI が関わるモードは AI Worker を候補にする', () => {
    expect(defaultWorkerFor('human')).toBe('sato');
    expect(defaultWorkerFor('aiThenHumanReview')).toBe('agent');
    expect(workerOptions('human').map((w) => w.id)).toEqual(['sato', 'suzuki']);
    expect(workerOptions('agentWorkflow').map((w) => w.id)).toEqual(['agent']);
  });
});

describe('bottleneckLabel', () => {
  it('ボトルネックの Task 名と工程を返し、なければ null', () => {
    expect(bottleneckLabel(createInitialState('v'))).toBeNull();
    const { state } = playProject(P, strategies.allHuman(P), 'label');
    expect(bottleneckLabel(state)).toBe(ja.score.stage(ja.tasks.ecRenewal.implementation, ja.stages.work));
  });
});
