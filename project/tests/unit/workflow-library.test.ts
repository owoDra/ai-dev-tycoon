import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import { libraryPresets } from '../../src/content/library';
import { allFeatures } from '../../src/content/unlocks';
import { type Command, reduce } from '../../src/core/commands';
import { getSession } from '../../src/core/context';
import type { GameEvent } from '../../src/core/events';
import { harnessOf } from '../../src/core/harness';
import {
  decodeWorkflowCode,
  encodeWorkflowCode,
  libraryWorkflows,
  lockedFeatures,
  type WorkflowDraft,
  workflowFromWorker,
  workflowStats,
} from '../../src/core/library';
import { encodeResultCode } from '../../src/core/resultCode';
import { deserialize, serialize } from '../../src/core/serialize';
import { createInitialState, type GameState } from '../../src/core/state';
import { ByteWriter, sealCode } from '../../src/lib/codec';
import { runHeadless } from '../helpers/headless';

const AGENT = 'agent';

function apply(state: GameState, commands: readonly Command[]): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let s = state;
  for (const c of commands) {
    const t = reduce(s, c);
    s = t.state;
    events.push(...t.events);
  }
  return { state: s, events };
}

/** 案件 A（コーポレートサイト）で AI Worker を組み、Workflow として保存した state */
function savedInProjectA() {
  const configured = apply(createInitialState('lib-a'), [
    { type: 'StartProject', projectId: 'corporateSite' },
    { type: 'SetModel', workerId: AGENT, modelId: 'frontier' },
    { type: 'EquipPart', workerId: AGENT, partId: 'skillFrontend' },
    { type: 'EquipPart', workerId: AGENT, partId: 'toolFiles' },
    { type: 'EquipPart', workerId: AGENT, partId: 'hookFormatter' },
    { type: 'EquipPart', workerId: AGENT, partId: 'evalUiReq' },
    { type: 'EquipPart', workerId: AGENT, partId: 'contextRouter' },
  ]).state;
  const draft = workflowFromWorker(configured, AGENT, 'aiThenEval', 'サイト実装');
  const saved = apply(configured, [{ type: 'SaveLibraryWorkflow', workflow: draft }]);
  return { draft, ...saved };
}

const sorted = (w: WorkflowDraft) => ({ ...w, parts: [...w.parts].sort() });

