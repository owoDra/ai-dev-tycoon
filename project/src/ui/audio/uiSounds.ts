import type { SfxId } from '../../content/sfx';

/** 音を付ける操作できる要素 */
const INTERACTIVE = 'button, a[href], [role="button"], label:has(input), input[type="range"]';

/**
 * UI の効果音（ホバー・クリック・トグル）を、画面全体のイベントの委譲でまとめて付ける。
 * 各コンポーネントに音のコードを書かずに済み、新しいボタンにも自動で付く。音は見た目の反応（hover・押下の表示）に添えるだけ。
 * 戻り値で解除する。
 */
export function installUiSounds(root: Document, play: (id: SfxId) => void): () => void {
  let hovered: Element | null = null;
  const onOver = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.(INTERACTIVE) ?? null;
    if (el === hovered) return;
    hovered = el;
    if (el && !isDisabled(el)) play('uiHover');
  };
  const onClick = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.('button, a[href], [role="button"]');
    if (el && !isDisabled(el)) play('uiClick');
  };
  const onChange = (e: Event) => {
    const el = e.target as HTMLInputElement | null;
    if (el?.tagName === 'INPUT' && ['radio', 'checkbox', 'range'].includes(el.type)) play('uiToggle');
  };
  root.addEventListener('pointerover', onOver);
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  return () => {
    root.removeEventListener('pointerover', onOver);
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
  };
}

function isDisabled(el: Element): boolean {
  return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
}
