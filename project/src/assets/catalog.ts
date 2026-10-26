import type { AgentRole, HumanLookId } from '../content/look/world';
import type { IncidentId } from '../content/types';

/**
 * 生成アセットの一覧（ID → `assets/generated/` のファイル）。ランタイムのレジストリ（registry.ts）と
 * 生成スクリプト（tools/assets）の両方がこれを読む。後から人が作った画像やモデルに差し替えるときは、
 * 同じ名前のファイルを置けばランタイムの読み込み側は変えなくてよい。
 */

export interface TextureAsset {
  /** ファイル名の元（`<base>@1x.webp` `<base>@2x.webp`） */
  base: string;
  /** 用意する解像度の倍率 */
  scales: readonly (1 | 2)[];
  /** sRGB の色として扱うか（グラデーションマップなどのデータは false） */
  srgb: boolean;
  /** 繰り返して敷き詰めるか（床・壁） */
  repeat: boolean;
  /** 拡大縮小で補間しない（トゥーンのグラデーションマップは段をくっきり残す） */
  nearest: boolean;
}

export const textureAssets = {
  /** タイトル画面のキービジュアル */
  titleKey: { base: 'title-key', scales: [1, 2], srgb: true, repeat: false, nearest: false },
  /** 結果画面の背景 */
  resultBg: { base: 'result-bg', scales: [1, 2], srgb: true, repeat: false, nearest: false },
  /** 床のテクスチャ（敷き詰める） */
  floor: { base: 'floor', scales: [1, 2], srgb: true, repeat: true, nearest: false },
  /** 壁のテクスチャ（敷き詰める） */
  wall: { base: 'wall', scales: [1, 2], srgb: true, repeat: true, nearest: false },
  /** トゥーン調の matcap */
  matcapToon: { base: 'matcap-toon', scales: [1, 2], srgb: true, repeat: false, nearest: false },
  /** MeshToonMaterial のグラデーションマップ（段の数だけの幅しかないため 1x のみ） */
  toonGradient: { base: 'toon-gradient', scales: [1], srgb: false, repeat: false, nearest: true },
  /** キャラクターの表情のアトラス（2×2 のコマ。並びは content/look/world.ts の expressions） */
  faceAtlas: { base: 'face-atlas', scales: [1], srgb: true, repeat: false, nearest: false },
  /** 接地影（blob shadow）。白い円のぼかしで、アルファだけを使う */
  blobShadow: { base: 'blob-shadow', scales: [1], srgb: false, repeat: false, nearest: false },
} as const satisfies Record<string, TextureAsset>;

/** キャラクターの顔を貼る位置（モデルの原点からの高さと前方への距離、顔の一辺。単位は m） */
export interface FaceAnchor {
  y: number;
  z: number;
  size: number;
}

export interface ModelAsset {
  file: string;
  /** 表情のアトラスを貼るキャラクターだけが持つ */
  face?: FaceAnchor;
}

/** 人間（大きな頭の2頭身）の顔の位置 */
const humanFace: FaceAnchor = { y: 0.84, z: 0.335, size: 0.42 };

/**
 * 手続き生成するモデル（tools/assets/models）。単位は m、原点は床の中心、+Y が上、キャラクターの正面は +Z。
 * 人間は大きな頭の2頭身で、髪型・服の色・小物で見分ける。Agent はボディの形で見分ける。
 */
