import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import { battleProjectId, battleWord, createBattle } from '../../src/core/battle';
import { readBring } from '../../src/core/bring';
import { type Command, reduce } from '../../src/core/commands';
import { deadlineMinutes } from '../../src/core/formulas';
import { decodeResultCode, encodeResultCode } from '../../src/core/resultCode';
import { scoreProject } from '../../src/core/scoring';
import { deserialize, serialize } from '../../src/core/serialize';
import { isUnlocked } from '../../src/core/unlocks';
import { resultRecord } from '../../src/view/result';
import { readFixture } from '../helpers/bring';
import { runHeadless } from '../helpers/headless';

const AGENT = 'agent';
const cards = readBring(readFixture()).cards;
const ids = cards.map((c) => c.id);

/** バトルを始め、すべての Task を AI に任せ、持ち込みカードを付けて納期の4倍まで進める */
function playBattle(word: string, parts: readonly string[]) {
  const initial = createBattle(word, ids);
  const projectId = battleProjectId(word);
  const commands: Command[] = [
    ...getProject(projectId).tasks.map(
      (t): Command => ({ type: 'AssignTask', projectId, taskId: t.id, mode: 'aiThenHumanReview', workerId: AGENT }),
    ),
    ...parts.map((partId): Command => ({ type: 'EquipPart', workerId: AGENT, partId })),
  ];
  const result = runHeadless({
    seed: initial.seed,
    initial,
    commands: commands.map((command) => ({ at: 0, command })),
    until: deadlineMinutes(getProject(projectId)) * 4,
  });
  return { ...result, projectId };
}

describe('持ち寄りバトル（core/battle.ts）', () => {
  it('合言葉をそろえ、同じ合言葉なら同じ社員・同じ案件で始まる', () => {
    expect(battleWord('  party 2026 ')).toBe('PARTY-2026');
    expect(battleWord('飲み会')).toBeNull();
    const a = createBattle('PARTY-2026', ids);
    const b = createBattle('PARTY-2026', []);
    expect(Object.keys(a.projects)).toEqual([battleProjectId('PARTY-2026')]);
    expect(a.team).toEqual(b.team);
    expect(a.board).toBeNull();
    expect(createBattle('OTHER', ids).projects).not.toEqual(a.projects);
  });

  it('すべての機能を解放して始まり、持ち込みカードを Harness Builder で選べる', () => {
    const s = createBattle('PARTY-2026', ids);
    expect(isUnlocked(s, 'harness')).toBe(true);
    expect(isUnlocked(s, 'harness:tool')).toBe(true);
    expect(s.brought).toEqual(ids);
  });

  it('持ち込みカードを付けた AI が、ゲーム内で作業して案件を納品できる', () => {
    const parts = [ids[0], ids[5], ids[8]].filter((x): x is string => x !== undefined);
    const { state, projectId, events } = playBattle('PARTY-2026', parts);
    expect(state.harnesses[AGENT]?.parts).toEqual(parts);
    expect(state.ownedParts).toEqual(expect.arrayContaining(parts));
    const run = state.projects[projectId];
    expect(run?.completedAt).not.toBeNull();
    expect(Object.values(run?.tasks ?? {}).every((t) => t.status === 'done')).toBe(true);
    expect(events.some((e) => e.type === 'TaskCompleted')).toBe(true);
    expect(scoreProject(state, projectId)?.aiCost).toBeGreaterThan(0);
  });

  it('持ち込みカードを使った結果コードを作り、読み戻せる（カテゴリと点だけで、中身は入らない）', () => {
    const parts = [ids[0], ids[5]].filter((x): x is string => x !== undefined);
    const { state, projectId } = playBattle('PARTY-2026', parts);
    const record = resultRecord(state, projectId);
    if (!record) throw new Error('結果がない');
    expect(record.brought).toEqual([
      { category: 'subagent', score: 100 },
      { category: 'skill', score: 100 },
    ]);
    const code = encodeResultCode(record);
    const back = decodeResultCode(code);
    if (!back.ok) throw new Error(back.error);
    expect(back.sameBuild).toBe(true);
    expect(back.record).toMatchObject({
      seed: record.seed,
      projectId: battleProjectId('PARTY-2026'),
      profit: Math.round(record.profit),
      brought: record.brought,
    });
  });

  it('同じ合言葉・同じ構成なら結果コードが一致し、違う構成なら変わる', () => {
    const code = (parts: readonly string[]) => {
      const { state, projectId } = playBattle('PARTY-2026', parts);
      return encodeResultCode(resultRecord(state, projectId) ?? (undefined as never));
    };
    const parts = [ids[5] ?? ''];
    expect(code(parts)).toBe(code(parts));
    expect(code(parts)).not.toBe(code([]));
  });

  it('持ち込みカードを選べる状態はセーブに残る', () => {
    const s = reduce(createBattle('PARTY-2026', ids), { type: 'SetBroughtParts', parts: [...ids, 'bogus'] }).state;
    expect(s.brought).toEqual(ids);
    expect(deserialize(serialize(s)).brought).toEqual(ids);
  });
});
