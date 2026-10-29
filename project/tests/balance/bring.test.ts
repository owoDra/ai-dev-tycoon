import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { bringCategories, bringTemplates } from '../../src/content/bring';
import { content, getProject } from '../../src/content/index';
import type { HarnessModifierKey, HarnessModifiers, HarnessPartDef, TaskKind } from '../../src/content/types';
import { bringPartId, broughtPart, maxScore } from '../../src/core/bring';
import { type Command, reduce } from '../../src/core/commands';
import { deadlineMinutes } from '../../src/core/formulas';
import { type ProjectScore, scoreProject } from '../../src/core/scoring';
import { createInitialState } from '../../src/core/state';
import { compare, seeds } from '../helpers/compare';
import { runHeadless } from '../helpers/headless';
import { strategies } from '../helpers/strategies';

/**
 * 持ち込みカード（Phase 42）の上限。持ち込んだ設定が強すぎてゲームが壊れないよう、満点のカードでも
 * 同じカテゴリの最も良い同梱の部品を大きく超えないことを、部品の補正とプレイの結果の両方で確かめる。
 */

/** 「大きく超えない」の目安：同梱の最も良い部品の 15% 増しまで */
const TOLERANCE = 1.15;
const ALL: readonly TaskKind[] = ['planning', 'research', 'design', 'content', 'code', 'test', 'release'];

/** 補正の良さ（大きいほど AI の仕事に有利）。Noise・人間の時間・費用・事故は小さいほど良い */
function gain(key: HarnessModifierKey, v: number): number {
  switch (key) {
    case 'speed':
      return v - 1;
    case 'humanTime':
    case 'aiCost':
      return 1 - v;
    case 'noise':
    case 'risk':
      return -v;
    default:
      return v;
  }
}

/** カテゴリの雛形になりうる部品の id（content/bring.ts の bringTemplates） */
function templatesOf(category: string): string[] {
  const t = bringTemplates;
  if (category === 'hook') return [...t.hook.byWord.map((w) => w.part), ...Object.values(t.hook.byTiming)];
  if (category === 'permission') return [t.permission.safe, t.permission.risky];
  return [t[category as 'skill' | 'subagent' | 'mcp' | 'claudeMd' | 'rules']];
}

/** 満点の持ち込みカードの部品 */
function fullCard(template: string, kinds: readonly TaskKind[], name = template): HarnessPartDef {
  const tpl = content.harnessParts.find((p) => p.id === template);
  if (!tpl) throw new Error(template);
  const id = bringPartId({
    template,
    timing: tpl.timing,
    score: maxScore(tpl.category),
    kinds,
    size: tpl.size ?? 0,
    hash: 'test',
    name,
  });
  const part = broughtPart(id);
  if (!part) throw new Error(id);
  return part;
}

describe('持ち込みカードの上限（content/balance.ts の bring）', () => {
  it('満点のカードでも、補正の各項目は同じカテゴリの最も良い同梱の部品を大きく超えない', () => {
    expect(balance.bring.maxStrength).toBeLessThanOrEqual(TOLERANCE);
    for (const category of bringCategories) {
      const bundled = content.harnessParts.filter((p) => p.category === category);
      for (const template of templatesOf(category)) {
        const card = fullCard(template, ALL);
        for (const [key, v] of Object.entries(card.modifiers) as [HarnessModifierKey, number][]) {
          const best = Math.max(0, ...bundled.map((p) => gain(key, p.modifiers[key] ?? NEUTRAL[key])));
          expect(gain(key, v), `${category}/${template}/${key}`).toBeLessThanOrEqual(best * TOLERANCE + 1e-9);
        }
        // 負担（Tool の複雑さ・事故・利用量）は雛形と同じで、持ち込みで軽くならない
        expect(card.burden, template).toEqual(content.harnessParts.find((p) => p.id === template)?.burden);
      }
    }
  });

  it('点が低いカードほど補正が弱い（0点なら補正なし）', () => {
    const tpl = 'skillFrontend';
    const at = (score: number) =>
      broughtPart(bringPartId({ template: tpl, score, kinds: ['code'], size: 0, hash: 'a', name: 'a' }));
    expect(at(0)?.modifiers).toEqual({ success: 0, humanTime: 1, guard: 0 });
    expect(at(50)?.modifiers.success).toBeLessThan(at(100)?.modifiers.success ?? 0);
  });

  it('1枚のカードが効く仕事の種類は上限まで（CLAUDE.md を除く）', () => {
    expect(balance.bring.maxKinds).toBeLessThan(ALL.length);
  });

  it('満点のカードをそろえた構成でも、同梱の部品で組んだ適切な Harness の利益を大きく超えない', () => {
    const P = 'corporateSite';
    const AGENT = 'agent';
    // 同梱：tests/balance/harness.test.ts の FITTED と同じ形（Skill 3枚・Hook 3つ・CLAUDE.md・MCP・権限・Eval 3つ）
    const slots = [
      'skillFrontend',
      'skillReport',
      'skillPrReview',
      'hookFormatter',
      'hookLinter',
      'hookUnitTest',
      'mcpFilesystem',
      'mdOverview',
      'permSandbox',
    ];
    const evals = ['evalUnitTest', 'evalAcceptance', 'evalUiReq'];
    // 持ち込み：Eval 以外の枠を、満点のカードに置き換える（Eval は持ち込めない）。効く仕事の種類は、同梱の同じ枠の部品と同じ。
    // 雛形はカテゴリで最も良い部品なので、Skill 3枚がどれも一番良い Skill になる（持ち込みの最強の形）
    const brought = slots.map((id) => {
      const p = content.harnessParts.find((x) => x.id === id) as HarnessPartDef;
      const template =
        p.category === 'skill' || p.category === 'claudeMd' || p.category === 'mcp' ? templatesOf(p.category)[0] : id;
      return fullCard(template ?? id, p.appliesTo, id).id;
    });
    const play = (seed: string, parts: readonly string[]): ProjectScore => {
      const start: Command = { type: 'StartProject', projectId: P };
      const started = reduce(createInitialState(seed), start).state;
      const setup: Command[] = [
        start,
        ...strategies.aiWithReview(P)(started),
        ...parts.map((partId): Command => ({ type: 'EquipPart', workerId: AGENT, partId })),
      ];
      const { state } = runHeadless({
        seed,
        commands: setup.map((command) => ({ at: 0, command })),
        until: deadlineMinutes(getProject(P)) * 4,
      });
      expect(state.harnesses[AGENT]?.parts.length).toBe(parts.length);
      const score = scoreProject(state, P);
      if (!score) throw new Error('案件が始まっていない');
      return score;
    };
    const r = compare(
      { fitted: (seed) => play(seed, [...slots, ...evals]), brought: (seed) => play(seed, [...brought, ...evals]) },
      seeds(30, 'bring'),
    );
    console.log(
      `[Phase 42] Profit/Person-Day：同梱の適切な Harness ${Math.round(r.fitted.profitPerPersonDay)}` +
        ` vs 満点の持ち込みカード ${Math.round(r.brought.profitPerPersonDay)} 円/人日`,
    );
    expect(r.brought.profitPerPersonDay).toBeLessThanOrEqual(r.fitted.profitPerPersonDay * TOLERANCE);
  });
});

const NEUTRAL: HarnessModifiers = {
  success: 0,
  speed: 1,
  noise: 0,
  humanTime: 1,
  aiCost: 1,
  risk: 0,
  evalCatch: 0,
  guard: 0,
};
