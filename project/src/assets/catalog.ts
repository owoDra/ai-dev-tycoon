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
} as const satisfies Record<string, TextureAsset>;

export const modelAssets = {
  /** パイプライン確認用のデスク（Phase 05 でキャラクターや小物を足す） */
  desk: { file: 'desk.glb' },
} as const satisfies Record<string, { file: string }>;

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