describe('Workflow Library（core/library.ts）', () => {
  it('保存すると棚に増え、WorkflowSaved が出る（id は保存した順に振る）', () => {
    const { state, events, draft } = savedInProjectA();
    expect(events).toEqual([{ type: 'WorkflowSaved', workflowId: 'custom1' }]);
    expect(state.library).toEqual([{ id: 'custom1', ...draft }]);
    expect(libraryWorkflows(state).length).toBe(libraryPresets.length + 1);
    const again = apply(state, [{ type: 'SaveLibraryWorkflow', workflow: { ...draft, name: '2つ目' } }]);
    expect(again.state.library.map((w) => w.id)).toEqual(['custom1', 'custom2']);
  });

  it('保存して別の案件の Task に適用すると、AI Worker の構成と担当が保存したものと一致する', () => {
    const { state: a, draft } = savedInProjectA();
    // 別の案件（決済の改修）を、まっさらな AI Worker で始める。棚（会社の資産）だけを持ち越す
    const b0 = apply({ ...createInitialState('lib-b'), library: a.library }, [
      { type: 'StartProject', projectId: 'paymentFix' },
    ]).state;
    expect(harnessOf(b0, AGENT).parts).toEqual([]);
    const target = { projectId: 'paymentFix', taskId: 'fix', workerId: AGENT };
    const { state: b, events } = apply(b0, [{ type: 'ApplyLibraryWorkflow', workflowId: 'custom1', ...target }]);

    expect(sorted(workflowFromWorker(b, AGENT, 'aiThenEval', draft.name))).toEqual(sorted(draft));
    expect(harnessOf(b, AGENT).modelId).toBe('frontier');
    expect(getSession(b, AGENT).feed.mode).toBe('router');
    expect(b.projects.paymentFix?.tasks.fix?.assignment).toEqual({ mode: 'aiThenEval', workerId: AGENT });
    expect(events[0]).toMatchObject({ type: 'LibraryWorkflowApplied', workflowId: 'custom1', skipped: [] });
    // 初めての部品は導入コストを払う（会社の資産になる）
    expect([...b.ownedParts].sort()).toEqual([...draft.parts, 'contextRouter'].sort());
  });

  it('適用すると、Workflow にない部品は外し、ある部品だけを付ける', () => {
    const { state: a } = savedInProjectA();
    const b = apply(a, [
      { type: 'StartProject', projectId: 'paymentFix' },
      {
        type: 'ApplyLibraryWorkflow',
        workflowId: 'presetPrReview',
        projectId: 'paymentFix',
        taskId: 'fix',
        workerId: AGENT,
      },
    ]).state;
    const preset = libraryPresets.find((w) => w.id === 'presetPrReview');
    expect([...harnessOf(b, AGENT).parts].sort()).toEqual([...(preset?.parts ?? [])].sort());
    expect(getSession(b, AGENT).feed.mode).toBe('needed');
  });

  it('始まっている Task・存在しない Workflow・未解放のモードには適用できない', () => {
    const base = apply(createInitialState('lib-c'), [{ type: 'StartProject', projectId: 'paymentFix' }]).state;
    const cmd: Command = {
      type: 'ApplyLibraryWorkflow',
      workflowId: 'presetPrReview',
      projectId: 'paymentFix',
      taskId: 'fix',
      workerId: AGENT,
    };
    expect(reduce(base, { ...cmd, workflowId: 'nope' }).state).toBe(base);
    expect(reduce(base, { ...cmd, workerId: 'suzuki' }).state).toBe(base);
    const noReview = { ...base, unlocked: allFeatures.filter((f) => f !== 'mode:aiThenHumanReview') };
    expect(reduce(noReview, cmd).state).toBe(noReview);
    const noHarness = { ...base, unlocked: allFeatures.filter((f) => f !== 'harness') };
    expect(reduce(noHarness, cmd).state).toBe(noHarness);
  });

  it('まだ解放されていない部品は付けずに知らせる（読み込み時の警告と同じ判定）', () => {
    const base = apply(createInitialState('lib-d'), [{ type: 'StartProject', projectId: 'paymentFix' }]).state;
    const state = { ...base, unlocked: allFeatures.filter((f) => f !== 'harness:subagent') };
    const preset = libraryPresets.find((w) => w.id === 'presetPrReview');
    if (!preset) throw new Error('PR Review のプリセットがない');
    expect(lockedFeatures(state, preset)).toEqual({ parts: ['subReview'], mode: false });
    const { state: after, events } = apply(state, [
      { type: 'ApplyLibraryWorkflow', workflowId: preset.id, projectId: 'paymentFix', taskId: 'fix', workerId: AGENT },
    ]);
    expect(events[0]).toMatchObject({ type: 'LibraryWorkflowApplied', skipped: ['subReview'] });
    expect(harnessOf(after, AGENT).parts).not.toContain('subReview');
    expect(harnessOf(after, AGENT).parts).toContain('skillPrReview');
  });

  it('使った回数と、削減した人間時間の累計を数える（会社の資産としての実績）', () => {
    const start = apply(createInitialState('lib-e'), [{ type: 'StartProject', projectId: 'paymentFix' }]).state;
    const taskIds = getProject('paymentFix').tasks.map((t) => t.id);
    const commands = taskIds.map((taskId) => ({
      at: 0,
      command: {
        type: 'ApplyLibraryWorkflow',
        workflowId: 'presetPrReview',
        projectId: 'paymentFix',
        taskId,
        workerId: AGENT,
      } as Command,
    }));
    const { state } = runHeadless({ seed: 'lib-e', initial: start, commands, until: 60 * 24 * 10 });
    const stats = workflowStats(state, 'presetPrReview');
    expect(stats.uses).toBe(taskIds.length);
    expect(state.projects.paymentFix?.completedAt).not.toBeNull();
    expect(stats.savedHumanMinutes).toBeGreaterThan(0);
    expect(workflowStats(state, 'presetFrontend')).toEqual({ uses: 0, savedHumanMinutes: 0 });
  });

  it('不正な下書きは保存しない', () => {
    const state = createInitialState('lib-f');
    const ok: WorkflowDraft = { name: 'x', mode: 'ai', modelId: 'lite', context: 'needed', parts: [] };
    const bad: WorkflowDraft[] = [
      { ...ok, name: '   ' },
      { ...ok, mode: 'human' },
      { ...ok, modelId: 'gpt-x' },
      { ...ok, parts: ['nope'] },
      { ...ok, parts: ['toolGit', 'toolGit'] },
      { ...ok, parts: ['hookFormatter', 'requestFormatter'] },
    ];
    for (const workflow of bad) expect(reduce(state, { type: 'SaveLibraryWorkflow', workflow }).state).toBe(state);
    expect(reduce(state, { type: 'SaveLibraryWorkflow', workflow: ok }).state.library).toHaveLength(1);
  });

  it('保存した棚はセーブデータに残り、以前のセーブは空の棚で読める', () => {
    const { state } = savedInProjectA();
    expect(deserialize(serialize(state)).library).toEqual(state.library);
    const { library: _l, libraryUses: _u, ...v8 } = createInitialState('old');
    const old = deserialize(JSON.stringify({ saveVersion: 8, state: v8 }));
    expect(old.library).toEqual([]);
    expect(old.libraryUses).toEqual([]);
  });
});

