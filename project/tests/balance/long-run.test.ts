import { beforeAll, describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import { type Command, reduce } from '../../src/core/commands';
import { generatedProjectId } from '../../src/core/projectGen';
import { scoreProject } from '../../src/core/scoring';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { talentId } from '../../src/core/talent';
import { clumsy, type LongRunResult, type LongStrategy, reckless, runLong, skilled } from '../helpers/longRun';

/**
 * 長く遊ぶ設計意図（Phase 22）。自動戦略でチュートリアルなしの会社を3年分（720営業日）ヘッドレスで経営し、次を確かめる。
 * - 上手な戦略は規模が昇格し続け（大手の後も格付けが上がる）、下手な戦略は伸び悩む（ただし1年のうちには倒産しない）
 * - 利益 / 人日 は後半ほど AI の活用で伸びる：後半は大きい案件が増え、大きい案件ほど AI と Harness の効果が大きい
 * - 1つの戦略（モード・構成・見積の方針・PM の種類）が常に最適にはならない
 * - 長時間回しても、1ステップの処理時間と state の大きさが上限に収まる
 */

const YEAR = 240;
const YEARS = 3;
const SEED = 'long-a';
const DAY = balance.time.minutesPerDay;
/** 1ステップ（tickMinutes 分）の処理時間の上限（ms）。60fps の1フレームの 1/10 */
const TICK_BUDGET_MS = 1.6;
/** state の大きさ（JSON の文字数）の上限 */
const STATE_BUDGET = 300_000;

const man = (n: number) => `${Math.round(n / 10_000).toLocaleString('ja-JP')}万`;

/** 方針を1つずつ変えた戦略（上手な戦略が基準） */
const variants: readonly LongStrategy[] = [
  skilled,
  { ...skilled, name: 'AI PM に任せる', manager: 'ai' },
  { ...skilled, name: 'Harness に投資しない', harness: false },
  { ...skilled, name: '安めの見積（−10%）', price: 'minus10' },
  { ...skilled, name: '高めの見積（+10%）', price: 'plus10' },
];

const runs = new Map<string, LongRunResult>();
const run = (s: LongStrategy) => {
  const r = runs.get(s.name);
  if (!r) throw new Error(`未実行の戦略: ${s.name}`);
  return r;
};

beforeAll(() => {
  for (const s of [...variants, clumsy]) runs.set(s.name, runLong(s, SEED, YEAR * YEARS));
  // 無理な受注は1年で十分（倒産するかどうかだけを見る）
  runs.set(reckless.name, runLong(reckless, SEED, YEAR));
  const lines = [...variants, clumsy].map((s) => {
    const r = run(s);
    const byYear = Array.from({ length: YEARS }, (_, y) => {
      const qs = r.quarters.slice(y * 4, y * 4 + 4);
      const profit = qs.reduce((sum, q) => sum + q.report.profit, 0);
      const minutes = qs.reduce((sum, q) => sum + q.report.humanMinutes, 0);
      const ppd = minutes > 0 ? profit / (minutes / DAY) : 0;
      const end = qs.at(-1)?.tierName ?? '―';
      return `${y + 1}年目 ${end}・利益 ${man(profit)}・利益/人日 ${man(ppd)}`;
    });
    const promos = r.promotions.map((p) => `${p.day}日 ${p.name}`).join(' → ') || 'なし';
    return `  ${s.name}\n    昇格：${promos}${r.bankruptDay !== null ? `（${r.bankruptDay}日目に倒産）` : ''}\n    ${byYear.join('\n    ')}`;
  });
  console.log(`[長期] ${YEARS}年分（${YEAR * YEARS}営業日）・seed ${SEED}\n${lines.join('\n')}`);
}, 600_000);

describe('長く遊ぶ（数年分の自動戦略）', () => {
  it('上手な戦略は毎年昇格し続け、大手の後も格付けが上がる。下手な戦略は伸び悩むが、1年のうちには倒産しない', () => {
    const good = run(skilled);
    const bad = run(clumsy);
    const promotionYears = new Set(good.promotions.map((p) => Math.floor(p.day / YEAR)));
    expect([...promotionYears].sort()).toEqual(Array.from({ length: YEARS }, (_, y) => y));
    expect(good.state.tier).toBe('large');
    expect(good.state.rank).toBeGreaterThanOrEqual(1);
    expect(good.bankruptDay).toBeNull();
    // 下手な戦略：小規模に届かず、後半の利益は上手な戦略に遠く及ばない。倒産するとしても1年より後
    expect(['solo', 'startup']).toContain(bad.state.tier);
    expect(bad.bankruptDay === null || bad.bankruptDay > YEAR).toBe(true);
    const lastYear = (r: LongRunResult) => r.quarters.slice(-4).reduce((sum, q) => sum + q.report.profit, 0);
    expect(lastYear(bad)).toBeLessThan(lastYear(good) / 10);
    // 無理な受注（人手を見ずに、すべてに高めの見積を出し続ける）は、1年のうちに倒産する
    // （序盤は失敗しても立て直せるが、放置や無理な受注を続けると倒産する。2026-10-28 のユーザー回答）
    const wild = run(reckless);
    expect(wild.bankruptDay).not.toBeNull();
    expect(wild.bankruptDay ?? Infinity).toBeLessThanOrEqual(YEAR);
  });

  it('後半ほど大きい案件が増え、大きい案件ほど AI と Harness で 利益 / 人日 が伸びる', () => {
    // 後半は規模 L・XL の案件の割合が増える
    const good = run(skilled);
    const share = (y: number) => {
      const qs = good.quarters.slice(y * 4, y * 4 + 4);
      return qs.reduce((sum, q) => sum + q.bigShare, 0) / Math.max(1, qs.length);
    };
    const shares = Array.from({ length: YEARS }, (_, y) => share(y));
    // 規模ごとに、同じ社員4人のチームで人間だけ・AI 適性の高い仕事を AI（Harness なし）・AI＋Harness で納品まで進めて比べる
    const sizes = ['S', 'M', 'L', 'XL'] as const;
    const uplift = sizes.map((size) => sizeUplift(size));
    console.log(
      `[長期] 規模 L・XL の案件の割合：${shares.map((s, y) => `${y + 1}年目 ${(s * 100).toFixed(0)}%`).join(' / ')}\n` +
        `[長期] 規模ごとの 利益 / 人日（${SIZE_SAMPLES}件の平均）\n` +
        uplift
          .map(
            (u, i) =>
              `  ${sizes[i]}：人間だけ ${man(u.human)} / AI ${man(u.ai)} / AI＋Harness ${man(u.harness)}` +
              `（人間だけの ${(u.harness / u.human).toFixed(2)}倍）`,
          )
          .join('\n'),
    );
    expect(shares[YEARS - 1] ?? 0).toBeGreaterThan(shares[0] ?? 0);
    const ratios = uplift.map((u) => u.harness / u.human);
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]).toBeGreaterThan(ratios[i - 1] ?? 0);
    for (const u of uplift) expect(u.harness).toBeGreaterThan(u.ai);
  });

  it('1つの戦略（モード・構成・見積の方針・PM の種類）が常に最適にはならない', () => {
    const quarters = run(skilled).quarters.length;
    const bestOf = (metric: (r: LongRunResult, q: number) => number) =>
      Array.from({ length: quarters }, (_, q) => {
        let best = variants[0];
        for (const v of variants) if (best && metric(run(v), q) > metric(run(best), q)) best = v;
        return best?.name ?? '';
      });
    const byPpd = bestOf((r, q) => r.quarters[q]?.report.profitPerPersonDay ?? Number.NEGATIVE_INFINITY);
    const byProfit = bestOf((r, q) => r.quarters[q]?.report.profit ?? Number.NEGATIVE_INFINITY);
    const fastest = [...variants].sort(
      (a, b) => (run(a).promotions[3]?.day ?? Infinity) - (run(b).promotions[3]?.day ?? Infinity),
    )[0];
    console.log(
      '[長期] 期ごとの最良の戦略\n' +
        `  利益 / 人日：${byPpd.map((n, q) => `Q${q + 1} ${n}`).join(' / ')}\n` +
        `  利益：${byProfit.map((n, q) => `Q${q + 1} ${n}`).join(' / ')}\n` +
        `  大手に最も早く届いた：${fastest?.name}（${run(fastest ?? skilled).promotions[3]?.day}日）`,
    );
    // 期によって最良の戦略が入れ替わる（利益 / 人日 と利益のどちらでも、1つの戦略がすべての期で最良にはならない）
    expect(new Set(byPpd).size).toBeGreaterThan(1);
    expect(new Set(byProfit).size).toBeGreaterThan(1);
    // 利益 / 人日 で最も多くの期に最良だった戦略と、最も早く大手に届いた戦略は違う（効率と成長の両取りはできない）
    const mostPpd = mode(byPpd);
    expect(mostPpd).not.toBe(fastest?.name);
  });

  it('長時間回しても、1ステップの処理時間と state の大きさが上限に収まる', () => {
    const rows = [...variants, clumsy].map((s) => {
      const r = run(s);
      return { name: s.name, tick: r.tickMs, sizes: r.stateSizes, final: JSON.stringify(r.state).length };
    });
    console.log(
      `[長期] 性能（上限：1ステップ ${TICK_BUDGET_MS}ms・state ${STATE_BUDGET.toLocaleString('ja-JP')} 文字）\n` +
        rows
          .map(
            (r) =>
              `  ${r.name}：1ステップ 平均 ${r.tick.mean.toFixed(3)}ms・最大 ${r.tick.max.toFixed(3)}ms` +
              ` / state 決算ごと ${r.sizes.map((n) => `${Math.round(n / 1000)}K`).join(' ')}・最後 ${Math.round(r.final / 1000)}K 文字`,
          )
          .join('\n'),
    );
    for (const r of rows) {
      expect(r.tick.max, r.name).toBeLessThan(TICK_BUDGET_MS);
      expect(Math.max(r.final, ...r.sizes), r.name).toBeLessThan(STATE_BUDGET);
    }
    // 納品した案件の数は増え続けるが、state は増え続けない（3年目の大きさは1年目の最大の2倍まで）
    const good = rows[0];
    if (!good) throw new Error('戦略がない');
    const firstYear = Math.max(...good.sizes.slice(0, 4));
    expect(Math.max(...good.sizes.slice(-4))).toBeLessThan(firstYear * 2);
  });
});

