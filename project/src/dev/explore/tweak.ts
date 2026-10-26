/** 調整パネルの項目の定義と、ドット区切りのパスによる値の読み書き */

export type TweakField =
  | { path: string; kind: 'color' }
  | { path: string; kind: 'range'; min: number; max: number; step: number }
  | { path: string; kind: 'select'; options: readonly string[] };

export interface TweakGroup {
  /** 見出し（ja.ts の文言を渡す） */
  title: string;
  fields: readonly TweakField[];
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** path の値だけを差し替えた複製を返す（元のオブジェクトは変えない）。途中のキーが無ければエラーにする */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  if (head === undefined || typeof obj !== 'object' || obj === null || !(head in obj)) {
    throw new Error(`存在しないパス: ${path}`);
  }
  const record = obj as Record<string, unknown>;
  const next = rest.length === 0 ? value : setPath(record[head], rest.join('.'), value);
  return { ...record, [head]: next } as T;
}
