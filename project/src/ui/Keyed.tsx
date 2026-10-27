import { type Accessor, createMemo, For, type JSX } from 'solid-js';

/**
 * キーで項目を対応づける For。ゲームの state から作る一覧（view/*）は、時計が進むたびに新しいオブジェクトになるので、
 * For（参照で対応づける）では毎フレーム DOM を作り直してしまい、押したボタンが外れてクリックが届かない・選んだ値が戻るといったことが起きる。
 * Keyed はキーが同じ項目の DOM を残し、子には「いつも最新の項目の値を読む」オブジェクトを渡す（プロパティを読むと追跡される）。
 * 一覧から消えた項目は、片付くまで最後の値を返す。
 */
export function Keyed<T extends object>(props: {
  each: readonly T[];
  by: (item: T) => string;
  fallback?: JSX.Element;
  children: (item: T, index: Accessor<number>) => JSX.Element;
}): JSX.Element {
  const keys = createMemo(() => props.each.map(props.by), [], {
    equals: (a, b) => a.length === b.length && a.every((k, i) => k === b[i]),
  });
  const byKey = createMemo(() => new Map(props.each.map((item) => [props.by(item), item])));
  return (
    <For each={keys()} fallback={props.fallback}>
      {(key, index) => props.children(latest(key, byKey), index)}
    </For>
  );
}

/** キーの項目の最新の値へ読み替えるオブジェクト。値そのもの（入れ子のオブジェクト）は元のまま返す */
function latest<T extends object>(key: string, byKey: Accessor<Map<string, T>>): T {
  let last = byKey().get(key) as T;
  const current = (): T => {
    last = byKey().get(key) ?? last;
    return last;
  };
  return new Proxy({} as T, {
    get: (_, p) => Reflect.get(current(), p),
    has: (_, p) => Reflect.has(current(), p),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_, p) => {
      const d = Reflect.getOwnPropertyDescriptor(current(), p);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}
