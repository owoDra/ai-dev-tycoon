/** 比較に使う seed の列。乱数の偶然に左右されないよう、複数の seed の平均で比べる */
export function seeds(count = 20, prefix = 'seed'): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`);
}

type NumericKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];
export type Averaged<T> = { readonly [K in NumericKeys<T>]: number };

/** 各 seed で run を実行し、結果の数値項目ごとの平均を返す */
export function averageOver<T extends object>(seedList: readonly string[], run: (seed: string) => T): Averaged<T> {
  const sums: Record<string, number> = {};
  for (const seed of seedList) {
    for (const [k, v] of Object.entries(run(seed))) {
      if (typeof v === 'number') sums[k] = (sums[k] ?? 0) + v;
    }
  }
  return Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v / seedList.length])) as Averaged<T>;
}

/** 複数の候補を同じ seed の列で実行し、候補ごとの平均を返す */
export function compare<N extends string, T extends object>(
  candidates: Readonly<Record<N, (seed: string) => T>>,
  seedList: readonly string[] = seeds(),
): Record<N, Averaged<T>> {
  const out = {} as Record<N, Averaged<T>>;
  for (const name of Object.keys(candidates) as N[]) out[name] = averageOver(seedList, candidates[name]);
  return out;
}