function mode(items: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

/** 規模ごとに平均する案件の数 */
const SIZE_SAMPLES = 6;
/** tests/helpers/longRun.ts の上手な戦略と同じ Harness */
const FITTED = [
  'skillFrontend',
  'skillReport',
  'skillPrReview',
  'hookFormatter',
  'hookUnitTest',
  'evalUnitTest',
  'evalAcceptance',
  'mcpFilesystem',
  'mcpGit',
  'mdOverview',
  'permAcceptEdits',
];
const SMART_APTITUDE = 0.6;

/** 規模ごとの 利益 / 人日 の平均（人間だけ・AI・AI＋Harness） */
function sizeUplift(size: 'S' | 'M' | 'L' | 'XL') {
  const sum = { human: 0, ai: 0, harness: 0 };
  for (let i = 0; i < SIZE_SAMPLES; i++) {
    const projectId = generatedProjectId(`size:${i}`, size);
    for (const kind of ['human', 'ai', 'harness'] as const)
      sum[kind] += playSized(projectId, kind, `size-${i}`) / SIZE_SAMPLES;
  }
  return sum;
}

function playSized(projectId: string, kind: 'human' | 'ai' | 'harness', seed: string): number {
  const staff = Array.from({ length: 4 }, (_, i) => talentId(`${seed}:w${i}`, true));
  let s: GameState = createInitialState(seed, { team: staff, tier: 'large' });
  const apply = (c: Command) => {
    s = reduce(s, c).state;
  };
  apply({ type: 'StartProject', projectId });
  if (kind === 'harness') {
    for (const partId of FITTED) apply({ type: 'EquipPart', workerId: 'agent', partId });
    apply({ type: 'SetContextFeed', workerId: 'agent', feed: { mode: 'needed' } });
  }
  getProject(projectId).tasks.forEach((t, i) => {
    const ai = kind !== 'human' && t.aiAptitude >= SMART_APTITUDE;
    const workerId = ai ? 'agent' : (staff[i % staff.length] ?? '');
    apply({ type: 'AssignTask', projectId, taskId: t.id, mode: ai ? 'aiThenHumanReview' : 'human', workerId });
  });
  for (let d = 0; d < 80 && s.projects[projectId]?.completedAt === null; d++) s = step(s, DAY).state;
  const score = scoreProject(s, projectId);
  if (!score?.completed) throw new Error(`納品できていない: ${projectId} ${kind}`);
  return score.profitPerPersonDay;
}
