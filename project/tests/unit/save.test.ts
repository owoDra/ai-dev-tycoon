import { describe, expect, it } from 'vitest';
import { clearCompany, loadCompany, loadSavedAt, saveCompany } from '../../src/app/save';
import { guideChapters } from '../../src/content/guides';
import { reduce } from '../../src/core/commands';
import { deserialize, SAVE_VERSION, serialize } from '../../src/core/serialize';
import { createInitialState, type GameState } from '../../src/core/state';

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
    expect(SAVE_VERSION).toBe(25);
    const s = deserialize(JSON.stringify(old));
    // 権限モードは1つだけ（後のものが残る）
    expect(s.harnesses.agent?.parts).toEqual(['mcpGit', 'permAuto', 'skillReport']);
    expect(s.ownedParts).toEqual(['mcpGit', 'mcpFilesystem', 'permAcceptEdits', 'permAuto']);
    expect(s.library[0]?.parts).toEqual(['mcpBrowser', 'permAuto']);
  });
});

describe('コンペの結果の見送り（core/serialize.ts の v15 → v16）', () => {
  it('旧形式の結果の won を読み替えたうえで、受注の見直し（v20 → v21）で結果の履歴ごと落とし、引き合いは残す', () => {
    const state = createInitialState('v15', { board: true });
    const results = [
      { projectId: 'p~1~S', won: true, amount: 1, winChance: 0.5, at: 0 },
      { projectId: 'p~2~S', won: false, amount: 2, winChance: 0.2, at: 0 },
    ];
    const inquiries = [{ projectId: 'p~3~S', postedDay: 0, closesAt: 900 }];
    const old = { saveVersion: 15, state: { ...state, board: { day: 0, inquiries, results } } };
    const s = deserialize(JSON.stringify(old));
    expect(s.board).toEqual({ day: 0, inquiries });
  });
});

describe('結果待ちの見積の取り下げ（core/serialize.ts の v18 → v19）', () => {
  it('結果待ちだった見積を外し、締切までにもう一度出せる引き合いに戻す', () => {
    const state = createInitialState('v18', { board: true });
    const bid = { price: 'base', deadline: 'standard', amount: 1, deadlineDays: 3, winChance: 0.5 };
    const inquiries = [
      { projectId: 'p~1~S', postedDay: 0, closesAt: 900, bid },
      { projectId: 'p~2~S', postedDay: 0, closesAt: 900, bid: null },
    ];
    const old = { saveVersion: 18, state: { ...state, board: { day: 0, inquiries, results: [] } } };
    const s = deserialize(JSON.stringify(old));
    expect(s.board?.inquiries).toEqual([
      { projectId: 'p~1~S', postedDay: 0, closesAt: 900 },
      { projectId: 'p~2~S', postedDay: 0, closesAt: 900 },
    ]);
  });
});

/** v24 より前のセーブは遊んでいる会社なので、チュートリアルの後の案内をすべて終えたことにして読み込む（v23 → v24） */
const played = (state: GameState): GameState => ({ ...state, guidesDone: guideChapters.map((c) => c.id) });

describe('速度と一時停止をなくす（core/serialize.ts の v19 → v20）', () => {
  it('速度と一時停止を落とし、ほかはそのまま読み込む（日の途中のセーブは、次に進めたときにその日の終わりまで進む）', () => {
    const state = { ...createInitialState('v19', { board: true }), clock: 300 };
    const old = { saveVersion: 19, state: { ...state, speed: 3, paused: true } };
    const s = deserialize(JSON.stringify(old));
    expect(s).toEqual(played(state));
    expect(s).not.toHaveProperty('speed');
    expect(s).not.toHaveProperty('paused');
  });
});

