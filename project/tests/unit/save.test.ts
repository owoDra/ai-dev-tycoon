import { describe, expect, it } from 'vitest';
import { clearCampaign, loadCampaign, saveCampaign } from '../../src/app/save';
import { reduce } from '../../src/core/commands';
import { createInitialState } from '../../src/core/state';

/** localStorage の代わり */
function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe('キャンペーンの自動セーブ（app/save.ts）', () => {
  it('キャンペーンを保存して読み込める。消すと読めない', () => {
    const storage = memory();
    expect(loadCampaign(storage)).toBeNull();
    const s = reduce(createInitialState('c', { campaign: true }), {
      type: 'StartProject',
      projectId: 'tutorialLp',
    }).state;
    saveCampaign(s, storage);
    expect(loadCampaign(storage)).toEqual(s);
    clearCampaign(storage);
    expect(loadCampaign(storage)).toBeNull();
  });

  it('キャンペーンでない state は保存しない。壊れた値は読めないものとして扱う', () => {
    const storage = memory();
    saveCampaign(createInitialState('s'), storage);
    expect(storage.data.size).toBe(0);
    storage.setItem('ai-dev-tycoon.campaign.v1', '{broken');
    expect(loadCampaign(storage)).toBeNull();
  });

  it('保存先が使えなくても例外にしない', () => {
    const failing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const s = createInitialState('c', { campaign: true });
    expect(() => saveCampaign(s, failing)).not.toThrow();
    expect(loadCampaign(failing)).toBeNull();
    expect(() => clearCampaign(failing)).not.toThrow();
  });
});