export const modelAssets = {
  /** 島に置くデスク（モニター・キーボード付き） */
  desk: { file: 'desk.glb' },
  /** 人間：ボブヘア・ピンクの服 */
  humanBob: { file: 'human-bob.glb', face: humanFace },
  /** 人間：キャップ・黄色の服・名札 */
  humanCap: { file: 'human-cap.glb', face: humanFace },
  /** 人間：短髪・メガネ・青緑の服・ネクタイ */
  humanGlasses: { file: 'human-glasses.glb', face: humanFace },
  /** 人間：お団子・ヘッドホン・オレンジの服 */
  humanBun: { file: 'human-bun.glb', face: humanFace },
  /** Agent（Research）：縦長のカプセル・アンテナ・レンズ */
  agentResearch: { file: 'agent-research.glb', face: { y: 0.8, z: 0.235, size: 0.3 } },
  /** Agent（Code）：角丸の箱・ブラケット状のバイザー */
  agentCode: { file: 'agent-code.glb', face: { y: 0.6, z: 0.265, size: 0.32 } },
  /** Agent（QA）：幅の広いボディ・盾の形の胸部 */
  agentQa: { file: 'agent-qa.glb', face: { y: 0.84, z: 0.215, size: 0.28 } },
  /** Agent（Release）：卵形のボディ・背中のロケット */
  agentRelease: { file: 'agent-release.glb', face: { y: 0.6, z: 0.26, size: 0.28 } },
  /** 案件の状況を映す大きなモニター（休憩所に置く） */
  monitor: { file: 'monitor.glb' },
  /** コンベアの部品（+Z 方向へ 0.5m の1区間） */
  conveyor: { file: 'conveyor.glb' },
  /** 仕事の小包（パケット）。一辺 1m で作り、描画時に縮める */
  packet: { file: 'packet.glb' },
  /** 観葉植物 */
  plant: { file: 'plant.glb' },
  /** サーバーラック */
  serverRack: { file: 'server-rack.glb' },
  /** 事件の「バグ生物」（tools/assets/models/incidents）。丸い体と大きな目で、事件ごとに色と目印が違う */
  bugContextOverflow: { file: 'bug-context-overflow.glb' },
  bugStaleContext: { file: 'bug-stale-context.glb' },
  bugInstructionConflict: { file: 'bug-instruction-conflict.glb' },
  bugRetrySpiral: { file: 'bug-retry-spiral.glb' },
  bugAgentDrift: { file: 'bug-agent-drift.glb' },
  bugMissingValidation: { file: 'bug-missing-validation.glb' },
  bugCoordinationExplosion: { file: 'bug-coordination-explosion.glb' },
  bugHumanBottleneck: { file: 'bug-human-bottleneck.glb' },
} as const satisfies Record<string, ModelAsset>;

/** 人間の見た目の種類 → モデル */
export const humanModels = {
  bob: 'humanBob',
  cap: 'humanCap',
  glasses: 'humanGlasses',
  bun: 'humanBun',
} as const satisfies Record<HumanLookId, ModelId>;

/** AI Agent の役割 → モデル */
export const agentModels = {
  research: 'agentResearch',
  code: 'agentCode',
  qa: 'agentQa',
  release: 'agentRelease',
} as const satisfies Record<AgentRole, ModelId>;

/** 事件 → バグ生物のモデル */
export const incidentModels = {
  contextOverflow: 'bugContextOverflow',
  staleContext: 'bugStaleContext',
  instructionConflict: 'bugInstructionConflict',
  retrySpiral: 'bugRetrySpiral',
  agentDrift: 'bugAgentDrift',
  missingValidation: 'bugMissingValidation',
  coordinationExplosion: 'bugCoordinationExplosion',
  humanBottleneck: 'bugHumanBottleneck',
} as const satisfies Record<IncidentId, ModelId>;

export type TextureId = keyof typeof textureAssets;
export type ModelId = keyof typeof modelAssets;

export function textureFile(id: TextureId, scale: 1 | 2): string {
  return `${textureAssets[id].base}@${scale}x.webp`;
}

/** カタログが指す生成物のファイル名をすべて返す */
export function generatedFiles(): string[] {
  const textures = Object.entries(textureAssets).flatMap(([id, a]) =>
    a.scales.map((s) => textureFile(id as TextureId, s)),
  );
  return [...textures, ...Object.values(modelAssets).map((m) => m.file)];
}
