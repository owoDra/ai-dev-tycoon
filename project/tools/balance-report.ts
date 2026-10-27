/**
 * バランスの調整材料：全案件 × 全戦略 Bot の主要指標を表で出力する（seed 平均）。
 * 使い方：`npm run balance:report [-- seed数]`（既定 20）。
 * 戦略 Bot・同梱プリセットのコピーの表と、担当モードをそろえて構成だけを比べた表を出す
 */
import { getProject } from '../src/content/index';
import { seeds } from '../tests/helpers/compare';
import { bestStrategy, buildMatrix, configModes, configStrategies, type MatrixCell } from '../tests/helpers/matrix';

const DEFAULT_SEEDS = 20;
const count = Number(process.argv[2] ?? DEFAULT_SEEDS);
const seedList = seeds(Number.isFinite(count) && count > 0 ? count : DEFAULT_SEEDS);
const matrix = buildMatrix(seedList);

const yen = (n: number) => Math.round(n).toLocaleString('ja-JP');
const pct = (n: number) => `${Math.round(n * 100)}%`;
const COLUMNS: ReadonlyArray<[string, (c: MatrixCell) => string]> = [
  ['Profit/Person-Day', (c) => yen(c.profitPerPersonDay)],
  ['利益', (c) => yen(c.profit)],
  ['人間時間(分)', (c) => yen(c.humanMinutes)],
  ['納期比', (c) => c.deadlineRatio.toFixed(2)],
  ['品質', (c) => pct(c.quality)],
  ['手戻り率', (c) => pct(c.reworkRate)],
  ['事故', (c) => c.accidents.toFixed(2)],
  ['納品率', (c) => pct(c.completed)],
];

const lines: string[] = [];
lines.push(`| 案件 | 戦略 | ${COLUMNS.map(([h]) => h).join(' | ')} |`);
lines.push(`|---|---|${COLUMNS.map(() => '---:').join('|')}|`);
const winners: string[] = [];
for (const [projectId, row] of Object.entries(matrix)) {
  const best = bestStrategy(row);
  winners.push(`${getProject(projectId).name}: ${best}`);
  for (const [name, cell] of Object.entries(row)) {
    const mark = name === best ? ' ★' : '';
    lines.push(`| ${getProject(projectId).name} | ${name}${mark} | ${COLUMNS.map(([, f]) => f(cell)).join(' | ')} |`);
  }
}
console.log(lines.join('\n'));
console.log(`\n★ 案件ごとの最適戦略（Profit/Person-Day）\n${winners.map((w) => `- ${w}`).join('\n')}`);

// 構成（Model・部品・資料の渡し方）だけの比較：担当モードをそろえて、同梱プリセットの構成を全案件で比べる
for (const mode of configModes) {
  const configs = buildMatrix(seedList, configStrategies(mode));
  const names = Object.keys(configStrategies(mode));
  console.log(`\n構成だけの比較（全 Task を ${mode}、Profit/Person-Day）`);
  console.log(`| 案件 | ${names.join(' | ')} | 最適 |`);
  console.log(`|---|${names.map(() => '---:').join('|')}|---|`);
  for (const [projectId, row] of Object.entries(configs)) {
    const cells = names.map((n) => yen(row[n]?.profitPerPersonDay ?? 0));
    console.log(`| ${getProject(projectId).name} | ${cells.join(' | ')} | ${bestStrategy(row)} |`);
  }
}
