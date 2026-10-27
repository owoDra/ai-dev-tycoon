import { createFiscal, createFunds, createLedger, type GameState } from './state';

/** セーブデータの形式のバージョン。GameState の形を変えたら上げ、MIGRATIONS に変換を足す */
export const SAVE_VERSION = 14;

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

/**
 * from の昇順に並べる。v10 以前（Phase 19 まで）は固定の案件を順に受注するキャンペーンのセーブで、
 * 案件ボードとコンペ（Phase 20）の会社に変換できないので読み込まない（OutdatedSaveError）。
 * v13 以前は時計が1日 = 480分（勤務時間だけ）の単位で、1日 = 24時間の時計（core/clock.ts）に置き換えると
 * 案件の開始・納期・締切・事件などの時刻がすべてずれるので、これも読み込まない
 */
export const MIGRATIONS: readonly Migration[] = [
  // v11 → v12：会社の規模・オフィスの固定費・AI Worker の一覧・チームと、案件の管理者の運営の記録（Phase 21）。最初の段階・直轄だけで始める
  {
    from: 11,
    migrate: (state) => {
      if (!isRecord(state) || !isRecord(state.projects)) return state;
      const projects = Object.fromEntries(
        Object.entries(state.projects).map(([id, p]) => [
          id,
          isRecord(p) ? { ...p, management: { minutes: 0, laborCost: 0, aiCost: 0 } } : p,
        ]),
      );
      return { ...state, projects, tier: 'solo', officeCost: 0, agents: ['agent'], teams: [] };
    },
  },
  // v12 → v13：長く遊ぶための記録（Phase 22）。格付けなし・累計の記録は空・期は次の営業日から数え始める・資金は開業資金から・
  // 実績なし・後半の事件なし。案件の運営の記録に、プレイヤーが担当を決めた数を足す（それまでの分は数えていないので、
  // 委任していない案件は1件とみなして「管理者だけで納品」に数えない）
  {
    from: 12,
    migrate: (state) => {
      if (!isRecord(state) || !isRecord(state.projects)) return state;
      const projects = Object.fromEntries(
        Object.entries(state.projects).map(([id, p]) => {
          if (!isRecord(p) || !isRecord(p.management)) return [id, p];
          const m = p.management;
          const managed = m.minutes !== 0 || m.aiCost !== 0;
          return [id, { ...p, management: { ...m, playerAssigned: managed ? 0 : 1 } }];
        }),
      );
      return {
        ...state,
        projects,
        rank: 0,
        eventCost: 0,
        ledger: createLedger(),
        fiscal: createFiscal(null),
        funds: createFunds(),
        achievements: [],
        companyEvents: { offers: [], priceWarUntil: null, outages: 0, poached: 0 },
      };
    },
  },
];

/** 変換できない古い形式のセーブデータ。タイトル画面で「以前のセーブは読み込めない」と知らせる */
export class OutdatedSaveError extends Error {
  constructor(readonly version: number) {
    super(`古い形式のセーブデータ（バージョン ${version} からのマイグレーションがない）`);
  }
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
 * 壊れたデータや未来のバージョンは例外にし、変換できない古いバージョンは OutdatedSaveError にする。
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
    if (!m) throw new OutdatedSaveError(version);
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
    isRecord(v.market) &&
    Array.isArray(v.market.candidates) &&
    typeof v.hireCost === 'number' &&
    typeof v.idleCost === 'number' &&
    (v.board === null || (isRecord(v.board) && Array.isArray(v.board.inquiries))) &&
    typeof v.reputation === 'number' &&
    typeof v.tier === 'string' &&
    typeof v.officeCost === 'number' &&
    Array.isArray(v.agents) &&
    Array.isArray(v.teams) &&
    typeof v.rank === 'number' &&
    typeof v.eventCost === 'number' &&
    isRecord(v.ledger) &&
    isRecord(v.fiscal) &&
    Array.isArray(v.fiscal.reports) &&
    isRecord(v.funds) &&
    Array.isArray(v.funds.samples) &&
    Array.isArray(v.achievements) &&
    isRecord(v.companyEvents) &&
    Array.isArray(v.companyEvents.offers) &&
    Array.isArray(v.library) &&
    Array.isArray(v.libraryUses)
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
