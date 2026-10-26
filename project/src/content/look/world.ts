import type { ScaleName, ScaleStep } from '../../styles/tokens';

/**
 * 2.5D ワールドの見た目のプリセット（カメラ・陰影・アウトライン・キャラクター・流れ・ボトルネック・環境）。
 * 描画（src/world）はここから値を読み、実行中にプリセットを差し替えると再読み込みなしで反映する。
 * 配色は D1 の visual.ts のトークンから段階（`primary.200` など）で選ぶ。
 * 値は D2 で決めた「おもちゃ箱の工場」（docs/decisions/D2-world-look.md）。
 */

/** トークンの色の段階（`<スケール名>.<段階>`） */
export type ScaleRef = `${ScaleName}.${ScaleStep}`;

/** toon: MeshToonMaterial とグラデーションマップ / lambert: なめらかな陰影 */
export type ShadingMode = 'toon' | 'lambert';

export interface WorldCameraLook {
  /** 俯角（度）。水平から見下ろす角度 */
  elevationDeg: number;
  /** 水平方向の回転（度）。45 で正面の角から見る */
  azimuthDeg: number;
  /** 案件全体が収まる倍率を 1 としたときの、ズームの下限・上限・初期値 */
  zoomMin: number;
  zoomMax: number;
  zoomInitial: number;
  /** 島の外側へパンできる距離（m） */
  panMargin: number;
  /** ズームとパンのばね */
  stiffness: number;
  damping: number;
}

export interface WorldShadingLook {
  mode: ShadingMode;
  /** 環境光と太陽光の強さ */
  ambient: number;
  sun: number;
  /** 太陽の高さと向き（度） */
  sunElevationDeg: number;
  sunAzimuthDeg: number;
}

export interface WorldOutlineLook {
  enabled: boolean;
  /** 反転ハルを法線方向へ押し出す量（m） */
  thickness: number;
}

export interface WorldShadowLook {
  /** 接地影（blob shadow）の濃さ（0〜1）と、キャラクターの幅に対する大きさ */
  opacity: number;
  size: number;
}

export interface WorldCharacterLook {
  /** キャラクター全体の大きさと、縦の伸び（1 で生成したモデルのまま） */
  scale: number;
  stretch: number;
  /** 待機中の呼吸・作業中の上下動の大きさ（m） */
  bob: number;
  /** 作業中に前へ傾く角度（度） */
  tiltDeg: number;
  /** 喜びのジャンプのスカッシュ＆ストレッチの強さ（0〜1） */
  squash: number;
  /** 歩く速さ（m/秒、実時間） */
  walkSpeed: number;
  /** Task を終えたあとに喜ぶ時間（ゲーム内の分） */
  cheerMinutes: number;
}

export interface WorldFlowLook {
  /** パケットが1本のコンベアを渡り切るのにかかるゲーム内の分 */
  travelMinutes: number;
  /** パケットの大きさ（m）と光り方（0〜1） */
  packetSize: number;
  packetGlow: number;
  /** コンベアの上を動くパケットの弾み（m）と速さ（回/秒） */
  hop: number;
  hopHz: number;
  /** 島の前に積み上がるパケットの段の高さ（m） */
  stackSpacing: number;
  /** コンベアの部品の間隔（m） */
  segmentLength: number;
}

export interface WorldBottleneckLook {
  /** ボトルネックの大きさがこの分数に達したら強度 1 とする */
  fullMinutes: number;
  /** ボトルネックとして目立たせる強度の下限（0〜1） */
  threshold: number;
  /** 島の脈動の大きさ（拡大率）と速さ（回/秒） */
  pulseAmplitude: number;
  pulseHz: number;
  /** 赤みのリングの濃さ（0〜1） */
  ringOpacity: number;
  ringColor: ScaleRef;
  /** 島の前に積み上がったパケットの乱れ（ラジアン）。0 できれいに積む。散らかった山で詰まりを見せる */
  pileJitter: number;
}

export interface WorldEnvironmentLook {
  /** 島の一辺と厚み・島どうしの間隔（m） */
  islandSize: number;
  islandHeight: number;
  islandGap: number;
  /** 背景・床・島の色 */
  background: ScaleRef;
  floorTint: ScaleRef;
  islandTop: ScaleRef;
  islandDone: ScaleRef;
  /** 小物（観葉植物・サーバーラック）の密度（0〜1） */
  props: number;
}

