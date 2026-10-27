import { campaign } from '../content/campaign';
import { glossary } from '../content/glossary';
import { allFeatures } from '../content/unlocks';
import { createHumanQueues, createSessions, createTeam, type GameState } from './state';

/** セーブデータの形式のバージョン。GameState の形を変えたら上げ、MIGRATIONS に変換を足す */
export const SAVE_VERSION = 9;

/**
 * 結果コード（core/resultCode.ts）の形式のバージョン。並び・フィールド・単位を変えたら上げる。違うバージョンのコードは読まない。
 * 2：KPI を円/人時から円/人日に変更
 */
export const RESULT_CODE_FORMAT = 2;

/** バージョン from のセーブデータの state を、バージョン from + 1 の形に変換する */
export interface Migration {
  readonly from: number;
  readonly migrate: (state: unknown) => unknown;
}

/** from の昇順に並べる */
export const MIGRATIONS: readonly Migration[] = [
  // v2: 案件・人間の待ち行列・ボトルネックを追加（Phase 03）
  { from: 1, migrate: (s) => ({ ...(s as object), projects: {}, humanQueues: createHumanQueues(), bottleneck: null }) },
  // v3: 機能の解放・用語・チュートリアルを追加（Phase 09）。以前のセーブはすべて解放済みとして扱う
  {
    from: 2,
    migrate: (s) => ({ ...(s as object), unlocked: allFeatures, revealed: glossary.map((g) => g.id), tutorial: null }),
  },
  // v4: AI Worker の Session・事件・Context の記録を追加（Phase 10）
  {
    from: 3,
    migrate: (s) => ({
      ...(s as object),
      sessions: createSessions(),
      incidents: [],
      contextStats: { resets: 0, handoffResets: 0, incidents: 0, resolved: 0, routedWorks: 0 },
    }),
  },
  // v5: AI Worker の Harness と導入コストの記録、Task の Harness の記録を追加（Phase 11）
  { from: 4, migrate: (s) => migrateHarness(s as V4State) },
  // v6: AI Worker の自律の記録（Autonomy Streak と介入間隔）を追加（Phase 12）
  { from: 5, migrate: (s) => ({ ...(s as object), autonomy: {} }) },
  // v7: 社員と Seat・使用量・Seat の固定費・キャンペーンを追加（Phase 13）。以前のセーブはキャンペーンでない単発のプレイ
  {
    from: 6,
    migrate: (s) => ({ ...(s as object), team: createTeam(campaign.team), usageDay: 0, seatCost: 0, campaign: null }),
  },
  // v8: Task に AI の作業の構成（寄与の分析用）を追加（Phase 14）。以前の Task は記録なし
  { from: 7, migrate: (s) => mapTasks(s as V4State, (t) => ({ ...t, setup: null })) },
  // v9: Workflow Library（保存した Workflow と適用の記録）を追加（Phase 16）。以前のセーブは空の棚から
  { from: 8, migrate: (s) => ({ ...(s as object), library: [], libraryUses: [] }) },
];

interface V4State {
  readonly projects: Readonly<Record<string, { readonly tasks: Readonly<Record<string, object>> }>>;
}

/** すべての案件の Task を fn で変換する */
function mapTasks<S extends V4State>(s: S, fn: (task: object) => object): S {
  const projects = Object.fromEntries(
    Object.entries(s.projects).map(([id, p]) => [
      id,
      { ...p, tasks: Object.fromEntries(Object.entries(p.tasks).map(([tid, t]) => [tid, fn(t)])) },
    ]),
  );
  return { ...s, projects };
}

function migrateHarness(s: V4State): unknown {
  const next = mapTasks(s, (t) => ({ ...t, skipped: [], evalLoops: 0, accidents: 0, interventions: 0 }));
  return { ...next, harnesses: {}, ownedParts: [], harnessLedger: [] };
}

interface SaveData {
  readonly saveVersion: number;
  readonly state: unknown;
}

export function serialize(state: GameState): string {
  return JSON.stringify({ saveVersion: SAVE_VERSION, state } satisfies SaveData);
}

/**
 * セーブデータを読み込み、必要ならマイグレーションを順に適用して現在の形にする。
 * 壊れたデータや未来のバージョンは例外にする。
 */
export function deserialize(
  json: string,
  migrations: readonly Migration[] = MIGRATIONS,
  currentVersion: number = SAVE_VERSION,
): GameState {
  const data: unknown = JSON.parse(json);
  if (!isSaveData(data)) throw new Error('セーブデータの形式が不正');
  if (data.saveVersion > currentVersion) {
    throw new Error(`未対応のセーブデータのバージョン: ${data.saveVersion}`);
  }
  let { saveVersion: version, state } = data;
  while (version < currentVersion) {
    const m = migrations.find((x) => x.from === version);
    if (!m) throw new Error(`バージョン ${version} からのマイグレーションがない`);
    state = m.migrate(state);
    version++;
  }
  if (!isGameState(state)) throw new Error('セーブデータの state が不正');
  return state;
}

function isSaveData(v: unknown): v is SaveData {
  return isRecord(v) && Number.isInteger(v.saveVersion) && 'state' in v;
}

function isGameState(v: unknown): v is GameState {
  return (
    isRecord(v) &&
    typeof v.seed === 'string' &&
    typeof v.rng === 'number' &&
    typeof v.clock === 'number' &&
    typeof v.carryMinutes === 'number' &&
    typeof v.speed === 'number' &&
    typeof v.paused === 'boolean' &&
    isRecord(v.entities) &&
    isRecord(v.projects) &&
    isRecord(v.humanQueues) &&
    (v.bottleneck === null || isRecord(v.bottleneck)) &&
    Array.isArray(v.pendingEvents) &&
    Array.isArray(v.unlocked) &&
    Array.isArray(v.revealed) &&
    (v.tutorial === null || isRecord(v.tutorial)) &&
    isRecord(v.sessions) &&
    Array.isArray(v.incidents) &&
    isRecord(v.contextStats) &&
    isRecord(v.autonomy) &&
    isRecord(v.team) &&
    typeof v.usageDay === 'number' &&
    typeof v.seatCost === 'number' &&
    (v.campaign === null || isRecord(v.campaign)) &&
    Array.isArray(v.library) &&
    Array.isArray(v.libraryUses)
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
