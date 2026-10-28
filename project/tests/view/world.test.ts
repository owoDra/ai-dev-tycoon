import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { worldLooks } from '../../src/content/look/world';
import type { AssignModeId } from '../../src/content/types';
import type { Command } from '../../src/core/commands';
import { createInitialState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import {
  agentActorId,
  describeEntity,
  humanActorId,
  islandId,
  type WorldViewModel,
  worldView,
} from '../../src/view/world';
import { runHeadless } from '../helpers/headless';
import { playProject, strategies } from '../helpers/strategies';
import { AVERAGE_TEAM } from '../helpers/talent';

const P = 'ecRenewal';
const look = worldLooks.standard;
const start: Command = { type: 'StartProject', projectId: P };
const assign = (taskId: string, mode: AssignModeId, workerId: string): Command => ({
  type: 'AssignTask',
  projectId: P,
  taskId,
  mode,
  workerId,
});

/** 工程の所要時間を数値で確かめるので、速度がちょうど平均の2人（A・B）で進める */
const [A, B] = AVERAGE_TEAM;

function viewAt(until: number, commands: Command[]): WorldViewModel {
  const { state } = runHeadless({
    seed: 'world',
    initial: createInitialState('world', { team: AVERAGE_TEAM }),
    commands: commands.map((command) => ({ at: 0, command })),
    until,
  });
  return worldView(state, P, look);
}

const island = (vm: WorldViewModel, taskId: string) => vm.islands.find((i) => i.taskId === taskId);
const actor = (vm: WorldViewModel, id: string) => vm.actors.find((a) => a.id === id);

describe('worldView', () => {
  it('ホーム（案件を開いていない）では、チュートリアルの床ではなく会社のオフィス：島も荷物もなく、会社の全員が休憩所にいる', () => {
    const state = createInitialState('w', { board: true, tutorial: false });
    const vm = worldView(state, null, look);
    expect(vm.projectId).toBeNull();
    expect(vm.islands).toEqual([]);
    expect(vm.packets).toEqual([]);
    expect(vm.actors.map((a) => [a.kind, a.islandId, a.activity])).toEqual(
      Object.keys(state.team).map(() => ['human', null, 'idle']),
    );
  });

  it('開始前は Task ごとの島だけがあり、人間は休憩所で待機している', () => {
    const vm = worldView(createInitialState('w'), P, look);
    expect(vm.started).toBe(false);
    expect(vm.islands.map((i) => i.id)).toEqual(
      ['hearing', 'requirements', 'uiDesign', 'research', 'implementation', 'qa', 'release'].map(islandId),
    );
    expect(vm.islands.every((i) => i.status === 'unassigned' && i.queueLength === 0 && !i.isBottleneck)).toBe(true);
    expect(vm.packets).toEqual([]);
    expect(vm.actors.map((a) => [a.kind, a.islandId, a.activity])).toEqual([
      ['human', null, 'idle'],
      ['human', null, 'idle'],
    ]);
  });

  it('人間が作業中の Task は、島のデスクにパケットがあり、担当者がその島で集中している', () => {
    const vm = viewAt(30, [start, assign('hearing', 'human', A)]);
    expect(island(vm, 'hearing')).toMatchObject({ status: 'running', stage: 'work' });
    expect(island(vm, 'hearing')?.progress).toBeCloseTo(30 / 90, 1);
    expect(vm.packets).toEqual([
      expect.objectContaining({ taskId: 'hearing', place: { kind: 'desk', islandId: islandId('hearing') } }),
    ]);
    expect(actor(vm, humanActorId(A))).toMatchObject({
      islandId: islandId('hearing'),
      activity: 'work',
      expression: 'focus',
    });
    expect(actor(vm, humanActorId(B))).toMatchObject({ islandId: null, activity: 'idle' });
  });

  it('完了した Task の成果物はコンベアを流れ、次の Task が未着手なら島の前に積まれる（待ち行列の長さ）', () => {
    const commands = [start, assign('hearing', 'human', A)];
    const onBelt = viewAt(90 + look.flow.travelMinutes / 2, commands).packets;
    expect(onBelt).toHaveLength(1);
    expect(onBelt[0]?.place).toMatchObject({ kind: 'belt', conveyorId: 'hearing->requirements' });
    if (onBelt[0]?.place.kind === 'belt') expect(onBelt[0].place.progress).toBeCloseTo(0.5, 1);

    const arrived = viewAt(90 + look.flow.travelMinutes + 1, commands);
    expect(arrived.packets[0]?.place).toEqual({ kind: 'stack', islandId: islandId('requirements'), index: 0 });
    expect(island(arrived, 'requirements')?.queueLength).toBe(1);
  });

  it('同じ人に仕事が重なると、掛け持ちの Task は「掛け持ちで遅い」になって島の前に積まれ、その人は困った顔になる', () => {
    // 昼休み（始業から3時間後に1時間）は手を止めるので、その分だけ後で見る
    const lunch = balance.time.workday.lunchEnd - balance.time.workday.lunchStart;
    const vm = viewAt(90 + 120 + lunch + 5, [
      start,
      ...['hearing', 'requirements', 'uiDesign', 'research'].map((t) => assign(t, 'human', A)),
    ]);
    // UI設計と競合調査を同時に掛け持ちしている
    const queued = vm.islands.filter((i) => i.status === 'queued');
    expect(queued).toHaveLength(2);
    expect(queued[0]?.queueLength).toBeGreaterThanOrEqual(1);
    expect(vm.packets.some((p) => p.place.kind === 'stack' && p.place.islandId === queued[0]?.id)).toBe(true);
    expect(actor(vm, humanActorId(A))?.expression).toBe('trouble');
  });

  it('AI が関わる Task には役割の見た目の Agent が現れ、AI の工程で集中し、終わると喜ぶ', () => {
    const commands = [start, assign('hearing', 'aiThenHumanReview', 'agent')];
    const working = viewAt(6, commands);
    expect(actor(working, agentActorId('hearing'))).toMatchObject({
      kind: 'ai',
      model: 'agentResearch',
      islandId: islandId('hearing'),
      activity: 'work',
      expression: 'focus',
    });
    const reviewing = viewAt(10, commands);
    expect(actor(reviewing, agentActorId('hearing'))?.activity).toBe('idle');
    expect(actor(reviewing, humanActorId(A))?.islandId).toBe(islandId('hearing'));
  });

  it('Agent の見た目は Task の役割で変わる（Code / QA / Release）', () => {
    const vm = viewAt(400, [
      start,
      ...['hearing', 'requirements', 'uiDesign', 'research', 'implementation', 'qa', 'release'].map((t) =>
        assign(t, 'agentWorkflow', 'agent'),
      ),
    ]);
    const { state } = playProject(P, strategies.aiWithReview(P), 'roles');
    const models = new Set(
      ['implementation', 'qa', 'release'].map(
        (t) =>
          worldView({ ...state, clock: state.projects[P]?.tasks[t]?.completedAt ?? 0 }, P, look).actors.find(
            (a) => a.id === agentActorId(t),
          )?.model,
      ),
    );
    expect(models).toEqual(new Set(['agentCode', 'agentQa', 'agentRelease']));
    expect(vm.actors.filter((a) => a.kind === 'ai').every((a) => a.islandId !== null)).toBe(true);
  });

  it('最大のボトルネックの島だけにフラグが立ち、強度は 0〜1', () => {
    const { state } = playProject(P, strategies.allHuman(P), 'bn', 0.5);
    const vm = worldView(state, P, look);
    const flagged = vm.islands.filter((i) => i.isBottleneck);
    expect(flagged).toHaveLength(1);
    expect(vm.bottleneck?.entityId).toBe(flagged[0]?.id);
    expect(flagged[0]?.bottleneck).toBeGreaterThan(0);
    expect(flagged[0]?.bottleneck).toBeLessThanOrEqual(1);
    expect(vm.islands.filter((i) => !i.isBottleneck).every((i) => i.bottleneck === 0)).toBe(true);
  });

  it('人間の待ち行列がボトルネックなら、その人にフラグが立つ', () => {
    const base = runHeadless({ seed: 'h', commands: [{ at: 0, command: start }], until: 1 }).state;
    const state = {
      ...base,
      clock: 300,
      humanQueues: {
        ...base.humanQueues,
        suzuki: [
          { projectId: 'other', taskId: 'a', queuedAt: 0 },
          { projectId: 'other', taskId: 'b', queuedAt: 0 },
        ],
      },
    };
    const vm = worldView(state, P, look);
    expect(vm.bottleneck).toEqual({ entityId: humanActorId('suzuki'), intensity: 1 });
    expect(actor(vm, humanActorId('suzuki'))).toMatchObject({ isBottleneck: true, expression: 'trouble' });
    expect(vm.islands.some((i) => i.isBottleneck)).toBe(false);
  });

  it('弱いボトルネック（threshold 未満）は目立たせない', () => {
    const { state } = playProject(P, strategies.allHuman(P), 'weak', 0.5);
    const vm = worldView(state, P, { ...look, bottleneck: { ...look.bottleneck, fullMinutes: 1e9 } });
    expect(vm.bottleneck).toBeNull();
    expect(vm.islands.some((i) => i.isBottleneck)).toBe(false);
  });

  it('案件が完了すると、納品物が出口に届き、全員が喜ぶ', () => {
    const { state } = playProject(P, strategies.smart(P), 'done');
    const vm = worldView(state, P, look);
    expect(vm.islands.every((i) => i.progress === 1)).toBe(true);
    expect(vm.packets).toEqual([expect.objectContaining({ taskId: 'release', place: { kind: 'exit', index: 0 } })]);
    expect(vm.actors.filter((a) => a.kind === 'human').every((a) => a.expression === 'joy')).toBe(true);
  });
});

describe('describeEntity', () => {
  it('選択した島・キャラクター・パケットの種類と名前を返し、消えたものは null', () => {
    const vm = viewAt(30, [start, assign('hearing', 'human', A)]);
    expect(describeEntity(vm, islandId('qa'))).toEqual({ kind: 'island', label: 'QA' });
    expect(describeEntity(vm, humanActorId(A))?.kind).toBe('human');
    expect(describeEntity(vm, 'packet:hearing')).toEqual({ kind: 'packet', label: ja.world.packet('顧客要望整理') });
    expect(describeEntity(vm, agentActorId('qa'))).toBeNull();
  });
});