export interface WorldLook {
  camera: WorldCameraLook;
  shading: WorldShadingLook;
  outline: WorldOutlineLook;
  shadow: WorldShadowLook;
  character: WorldCharacterLook;
  flow: WorldFlowLook;
  bottleneck: WorldBottleneckLook;
  environment: WorldEnvironmentLook;
}

/**
 * おもちゃ箱の工場（D2 で採用）：正アイソメトリック（約30°の俯角・45°の回転）、トゥーン調と反転ハルのアウトライン、
 * 大きな頭の2頭身、コンベアとパケット、散らかったパケットの山と床の赤いリング、昼のタイル床・壁なし・小物少なめ
 */
const standard: WorldLook = {
  camera: {
    elevationDeg: 30,
    azimuthDeg: 45,
    zoomMin: 0.8,
    zoomMax: 3,
    zoomInitial: 1,
    panMargin: 3,
    stiffness: 260,
    damping: 32,
  },
  shading: { mode: 'toon', ambient: 1.1, sun: 2.2, sunElevationDeg: 60, sunAzimuthDeg: 20 },
  outline: { enabled: true, thickness: 0.025 },
  shadow: { opacity: 0.32, size: 1.5 },
  character: { scale: 1.5, stretch: 1, bob: 0.04, tiltDeg: 8, squash: 0.18, walkSpeed: 2.2, cheerMinutes: 12 },
  flow: {
    travelMinutes: 20,
    packetSize: 0.4,
    packetGlow: 0.45,
    hop: 0.03,
    hopHz: 0.6,
    stackSpacing: 0.36,
    segmentLength: 0.5,
  },
  bottleneck: {
    fullMinutes: 240,
    threshold: 0.15,
    pulseAmplitude: 0.04,
    pulseHz: 1.2,
    ringOpacity: 0.55,
    ringColor: 'danger.400',
    pileJitter: 0.35,
  },
  environment: {
    islandSize: 3,
    islandHeight: 0.3,
    islandGap: 2.2,
    background: 'warning.50',
    floorTint: 'warning.100',
    islandTop: 'primary.100',
    islandDone: 'success.100',
    props: 0.35,
  },
};

export const worldLooks = { standard } as const satisfies Record<string, WorldLook>;

export type WorldLookId = keyof typeof worldLooks;

export const defaultWorldLookId: WorldLookId = 'standard';

/** 人間のキャラクターの見た目の種類（tools/assets/models/characters.ts で生成する） */
export type HumanLookId = 'bob' | 'cap' | 'glasses' | 'bun';

/** AI Agent の役割ごとの見た目（Research はアンテナとレンズ、Code はブラケットのバイザー、QA は盾の胸、Release はロケット） */
export type AgentRole = 'research' | 'code' | 'qa' | 'release';

export const humanLooks: readonly HumanLookId[] = ['bob', 'cap', 'glasses', 'bun'];
export const agentRoles: readonly AgentRole[] = ['research', 'code', 'qa', 'release'];

/** 人間の Worker の見た目。載っていない人は humanLooks を順に割り当てる */
export const humanLookByWorker: Readonly<Record<string, HumanLookId>> = {
  sato: 'bob',
  suzuki: 'glasses',
};

/** Task を担う AI Agent の見た目。載っていない Task は fallbackAgentRole */
export const agentRoleByTask: Readonly<Record<string, AgentRole>> = {
  hearing: 'research',
  requirements: 'research',
  research: 'research',
  uiDesign: 'code',
  implementation: 'code',
  qa: 'qa',
  release: 'release',
  // 決済画面の修正
  reproduce: 'research',
  spec: 'research',
  fix: 'code',
  tests: 'qa',
};

export const fallbackAgentRole: AgentRole = 'code';

/** 表情（顔のテクスチャアトラスのコマ）。並びはアトラスの左上から右へ、次に下の段 */
export const expressions = ['normal', 'focus', 'trouble', 'joy'] as const;
export type Expression = (typeof expressions)[number];
