import { createHumanQueues, type GameState } from './state';

/** セーブデータの形式のバージョン。GameState の形を変えたら上げ、MIGRATIONS に変換を足す */
export const SAVE_VERSION = 2;

/** バージョン from のセーブデータの state を、バージョン from + 1 の形に変換する */
export interface Migration {
  readonly from: number;
  readonly migrate: (state: unknown) => unknown;
}

/** from の昇順に並べる */
export const MIGRATIONS: readonly Migration[] = [
  // v2: 案件・人間の待ち行列・ボトルネックを追加（Phase 03）
  { from: 1, migrate: (s) => ({ ...(s as object), projects: {}, humanQueues: createHumanQueues(), bottleneck: null }) },
];

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
    Array.isArray(v.pendingEvents)
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
