import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import type { PriceStep } from '../../src/core/bidding';
import { activeProjects, openInquiries } from '../../src/core/board';
import { type Command, reduce } from '../../src/core/commands';
import { scoreCompany } from '../../src/core/scoring';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { teamMembers } from '../../src/core/team';
import { seeds } from '../helpers/compare';
import { equipCommands } from '../helpers/fitted';

/**
 * コンペの設計意図：「常に最安値」も「常に高値」も最適にならない。
 * チュートリアルなしで始めた会社（創業メンバー2人と AI Worker）で、届いた引き合いすべてに同じ価格の見積を出し続け、
 * 受注した案件は smart の担当（AI 適性の高い Task は AI → 人間レビュー、残りは手の空いている人）で進める。
 * 素の AI は割に合わない（tests/balance/bare-ai.test.ts）ので、AI Worker には標準的な Harness を付けておく。
 * 安すぎると利幅が薄く、取りすぎた案件が遅れて評判が下がる。高すぎると受注できず、待機中の給与だけがかかる。
 * 会社の Profit / Person-Day を seed で平均した期待値で比べる。
 */
const DAYS = 20;
const CHUNK = 30;
const SEEDS = seeds(8, 'bidding');
const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

function assignAll(state: GameState): GameState {
  let s = state;
  const humans = teamMembers(s).map((h) => h.id);
  let turn = 0;
  for (const projectId of activeProjects(s)) {
    for (const t of getProject(projectId).tasks) {
      if (s.projects[projectId]?.tasks[t.id]?.assignment !== null) continue;
      const ai = t.aiAptitude >= 0.6;
      const command: Command = {
        type: 'AssignTask',
        projectId,
        taskId: t.id,
        mode: ai ? 'aiThenHumanReview' : 'human',
        workerId: ai ? 'agent' : (humans[turn++ % humans.length] ?? ''),
      };
      s = reduce(s, command).state;
    }
  }
  return s;
}

function play(price: PriceStep, seed: string) {
  let s = createInitialState(seed, { board: true, tutorial: false });
  s = { ...s, unlocked: [...new Set([...s.unlocked, 'harness' as const])] };
  for (const c of equipCommands('agent')) s = reduce(s, c).state;
  s = reduce({ ...s, paused: true }, { type: 'TogglePause' }).state;
  let won = 0;
  let late = 0;
  while (s.clock < DAYS * balance.time.minutesPerDay) {
    // 見積の結果はその場で出る
    for (const projectId of openInquiries(s)) {
      const bid = reduce(s, { type: 'SubmitBid', projectId, price, deadline: 'standard' });
      s = bid.state;
      won += bid.events.filter((e) => e.type === 'BidWon').length;
    }
    s = assignAll(s);
    const r = step(s, CHUNK);
    s = r.state;
    late += r.events.filter((e) => e.type === 'ReputationChanged' && e.delta < 0).length;
  }
  const c = scoreCompany(s);
  return { ...c, won, late, reputation: s.reputation };
}

const STRATEGIES: readonly PriceStep[] = ['minus20', 'minus10', 'base', 'plus10', 'plus20'];

describe('コンペのバランス（常に最安値も常に高値も最適ではない）', () => {
  it('利益 / 人日 の期待値は、中間の価格の方が、最安値（−20%）と最高値（+20%）の両方より高い', () => {
    const rows = STRATEGIES.map((price) => {
      const runs = SEEDS.map((seed) => play(price, seed));
      const avg = (f: (r: (typeof runs)[number]) => number) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
      return {
        price,
        ppd: avg((r) => r.profitPerPersonDay),
        profit: avg((r) => r.profit),
        won: avg((r) => r.won),
        late: avg((r) => r.late),
        idle: avg((r) => r.idleCost),
        reputation: avg((r) => r.reputation),
      };
    });
    console.log(
      `[コンペ] ${DAYS}営業日・${SEEDS.length} seed の平均\n` +
        rows
          .map(
            (r) =>
              `  ${r.price}：Profit/Person-Day ${fmt(r.ppd)} 円/人日・利益 ${fmt(r.profit)} 円・受注 ${r.won.toFixed(1)} 件` +
              `・評判が下がった納品 ${r.late.toFixed(1)} 件・待機中の給与 ${fmt(r.idle)} 円・評判 ${r.reputation.toFixed(0)}`,
          )
          .join('\n'),
    );
    const cheapest = rows[0];
    const dearest = rows.at(-1);
    const best = rows.reduce((a, b) => (b.ppd > a.ppd ? b : a));
    expect(best.price).not.toBe('minus20');
    expect(best.price).not.toBe('plus20');
    expect(best.ppd).toBeGreaterThan(cheapest?.ppd ?? 0);
    expect(best.ppd).toBeGreaterThan(dearest?.ppd ?? 0);
    // 安いほど多く受注する（高すぎると受注できない）
    expect(cheapest?.won ?? 0).toBeGreaterThan(dearest?.won ?? 0);
  });
});
