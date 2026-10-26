import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSettings, settings, updateSettings } from '../../src/app/settings';
import type { SfxId } from '../../src/content/sfx';
import { installUiSounds } from '../../src/ui/audio/uiSounds';
import { SettingsSheet } from '../../src/ui/SettingsSheet';

const DEFAULT_AUDIO = loadSettings({ getItem: () => null }).audio;
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
  updateSettings({ motion: 'system', audio: DEFAULT_AUDIO });
});

describe('音の設定', () => {
  it('初期値は控えめ（どの音量も 1 未満）で、ミュートしていない', () => {
    expect(DEFAULT_AUDIO.muted).toBe(false);
    for (const v of [DEFAULT_AUDIO.master, DEFAULT_AUDIO.sfx, DEFAULT_AUDIO.music]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
    expect(DEFAULT_AUDIO.music).toBeLessThan(DEFAULT_AUDIO.sfx);
  });

  it('保存した音量を読み、範囲外や壊れた値は切り詰めるか既定値にする', () => {
    updateSettings({ audio: { master: 0.3, sfx: 0.2, music: 0.1, muted: true } });
    expect(loadSettings(localStorage).audio).toEqual({ master: 0.3, sfx: 0.2, music: 0.1, muted: true });
    const odd = loadSettings({ getItem: () => '{"audio":{"master":5,"sfx":-1,"music":"loud","muted":"yes"}}' });
    expect(odd.audio).toEqual({ master: 1, sfx: 0, music: DEFAULT_AUDIO.music, muted: DEFAULT_AUDIO.muted });
    expect(loadSettings({ getItem: () => '{"motion":"reduce"}' }).audio).toEqual(DEFAULT_AUDIO);
  });

  it('設定シートで音量とミュートを変えられ、値は数字でも表示する', () => {
    dispose = render(() => <SettingsSheet onClose={() => {}} />, document.body);
    const sliders = document.querySelectorAll<HTMLInputElement>('input[type="range"]');
    expect(sliders.length).toBe(3);
    const master = sliders[0];
    if (!master) throw new Error('スライダーがない');
    master.value = '40';
    master.dispatchEvent(new Event('input', { bubbles: true }));
    expect(settings().audio.master).toBeCloseTo(0.4);
    expect(document.body.textContent).toContain('40%');
    const mute = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
    mute?.click();
    expect(settings().audio.muted).toBe(true);
    expect([...sliders].every((s) => s.disabled)).toBe(true);
  });
});

describe('UI の効果音', () => {
  function setup() {
    document.body.innerHTML = `
      <button id="a"><span id="inner">A</span></button>
      <button id="off" disabled>off</button>
      <label><input id="r" type="radio" name="x" /> r</label>
      <p id="text">text</p>`;
    const played: SfxId[] = [];
    dispose = installUiSounds(document, (id) => played.push(id));
    const $ = (id: string) => document.getElementById(id) as HTMLElement;
    const over = (id: string) => $(id).dispatchEvent(new Event('pointerover', { bubbles: true }));
    return { played, $, over };
  }

  it('ホバーは操作できる要素に入ったときに1回だけ、クリックとトグルはそれぞれの音', () => {
    const { played, $, over } = setup();
    over('a');
    over('inner');
    over('text');
    over('off');
    $('inner').click();
    $('r').click();
    expect(played).toEqual(['uiHover', 'uiClick', 'uiToggle']);
  });

  it('解除すると鳴らない', () => {
    const { played, $ } = setup();
    dispose();
    dispose = () => {};
    $('a').click();
    expect(played).toEqual([]);
  });
});