describe('Workflow の共有コード', () => {
  it('書き出して読み込むと元の Workflow に戻る（プリセットと、日本語の名前）', () => {
    for (const w of libraryPresets) {
      const { id: _id, ...draft } = w;
      expect(decodeWorkflowCode(encodeWorkflowCode(draft))).toEqual({ ok: true, workflow: draft });
    }
    const { draft } = savedInProjectA();
    const code = encodeWorkflowCode(draft);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{1,4}(-[0-9A-HJKMNP-TV-Z]{1,4})*$/);
    expect(decodeWorkflowCode(code)).toEqual({ ok: true, workflow: draft });
    // 区切り・空白・小文字は無視する
    expect(decodeWorkflowCode(` ${code.toLowerCase().replace(/-/g, ' ')} `)).toEqual({ ok: true, workflow: draft });
  });

  it('読み込んだ Workflow を保存すると、書き出した側と同じ構成になる', () => {
    const { draft } = savedInProjectA();
    const read = decodeWorkflowCode(encodeWorkflowCode(draft));
    if (!read.ok) throw new Error('読めない');
    const other = reduce(createInitialState('other-team'), { type: 'SaveLibraryWorkflow', workflow: read.workflow });
    expect(other.state.library[0]).toEqual({ id: 'custom1', ...draft });
  });

  it('不正なコードを拒否する', () => {
    const { draft } = savedInProjectA();
    const code = encodeWorkflowCode(draft);
    expect(decodeWorkflowCode('')).toEqual({ ok: false, error: 'format' });
    expect(decodeWorkflowCode('HELLO-WORLD!')).toEqual({ ok: false, error: 'format' });
    // 1文字の写し間違い
    const typo = code.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    expect(decodeWorkflowCode(typo)).toEqual({ ok: false, error: 'checksum' });
    // 別の形式のバージョン・結果コード
    expect(decodeWorkflowCode(encodeWorkflowCode(draft, 99))).toEqual({ ok: false, error: 'version' });
    const result = encodeResultCode({
      seed: 's',
      projectId: 'corporateSite',
      profit: 0,
      profitPerPersonDay: 0,
      humanMinutes: 0,
      aiCost: 0,
      quality: 1,
      elapsedMinutes: 0,
      rank: 'B',
    });
    expect(decodeWorkflowCode(result)).toEqual({ ok: false, error: 'format' });
    // 形は正しいが、このビルドにない部品・モード・同じ group の部品の重複
    for (const bad of [
      { ...draft, parts: ['toolTeleport'] },
      { ...draft, mode: 'human' as const },
      { ...draft, modelId: 'gpt-x' },
      { ...draft, parts: ['hookUnitTest', 'requestUnitTest'] },
    ]) {
      expect(decodeWorkflowCode(encodeWorkflowCode(bad))).toEqual({ ok: false, error: 'invalid' });
    }
    // 資料の渡し方の値が範囲外・末尾に余計なバイト
    const forged = (contextByte: number, extra: number[] = []) => {
      const w = new ByteWriter().byte('W'.charCodeAt(0)).byte(1).text('x').text('ai').text('lite').byte(contextByte);
      w.uint(0);
      for (const b of extra) w.byte(b);
      return sealCode(w.bytes);
    };
    expect(decodeWorkflowCode(forged(0))).toMatchObject({ ok: true });
    expect(decodeWorkflowCode(forged(7))).toEqual({ ok: false, error: 'invalid' });
    expect(decodeWorkflowCode(forged(0, [1]))).toEqual({ ok: false, error: 'format' });
  });
});
