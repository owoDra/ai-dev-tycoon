import { describe, expect, it } from 'vitest';
import { clearCompany, loadCompany, loadSavedAt, saveCompany } from '../../src/app/save';
import { reduce } from '../../src/core/commands';
import { deserialize, SAVE_VERSION, serialize } from '../../src/core/serialize';
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
    expect(loadCompany(storage)).toBeNull();
    const s = reduce(createInitialState('c', { board: true }), {
      type: 'StartProject',
      projectId: 'tutorialLp',
    }).state;
    saveCompany(s, storage);
    expect(loadCompany(storage)).toEqual(s);
    clearCompany(storage);
    expect(loadCompany(storage)).toBeNull();
  });

  it('キャンペーンでない state は保存しない。壊れた値は読めないものとして扱う', () => {
    const storage = memory();
    saveCompany(createInitialState('s'), storage);
    expect(storage.data.size).toBe(0);
    storage.setItem('ai-dev-tycoon.campaign.v1', '{broken');
    expect(loadCompany(storage)).toBeNull();
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
    const s = createInitialState('c', { board: true });
    expect(() => saveCompany(s, failing)).not.toThrow();
    expect(loadCompany(failing)).toBeNull();
    expect(() => clearCompany(failing)).not.toThrow();
    expect(loadSavedAt(failing)).toBeNull();
  });

  it('保存した実時刻も残し（閉じていた間の進行に使う）、消すと一緒に消える', () => {
    const storage = memory();
    expect(loadSavedAt(storage)).toBeNull();
    saveCompany(createInitialState('c', { board: true }), storage, 1_700_000_000_000);
    expect(loadSavedAt(storage)).toBe(1_700_000_000_000);
    storage.setItem('ai-dev-tycoon.campaign.savedAt', 'later');
    expect(loadSavedAt(storage)).toBeNull();
    clearCompany(storage);
    expect(storage.data.size).toBe(0);
  });
});

describe('Phase 26 の部品の読み替え（core/serialize.ts の v14 → v15）', () => {
  it('旧形式のセーブの Tool は MCP に、権限は権限モードに読み替え、なくなった部品は外す', () => {
    const base = JSON.parse(serialize(createInitialState('old')));
    const old = {
      saveVersion: 14,
      state: {
        ...base.state,
        harnesses: {
          agent: {
            modelId: 'standard',
            parts: ['toolGit', 'permRead', 'permWrite', 'permDeploy', 'humanGate', 'skillReport'],
          },
        },
        ownedParts: ['toolGit', 'toolFiles', 'permRead', 'permWrite', 'permDeploy', 'humanGate'],
        library: [
          {
            id: 'custom1',
            name: 'w',
            mode: 'ai',
            modelId: 'standard',
            context: 'needed',
            parts: ['toolBrowser', 'permExecute'],
          },
        ],
      },
    };
    expect(SAVE_VERSION).toBe(17);
    const s = deserialize(JSON.stringify(old));
    // 権限モードは1つだけ（後のものが残る）
    expect(s.harnesses.agent?.parts).toEqual(['mcpGit', 'permAuto', 'skillReport']);
    expect(s.ownedParts).toEqual(['mcpGit', 'mcpFilesystem', 'permAcceptEdits', 'permAuto']);
    expect(s.library[0]?.parts).toEqual(['mcpBrowser', 'permAuto']);
  });
});

describe('コンペの結果の見送り（core/serialize.ts の v15 → v16）', () => {
  it('旧形式の結果の won を、受注・失注の outcome に読み替える', () => {
    const state = createInitialState('v15', { board: true });
    const results = [
      { projectId: 'p~1~S', won: true, amount: 1, winChance: 0.5, at: 0 },
      { projectId: 'p~2~S', won: false, amount: 2, winChance: 0.2, at: 0 },
    ];
    const old = { saveVersion: 15, state: { ...state, board: { day: 0, inquiries: [], results } } };
    const s = deserialize(JSON.stringify(old));
    expect(s.board?.results).toEqual([
      { projectId: 'p~1~S', outcome: 'won', amount: 1, winChance: 0.5, at: 0 },
      { projectId: 'p~2~S', outcome: 'lost', amount: 2, winChance: 0.2, at: 0 },
    ]);
  });
});
