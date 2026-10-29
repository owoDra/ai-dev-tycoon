import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import { activeProjects, openInquiries, postInquiries } from '../../src/core/board';
import { type Command, reduce } from '../../src/core/commands';
import { scoreCompany } from '../../src/core/scoring';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { teamMembers } from '../../src/core/team';
import { seeds } from '../helpers/compare';
import { equipCommands } from '../helpers/fitted';
import { topUpSeats } from '../helpers/seats';

/**
 * 受注の設計意図（Phase 35）：受注しすぎも、受けなさすぎも最適にならない。人手を見て受けるのが良い。
 * チュートリアルなしで始めた会社（創業メンバー2人と AI Worker）で、受注の方針だけを変えて比べる。
 * 受注した案件は smart の担当（AI 適性の高い Task は AI → 人間レビュー、残りは掛け持ちの少ない人）で進める。
 * 素の AI は割に合わない（tests/balance/bare-ai.test.ts）ので、AI Worker には標準的な Harness を付けておく。
 * - 上限まで何でも受ける：掛け持ちで1件ずつが遅くなり（balance.human.switchLoss）、期限を外して打ち切り・炎上が増え、評判も下がる
 * - 1件ずつしか受けない：期限は守れるが、人手が余る
 * 会社の Profit / Person-Day を seed で平均した期待値で比べる。
 */
const DAYS = 30;
const CHUNK = 30;
const SEEDS = seeds(8, 'orders');
const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

/** 担当の決まっていない Task を smart で決める（人間は掛け持ちの少ない人） */
function assignAll(state: GameState): GameState {
  let s = state;
  for (const projectId of activeProjects(s)) {
    for (const t of getProject(projectId).tasks) {
      if (s.projects[projectId]?.tasks[t.id]?.assignment !== null) continue;
      const ai = t.aiAptitude >= 0.6;
      const load = (id: string) => s.humanQueues[id]?.length ?? 0;
      const human = [...teamMembers(s).map((h) => h.id)].sort((a, b) => load(a) - load(b))[0] ?? '';
      const command: Command = {
        type: 'AssignTask',
        projectId,
        taskId: t.id,
        mode: ai ? 'aiThenHumanReview' : 'human',
        workerId: ai ? 'agent' : human,
      };
      s = reduce(s, command).state;
    }
  }
  return s;
}

const accept = (s: GameState, projectId: string) => reduce(s, { type: 'AcceptOrder', projectId }).state;

type Policy = (state: GameState) => GameState;
const POLICIES: readonly { readonly name: string; readonly policy: Policy }[] = [
  {
    name: '上限まで何でも受ける',
    policy: (state) => openInquiries(state).reduce(accept, state),
  },
  {
    name: '人手を見て受ける（手の空いた人がいて、案件が人数より少ないときに1件）',
    policy: (s) => {
      const id = openInquiries(s)[0];
      const idle = teamMembers(s).some((h) => (s.humanQueues[h.id]?.length ?? 0) === 0);
      return id && idle && activeProjects(s).length < teamMembers(s).length ? accept(s, id) : s;
    },
  },
  {
    name: '1件ずつしか受けない',
    policy: (s) => {
      const id = openInquiries(s)[0];
      return id && activeProjects(s).length === 0 ? accept(s, id) : s;
    },
  },
];

function play(policy: Policy, seed: string) {
  let s = createInitialState(seed, { board: true, tutorial: false });
  for (const c of equipCommands('agent')) s = reduce(s, c).state;
  s = postInquiries(s, () => {});
  let accepted = 0;
  let missed = 0;
  while (s.clock < DAYS * balance.time.minutesPerDay) {
    const before = Object.keys(s.projects).length;
    s = policy(s);
    accepted += Object.keys(s.projects).length - before;
    s = assignAll(s);
    s = topUpSeats(s);
    const r = step(s, CHUNK);
    s = r.state;
    missed += r.events.filter((e) => e.type === 'ProjectBurning' || e.type === 'ProjectCancelled').length;
  }
  const c = scoreCompany(s);
  return { ...c, accepted, missed, reputation: s.reputation };
}

describe('受注のバランス（受注しすぎも受けなさすぎも最適ではない）', () => {
  it('利益 / 人日 の期待値は、人手を見て受ける方が、上限まで何でも受けるより、1件ずつしか受けないより高い', () => {
    const rows = POLICIES.map(({ name, policy }) => {
      const runs = SEEDS.map((seed) => play(policy, seed));
      const avg = (f: (r: (typeof runs)[number]) => number) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
      return {
        name,
        ppd: avg((r) => r.profitPerPersonDay),
        profit: avg((r) => r.profit),
        accepted: avg((r) => r.accepted),
        delivered: avg((r) => r.delivered),
        missed: avg((r) => r.missed),
        reputation: avg((r) => r.reputation),
      };
    });
    console.log(
      `[受注] ${DAYS}営業日・${SEEDS.length} seed の平均\n` +
        rows
          .map(
            (r) =>
              `  ${r.name}：Profit/Person-Day ${fmt(r.ppd)} 円/人日・利益 ${fmt(r.profit)} 円・受注 ${r.accepted.toFixed(1)} 件` +
              `・納品 ${r.delivered.toFixed(1)} 件・期限切れ ${r.missed.toFixed(1)} 件・評判 ${r.reputation.toFixed(0)}`,
          )
          .join('\n'),
    );
    const [greedy, aware, single] = rows;
    if (!greedy || !aware || !single) throw new Error('方針が足りない');
    expect(aware.ppd).toBeGreaterThan(greedy.ppd);
    expect(aware.ppd).toBeGreaterThan(single.ppd);
    // 何でも受けると期限を外しやすく、1件ずつだと受注が少ない
    expect(greedy.missed).toBeGreaterThan(aware.missed);
    expect(greedy.reputation).toBeLessThan(aware.reputation);
    expect(single.accepted).toBeLessThan(aware.accepted);
  });
});
