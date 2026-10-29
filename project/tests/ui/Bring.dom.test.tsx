import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileList } from '../../src/app/bringRead';
import { loadBringCards, saveBringCards } from '../../src/app/bringStore';
import { readBring } from '../../src/core/bring';
import { createInitialState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { createZip } from '../../src/lib/zip';
import { BringScreen } from '../../src/ui/bring/BringScreen';
import { PluginExportSheet } from '../../src/ui/bring/PluginExportSheet';
import { readFixture } from '../helpers/bring';

const fixture = readFixture();
const cards = readBring(fixture).cards;
let dispose = () => {};
beforeEach(() => localStorage.clear());
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount(node: () => JSX.Element) {
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(node, root);
  return root;
}

describe('持ち込みの画面（ui/bring/BringScreen.tsx）', () => {
  it('保存したカードを、カテゴリ・点・良かった点・伸ばすと強くなる点・なぜこの性能？と一緒に並べる', () => {
    saveBringCards(cards);
    const root = mount(() => <BringScreen onBack={() => {}} onBattle={() => {}} />);
    const items = root.querySelectorAll('[data-bring-card]');
    expect(items.length).toBe(cards.length);
    const notes = [...items].find((el) => el.textContent?.includes('notes'));
    expect(notes?.querySelector('[data-bring-score]')?.textContent).toBe(ja.bring.score(20));
    expect(notes?.querySelector('[data-bring-grow]')?.textContent).toContain(ja.bring.criteria.whenToUse.grow);
    expect(notes?.querySelector('[data-bring-why] summary')?.textContent).toBe(ja.bring.why);
  });

  it('カードを捨てると保存からも消える', () => {
    saveBringCards(cards);
    const root = mount(() => <BringScreen onBack={() => {}} onBattle={() => {}} />);
    root.querySelector<HTMLButtonElement>('[data-bring-remove]')?.click();
    expect(root.querySelectorAll('[data-bring-card]').length).toBe(cards.length - 1);
    expect(loadBringCards()).toHaveLength(cards.length - 1);
  });

  it('合言葉を入れてバトルを始めると、そろえた合言葉と持ち込みカードの id を渡す', () => {
    saveBringCards(cards);
    const onBattle = vi.fn();
    const root = mount(() => <BringScreen onBack={() => {}} onBattle={onBattle} />);
    const start = root.querySelector<HTMLButtonElement>('[data-battle-start]');
    expect(start?.disabled).toBe(true);
    const word = root.querySelector<HTMLInputElement>('[data-battle-word]');
    if (!word) throw new Error('合言葉の欄がない');
    word.value = ' party 2026 ';
    word.dispatchEvent(new Event('input', { bubbles: true }));
    start?.click();
    expect(onBattle).toHaveBeenCalledWith(
      'PARTY-2026',
      cards.map((c) => c.id),
    );
  });

  it('ファイルの選択とドロップの読み取り：対象のファイルだけを開き、.env は中身を読まずに知らせ、zip は展開する', async () => {
    const files = fixture.map((f) => ({ file: new File([f.text], f.path.split('/').at(-1) ?? ''), path: f.path }));
    const read = await readFileList(files);
    expect(read.files.map((f) => f.path).sort()).toEqual(
      fixture
        .map((f) => f.path)
        .filter((p) => !p.endsWith('.sh') && !p.endsWith('.ts') && p !== '.env')
        .sort(),
    );
    expect(read.skipped).toEqual([{ path: '.env', reason: 'secretFile' }]);
    const encoder = new TextEncoder();
    const zip = createZip(fixture.map((f) => ({ path: f.path, data: encoder.encode(f.text) })));
    const fromZip = await readFileList([{ file: new File([zip as BlobPart], 'harness.zip'), path: 'harness.zip' }]);
    expect(readBring(fromZip.files)).toEqual(readBring(read.files));
  });
});

describe('ハーネスを持ち帰る（ui/bring/PluginExportSheet.tsx）', () => {
  it('レベル・中身・次に増えるもの・入れ方と、汎用の雛形を含むことを出す', () => {
    const state = { ...createInitialState('export-ui', { board: true }), tutorial: null };
    const root = mount(() => <PluginExportSheet state={state} cards={cards} onClose={() => {}} />);
    expect(root.querySelector('[data-export-level]')?.textContent).toContain('Lv.');
    expect(root.querySelector('[data-export-template]')?.textContent).toBe(ja.pluginExport.templateNote);
    expect(root.querySelectorAll('[data-export-item="brought"]').length).toBe(cards.length);
    expect(root.querySelector('[data-export-next]')?.textContent).toContain(ja.pluginExport.next.title);
    expect(root.querySelector('[data-export-install]')?.textContent).toContain(
      'claude plugin install tycoon-harness@tycoon-market',
    );
    expect(root.querySelector<HTMLButtonElement>('[data-export-download]')?.disabled).toBe(false);
  });
});
