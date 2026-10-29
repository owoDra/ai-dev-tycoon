/**
 * メニューの項目を探す。項目が「会社」「AI の仕組み」のまとまり（ui/play/PlayControls.tsx の MenuGroup）に入っていれば、
 * まとまりのボタンを押して一覧を開いてから探す（開いたままにする）。どのまとまりにもなければ null
 */
export function findMenu(root: ParentNode, selector: string): HTMLElement | null {
  const direct = root.querySelector<HTMLElement>(selector);
  if (direct) return direct;
  for (const toggle of root.querySelectorAll<HTMLButtonElement>('[data-menu-group-toggle]')) {
    toggle.click();
    const inside = root.querySelector<HTMLElement>(selector);
    if (inside) return inside;
    toggle.click();
  }
  return null;
}

/** メニューの項目を押す（まとまりに入っていれば、開いてから押す） */
export function pressMenu(root: ParentNode, selector: string): void {
  findMenu(root, selector)?.click();
}
