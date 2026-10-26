import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSettings, settings, updateSettings } from '../../src/app/settings';
import { createGameStore } from '../../src/app/store';
import { defaultFeel, feelIntensities } from '../../src/content/look/feel';
import { createInitialState } from '../../src/core/state';
import { createFxDirector } from '../../src/fx/director';
import { feel } from '../../src/fx/feel';
import { reducedMotion } from '../../src/fx/reduced';
import { FxHost, type FxHostApi } from '../../src/ui/fx/FxHost';
import { Num } from '../../src/ui/Num';
import { Presence } from '../../src/ui/Presence';
import { SettingsSheet } from '../../src/ui/SettingsSheet';
import { createSelection } from '../../src/ui/selection';

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
  updateSettings({ motion: 'system' });
});

function mountHost() {
  const store = createGameStore(createInitialState('fx'));
  store.dispatch({ type: 'StartProject', projectId: 'ecRenewal' });
  const root = document.createElement('div');
  document.body.append(root);
  let api: FxHostApi | undefined;
  dispose = render(
    () => (
      <FxHost
        store={store}
        projectId="ecRenewal"
        world={() => undefined}
        vm={() => undefined}
        selection={createSelection()}
        ref={(a) => {
          api = a;
        }}
      />
    ),
    root,
  );
  if (!api) throw new Error('FxHost が API を渡していない');
  return { root, api, store };
}

describe('演出のレイヤーは入力をブロックしない', () => {
  it('レイヤー全体が pointer-events: none で、演出の再生中もクリックを受け止める要素を持たない', () => {
    const { root, api } = mountHost();
    api.trigger([
      { kind: 'taskDone', entityId: 'island:hearing' },
      { kind: 'projectComplete', entityId: null },
    ]);
    const layer = root.querySelector<HTMLElement>('[data-fx-layer]');
    expect(layer?.className).toContain('pointer-events-none');
    // 再生中の文字が出ている
    expect(layer?.textContent).toContain('納品完了');
    // 中に pointer-events を戻す要素・ボタン・フォーカスできる要素がない
    expect(layer?.querySelectorAll('[class*="pointer-events-auto"], button, a, input, [tabindex]')).toHaveLength(0);
  });

  it('演出を起動しても state は変わらない（Command を発行しない）', () => {
    const { api, store } = mountHost();
    const before = store.state();
    api.trigger([{ kind: 'automation', entityId: 'island:implementation', amount: 4 }]);
    expect(store.state()).toBe(before);
  });
});

describe('<Num>', () => {
  it('値が変わったら新しい値を表示し、増減の向きのチップを出す', () => {
    const [value, setValue] = createSignal(1000);
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(() => <Num value={value()} format={(v) => `${Math.round(v)}円`} />, root);
    expect(root.textContent).toContain('1000円');
    setValue(1500);
    expect(root.querySelector('[aria-hidden="true"].tabular-nums')?.textContent).toBe('1500円');
    expect(root.querySelector('[data-num-chip]')?.getAttribute('data-num-chip')).toBe('up');
    expect(root.querySelector('[data-num-chip]')?.textContent).toContain('+500円');
  });

  it('chipMin 未満の変化ではチップを出さない', () => {
    const [value, setValue] = createSignal(1000);
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(() => <Num value={value()} format={String} chipMin={100} />, root);
    setValue(1050);
    expect(root.querySelector('[data-num-chip]')).toBeNull();
  });
});

describe('<Presence>', () => {
  it('アニメーションできない環境では、値がなくなったらすぐに取り除く', () => {
    const [value, setValue] = createSignal<string | null>('a');
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(() => <Presence when={value()}>{(v) => <p>{v()}</p>}</Presence>, root);
    expect(root.textContent).toBe('a');
    setValue(null);
    expect(root.textContent).toBe('');
  });
});

describe('動きを減らす設定', () => {
  it('設定の「減らす」で reduced になり、director は代替の部品で起動する', () => {
    updateSettings({ motion: 'reduce' });
    expect(reducedMotion()).toBe(true);
    const director = createFxDirector({ now: () => 0, feel: () => defaultFeel, reduced: reducedMotion });
    expect(director.handle([{ kind: 'taskDone', entityId: null }]).started[0]?.reduced).toBe(true);
    updateSettings({ motion: 'full' });
    expect(reducedMotion()).toBe(false);
  });

  it('設定は保存され、読めない値や壊れた保存データでは既定値に戻る', () => {
    updateSettings({ motion: 'reduce' });
    expect(settings().motion).toBe('reduce');
    expect(loadSettings(localStorage).motion).toBe('reduce');
    expect(loadSettings({ getItem: () => '{broken' }).motion).toBe('system');
    expect(loadSettings({ getItem: () => '{"motion":"wild"}' }).motion).toBe('system');
    expect(
      loadSettings({
        getItem: () => {
          throw new Error('blocked');
        },
      }).motion,
    ).toBe('system');
  });
});

describe('演出の強さの設定（D4 で設定画面に残した3段階）', () => {
  it('設定画面で選んだ強さが手触りに反映され、保存され、読めない値では標準に戻る', () => {
    const dispose = render(() => <SettingsSheet onClose={() => {}} />, document.body);
    const calm = document.querySelector<HTMLInputElement>('input[name="feelIntensity"][value="calm"]');
    expect(calm).not.toBeNull();
    calm?.click();
    expect(settings().feelIntensity).toBe('calm');
    expect(feel().tiers).toBe(feelIntensities.calm.tiers);
    expect(feel().motion).toBe(defaultFeel.motion);
    expect(loadSettings(localStorage).feelIntensity).toBe('calm');
    expect(loadSettings({ getItem: () => '{"feelIntensity":"wild"}' }).feelIntensity).toBe('standard');
    dispose();
    updateSettings({ feelIntensity: 'standard' });
    expect(feel().tiers).toBe(defaultFeel.tiers);
  });
});
