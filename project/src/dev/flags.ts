/**
 * 開発用ページのフラグ。`?dev=explore` `?dev=tweak` のように指定し、`?dev=explore,tweak` や `?dev=a&dev=b` で複数指定できる。
 */
export function parseDevFlags(search: string): Set<string> {
  const params = new URLSearchParams(search);
  return new Set(
    params
      .getAll('dev')
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter((v) => v !== ''),
  );
}
