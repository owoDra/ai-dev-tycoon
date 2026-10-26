/**
 * ViewModel の一覧と描画オブジェクトを ID をキーにして差分同期する。
 * 新しい ID は create、続いている ID は update、消えた ID は remove を呼ぶ。Three.js に依存しない。
 */
export function syncById<V extends { readonly id: string }, R>(
  objects: Map<string, R>,
  views: readonly V[],
  handlers: { create: (view: V) => R; update: (object: R, view: V) => void; remove: (object: R, id: string) => void },
): void {
  const seen = new Set<string>();
  for (const view of views) {
    seen.add(view.id);
    let object = objects.get(view.id);
    if (object === undefined) {
      object = handlers.create(view);
      objects.set(view.id, object);
    }
    handlers.update(object, view);
  }
  for (const [id, object] of objects) {
    if (seen.has(id)) continue;
    handlers.remove(object, id);
    objects.delete(id);
  }
}
