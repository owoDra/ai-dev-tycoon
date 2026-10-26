import { type Accessor, createSignal, onCleanup } from 'solid-js';
import { loadStored, readHashParam, resolveVariant, saveStored, writeHashParam } from './persist';

/**
 * 比較ページで選んでいる案。URL ハッシュ（`#<key>=<id>`）と localStorage（`explore:<key>`）に保存し、
 * 再読み込みやハッシュ付きの URL の共有で同じ案を開けるようにする。
 */
export function createVariantSelection<T extends string>(
  key: string,
  ids: readonly T[],
  fallback: T,
): [Accessor<T>, (id: T) => void] {
  const storageKey = `explore:${key}`;
  const read = () => resolveVariant(ids, readHashParam(location.hash, key), loadStored(storageKey), fallback);
  const [selected, setSelected] = createSignal<T>(read());

  const select = (id: T) => {
    setSelected(() => id);
    saveStored(storageKey, id);
    try {
      history.replaceState(null, '', writeHashParam(location.hash, key, id));
    } catch {
      // サンドボックス内などで履歴を書けなくても切り替えは動く
    }
  };

  const onHash = () => setSelected(() => read());
  addEventListener('hashchange', onHash);
  onCleanup(() => removeEventListener('hashchange', onHash));
  return [selected, select];
}
