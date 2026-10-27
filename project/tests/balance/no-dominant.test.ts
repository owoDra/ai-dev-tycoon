import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import { seeds } from '../helpers/compare';
import { bestStrategy, buildMatrix, configModes, configStrategies } from '../helpers/matrix';

/**
 * 支配的な構成がないこと（企画書7章「Model × Harness」・25章「Workflow Library」）。
 * 1つの構成（同梱プリセットの Model・Harness 部品・資料の渡し方）をコピーすれば全案件で最適、にはならず、
 * 案件の Task の種類に合った構成が勝つ。担当モードをそろえ、構成の違いだけを全案件で比べる。
 */
const SEEDS = seeds(20);
/** 「別の構成の方がはっきり良い」とみなす差（Profit / Person-Day の比） */
const CLEAR_MARGIN = 1.05;

const fmt = (n: number) => `${Math.round(n / 1000).toLocaleString('ja-JP')}k`;

describe.each(configModes)('支配的な構成がない（担当モード %s）', (mode) => {
  const matrix = buildMatrix(SEEDS, configStrategies(mode));
  const rows = Object.entries(matrix);

  it('案件ごとに最適な構成が異なる', () => {
    const winners = rows.map(([projectId, row]) => [projectId, bestStrategy(row)] as const);
    for (const [projectId, row] of rows) {
      console.log(
        `[支配戦略なし/${mode}] ${getProject(projectId).name}：` +
          Object.entries(row)
            .map(([name, c]) => `${name} ${fmt(c.profitPerPersonDay)}`)
            .join(' / ') +
          ` → ${bestStrategy(row)}`,
      );
    }
    expect(new Set(winners.map(([, w]) => w)).size).toBeGreaterThanOrEqual(2);
  });

  it('どの構成にも、別の構成の方がはっきり良い案件がある', () => {
    const configs = Object.keys(configStrategies(mode));
    for (const config of configs) {
      const beaten = rows.filter(([, row]) => {
        const own = row[config]?.profitPerPersonDay ?? 0;
        return Object.values(row).some((c) => c.profitPerPersonDay > own * CLEAR_MARGIN);
      });
      expect(beaten.length, config).toBeGreaterThan(0);
    }
  });
});