describe('案件の契約と受注の見直し（core/serialize.ts の v20 → v21）', () => {
  it('進めている案件は炎上・打ち切りなしで読み込み、失った企業価値は 0、コンペの結果の履歴は落とす', () => {
    const fresh = createInitialState('v20', { board: true });
    const state = reduce(fresh, { type: 'StartProject', projectId: 'tutorialLp' }).state;
    const { valuationHit, ...rest } = state;
    const projects = Object.fromEntries(
      Object.entries(state.projects).map(([id, p]) => [id, (({ burningAt, cancelled, ...r }) => r)(p)]),
    );
    const board = { ...state.board, results: [{ projectId: 'p~1~S', outcome: 'won', amount: 1, winChance: 1, at: 0 }] };
    const old = { saveVersion: 20, state: { ...rest, projects, board } };
    const s = deserialize(JSON.stringify(old));
    expect(s).toEqual(played(state));
    expect(s.projects.tutorialLp).toMatchObject({ burningAt: null, cancelled: null });
    expect(s.valuationHit).toBe(0);
    expect(s.board).not.toHaveProperty('results');
  });
});

describe('Seat を会社単位で買う（core/serialize.ts の v21 → v22）', () => {
  it('社員ごとの Seat を種類ごとに数えて会社の枚数にし、今日の使用量は合計する', () => {
    const state = createInitialState('v21', { board: true, tutorial: false });
    const { seats, usage, ...rest } = state;
    const team = { sato: { seat: 'premium', used: 40 }, suzuki: { seat: 'standard', used: 12 } };
    const old = { saveVersion: 21, state: { ...rest, team } };
    const s = deserialize(JSON.stringify(old));
    expect(s).toEqual(played({ ...state, seats: { standard: 1, premium: 1 }, usage: 52 }));
    expect(s.team).toEqual({ sato: {}, suzuki: {} });
  });
});

describe('仕組みの取捨選択（core/serialize.ts の v22 → v23）', () => {
  it('「人間 → AI」の担当は同じ形の「AI」に、細かく分かれていた解放は束に読み替え、社員の画面を開けていた会社は Seat も買える', () => {
    const state = reduce(createInitialState('v22', { board: true }), {
      type: 'StartProject',
      projectId: 'tutorialLp',
    }).state;
    const run = state.projects.tutorialLp;
    if (!run) throw new Error('案件が始まっていない');
    const [taskId, task] = Object.entries(run.tasks)[0] ?? [];
    if (!taskId || !task) throw new Error('Task がない');
    const { cappedDays, ...rest } = state;
    const old = {
      saveVersion: 22,
      state: {
        ...rest,
        projects: {
          tutorialLp: {
            ...run,
            tasks: { ...run.tasks, [taskId]: { ...task, assignment: { mode: 'humanThenAi', workerId: 'agent' } } },
          },
        },
        ledger: { ...state.ledger, modeCompleted: { ai: 1, humanThenAi: 2 } },
        unlocked: [
          'mode:human',
          'mode:humanThenAi',
          'team',
          'context',
          'context:pick',
          'harness:hook',
          'harness:mod',
          'harness:routine',
        ],
        fresh: ['session:artifacts', 'harness:subagent'],
      },
    };
    const s = deserialize(JSON.stringify(old));
    expect(s.projects.tutorialLp?.tasks[taskId]?.assignment).toEqual({ mode: 'ai', workerId: 'agent' });
    expect(s.ledger.modeCompleted).toEqual({ ai: 3 });
    expect(s.unlocked).toEqual(['mode:human', 'team', 'context', 'harness', 'harness:tool', 'seats']);
    expect(s.fresh).toEqual(['session', 'harness:tool']);
    expect(s.cappedDays).toBe(0);
  });
});

describe('チュートリアルの後の案内（core/serialize.ts の v23 → v24）', () => {
  it('すでに遊んでいる会社には案内を出さない（すべての章を終えたことにする）', () => {
    const { guide, guidesDone, ...rest } = createInitialState('v23', { board: true, tutorial: false });
    const s = deserialize(JSON.stringify({ saveVersion: 23, state: rest }));
    expect(s.guide).toBeNull();
    expect(s.guidesDone).toEqual(guideChapters.map((c) => c.id));
  });
});
