/**
 * 比較ページで選んだ案の保存。URL ハッシュ（`#d1=B&d2=A`）と localStorage の両方に書き、読むときはハッシュを優先する。
 * localStorage はプライベートウィンドウなどで使えないことがあるため、読み書きは必ず try/catch で囲む。
 */

export function readHashParam(hash: string, key: string): string | undefined {
  return new URLSearchParams(hash.replace(/^#/, '')).get(key) ?? undefined;
}

/** ハッシュの key だけを書き換えた新しいハッシュ（先頭の # を含む）を返す */
export function writeHashParam(hash: string, key: string, value: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  params.set(key, value);
  return `#${params.toString()}`;
}

export function loadStored(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveStored(key: string, value: string | undefined): void {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 保存できなくても比較ページは動く
  }
}

/** ハッシュ → localStorage → fallback の順に、候補に含まれる ID を選ぶ */
export function resolveVariant<T extends string>(
  ids: readonly T[],
  fromHash: string | undefined,
  fromStorage: string | undefined,
  fallback: T,
): T {
  for (const v of [fromHash, fromStorage]) {
    const found = ids.find((id) => id === v);
    if (found) return found;
  }
  return fallback;
}
