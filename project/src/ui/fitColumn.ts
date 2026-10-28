import { onCleanup } from 'solid-js';

/** お知らせの列に積むカードの印。列はこの印の付いた要素を、DOM の順（大事な順）に入る分だけ出す */
export const FIT_ITEM = 'data-fit-item';

/**
 * 列（スクロールしない、高さの決まった要素）に入りきらないカードを隠す。カードは DOM の順に並べ、
 * 下端が列からはみ出したカードから後ろはすべて隠す（大事なものを先に置き、後ろのものを省く。先頭のカードだけはいつも出す）。
 * カードの増減と列の大きさの変化に追従する。隠したカードは消えたカードの代わりに、空いた分だけ戻る
 */
export function fitColumn(column: HTMLElement): void {
  const fit = () => {
    const items = [...column.querySelectorAll<HTMLElement>(`[${FIT_ITEM}]`)];
    for (const item of items) item.style.display = '';
    const limit = column.clientHeight;
    let full = false;
    for (const item of items) {
      // 入場の動き（transform）に左右されないよう、変形前の位置（offsetTop）で測る
      const bottom = offsetIn(item, column) + item.offsetHeight;
      // 先頭のカード（いちばん大事なもの）は、はみ出しても出す
      if (full || (item !== items[0] && bottom > limit + 0.5)) {
        full = true;
        item.style.display = 'none';
      }
    }
  };
  const mutations = new MutationObserver(fit);
  mutations.observe(column, { childList: true, subtree: true, characterData: true });
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
  resize?.observe(column);
  queueMicrotask(fit);
  onCleanup(() => {
    mutations.disconnect();
    resize?.disconnect();
  });
}

/**
 * 列の上端から要素の上端までの距離（px。transform を含まない）。
 * 列は絶対配置なので、中の要素の offsetParent をたどると列に着く
 */
function offsetIn(el: HTMLElement, column: HTMLElement): number {
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== column) {
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return y;
}
