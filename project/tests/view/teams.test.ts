import { describe, expect, it } from 'vitest';
import { worldLooks } from '../../src/content/look/world';
import { type Command, reduce } from '../../src/core/commands';
import { generatedProjectId } from '../../src/core/projectGen';
import { createInitialState, type GameState } from '../../src/core/state';
import { talentId } from '../../src/core/talent';
import { ja } from '../../src/i18n/ja';
import { projectTabs } from '../../src/view/board';
import { projectAgent } from '../../src/view/project';
import { projectTeamBadge, promotionNotes, teamsView } from '../../src/view/teams';
import { worldView } from '../../src/view/world';

const P = generatedProjectId('teams-view', 'S');
const Q = generatedProjectId('teams-view-2', 'S');
const W = [0, 1, 2].map((i) => talentId(`tv:${i}`, true));

const run = (s: GameState, ...cs: Command[]) => cs.reduce((acc, c) => reduce(acc, c).state, s);

function organized(): GameState {
  const s = createInitialState('tv', { team: W, tier: 'small', board: true, tutorial: false });
  return run(
    { ...s, projects: {} },
    { type: 'CreateTeam' },
    { type: 'AddAiWorker' },
    { type: 'MoveMember', workerId: W[2] ?? '', teamId: 't~2' },
    { type: 'MoveMember', workerId: 'ai~2', teamId: 't~2' },
  );
}

describe('チームの一覧と編成（view/teams.ts）', () => {
  it('会社の規模と次の規模の条件、直轄と作ったチームのカード、作れるかどうかを出す', () => {
    const solo = teamsView(createInitialState('solo', { board: true, tutorial: false }));
    expect(solo.company.tier).toBe(ja.company.tiers.solo);
    expect(solo.company.next?.name).toBe(ja.company.tiers.startup);
    expect(solo.company.next?.items.map((i) => i.id)).toEqual(['profit', 'reputation', 'delivered']);
    expect(solo.createTeam).toBeNull();
    expect(solo.createBlocked).toBe(ja.teams.createBlocked.locked);
    expect(solo.teams.map((t) => t.name)).toEqual([ja.teams.direct]);

    const v = teamsView(organized());
    expect(v.teams.map((t) => t.name)).toEqual([ja.teams.direct, ja.teams.name(2)]);
    const second = v.teams[1];
    expect(second?.members.map((m) => m.id)).toEqual([W[2], 'ai~2']);
    // 社員は PM に任命でき、AI PM にも任せられる
    expect(second?.members[0]?.appoint).toEqual({
      type: 'SetManager',
      teamId: 't~2',
      manager: { kind: 'human', staffId: W[2] },
    });
    expect(second?.setAiPm).toEqual({ type: 'SetManager', teamId: 't~2', manager: { kind: 'ai' } });
    expect(second?.intervene).toBeNull();
  });

  it('委任したチームのカードは管理者・介入のボタンを出し、案件のタブとワールドはチームでまとめる', () => {
    let s = organized();
    s = run(s, { type: 'SetManager', teamId: 't~2', manager: { kind: 'ai' } });
    // 単発で案件を始めて（コンペを通さずに）、2件目を第2チームに割り当てる
    s = run({ ...s, board: null }, { type: 'StartProject', projectId: P }, { type: 'StartProject', projectId: Q });
    s = run(s, { type: 'MoveProject', projectId: Q, teamId: 't~2' });
    const card = teamsView(s).teams[1];
    expect(card?.delegated).toBe(true);
    expect(card?.managerName).toBe(ja.teams.aiPm);
    expect(card?.intervene).toEqual({ type: 'Intervene', teamId: 't~2', on: true });
    expect(card?.projects.map((p) => p.projectId)).toEqual([Q]);
    // タブとワールドの札
    expect(projectTeamBadge(s, Q)).toBe(ja.teams.worldBadge(ja.teams.name(2), ja.teams.aiPm));
    expect(projectTeamBadge(s, P)).toBe(ja.teams.worldBadge(ja.teams.direct, ja.teams.direction));
    expect(projectTabs(s, P).tabs.map((t) => t.team)).toEqual([projectTeamBadge(s, P), projectTeamBadge(s, Q)]);
    // ワールドには表示中の案件のチームの社員だけを出す
    const humans = (id: string) =>
      worldView(s, id, worldLooks.standard).actors.filter((a) => a.kind === 'human').length;
    expect(humans(P)).toBe(2);
    expect(humans(Q)).toBe(1);
    // 案件のチームの AI Worker が、担当・Harness・Context の画面の AI Worker になる
    expect(projectAgent(s, Q)).toBe('ai~2');
    expect(projectAgent(s, P)).toBe('agent');
  });

  it('昇格の案内は、新しく解放された要素だけを並べる', () => {
    const s = createInitialState('notes', { tier: 'small', board: true, tutorial: false });
    const notes = promotionNotes(s, 'startup');
    expect(notes).toContain(ja.company.unlockedManagers);
    expect(notes).toContain(ja.company.unlockedTeams(2));
    expect(notes.some((n) => n.includes('L'))).toBe(true);
  });
});
