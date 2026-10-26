import { incidentModels } from '../../../../src/assets/catalog';
import type { VisualPreset } from '../../../../src/content/look/visual';
import type { IncidentId } from '../../../../src/content/types';
import { colorScales } from '../../../../src/styles/tokens';
import { bakeModel, type Part } from '../build';
import { box, capsule, cone, cylinder, groundAo, ring, sphere } from '../shapes';

/**
 * 事件の「バグ生物」（企画書19章：技術的な問題を敵として登場させる）。ポップでかわいく、怖くしない：
 * 丸い体・大きな白目・ほっぺ・短い足で共通の形にし、事件ごとに体の色と頭や背中の目印を変えて見分ける。
 * 高さは約 0.6m、原点は床の中心、正面は +Z。
 */

/** 体の大きさと中心の高さ */
const BODY = { r: 0.26, y: 0.3, squash: 0.85 };
/** 頭頂の高さ */
const TOP = BODY.y + BODY.r * BODY.squash;
/** ほっぺの色。パレットの外の値だが、どのプリセットでも同じにする */
const BLUSH = '#ff9eb5';

type Scales = ReturnType<typeof colorScales>;

/** 共通の体：丸い体・目・ほっぺ・口・足 */
function body(color: string, s: Scales): Part[] {
  const eyeY = BODY.y + 0.06;
  const front = BODY.r * 0.82;
  const parts: Part[] = [
    { geometry: sphere(BODY.r, 0, BODY.y, 0, BODY.squash, 14), color },
    { geometry: sphere(0.07, -0.12, 0.05, 0.04, 0.6, 8), color },
    { geometry: sphere(0.07, 0.12, 0.05, 0.04, 0.6, 8), color },
    {
      geometry: capsule(0.012, 0.04, 0, 0, 0)
        .rotateZ(Math.PI / 2)
        .translate(0, BODY.y - 0.06, front + 0.03),
      color: s.neutral[800],
    },
  ];
  for (const x of [-1, 1]) {
    parts.push({ geometry: sphere(0.075, x * 0.09, eyeY, front - 0.02, 1, 8), color: '#ffffff' });
    parts.push({ geometry: sphere(0.038, x * 0.09, eyeY - 0.005, front + 0.035, 1, 8), color: s.neutral[800] });
    parts.push({ geometry: sphere(0.013, x * 0.09 + 0.015, eyeY + 0.015, front + 0.07, 1, 6), color: '#ffffff' });
    parts.push({ geometry: sphere(0.04, x * 0.17, BODY.y - 0.04, front - 0.05, 0.6, 8), color: BLUSH });
  }
  return parts;
}

/** 頭のてっぺんの触角（先に玉） */
function antenna(x: number, tilt: number, color: string, tip: string): Part[] {
  const h = 0.16;
  const stalk = cylinder(0.012, 0.012, h, 0, h / 2, 0, 6)
    .rotateZ(tilt)
    .translate(x, TOP - 0.03, 0);
  return [
    { geometry: stalk, color },
    { geometry: sphere(0.035, x - Math.sin(tilt) * h, TOP - 0.03 + Math.cos(tilt) * h, 0, 1, 8), color: tip },
  ];
}

const builders: Record<IncidentId, (s: Scales) => Part[]> = {
  // 紙を頭に積みすぎて溢れている
  contextOverflow: (s) => [
    ...body(s.warning[400], s),
    ...[0, 1, 2, 3].map((i) => ({
      geometry: box(0.24, 0.035, 0.18, 0.01, 0, 0, 0)
        .rotateY(i * 0.3)
        .translate((i % 2 ? 0.02 : -0.02) * i, TOP + 0.02 + i * 0.045, 0),
      color: i % 2 ? s.neutral[100] : '#ffffff',
    })),
  ],
  // 古い仕様：くすんだ色に、頭の上の古い時計
  staleContext: (s) => [
    ...body(s.neutral[400], s),
    {
      geometry: cylinder(0.09, 0.09, 0.04, 0, 0, 0)
        .rotateX(Math.PI / 2)
        .translate(0, TOP + 0.06, 0),
      color: s.warning[700],
    },
    {
      geometry: cylinder(0.075, 0.075, 0.045, 0, 0, 0)
        .rotateX(Math.PI / 2)
        .translate(0, TOP + 0.06, 0.005),
      color: s.neutral[50],
    },
    { geometry: box(0.012, 0.06, 0.01, 0.004, 0, TOP + 0.08, 0.03), color: s.neutral[800] },
    { geometry: box(0.045, 0.012, 0.01, 0.004, 0.02, TOP + 0.06, 0.03), color: s.neutral[800] },
  ],
  // ルールの衝突：色の違う触角が左右反対を向く
  instructionConflict: (s) => [
    ...body(s.accent[400], s),
    ...antenna(-0.08, 0.6, s.neutral[800], s.primary[400]),
    ...antenna(0.08, -0.6, s.neutral[800], s.danger[400]),
  ],
  // 何度もやり直す：背中にぐるぐるの渦巻きの殻
  retrySpiral: (s) => [
    ...body(s.success[400], s),
    { geometry: ring(0.16, 0.05, 0, BODY.y + 0.06, -0.2, Math.PI * 2), color: s.warning[500] },
    { geometry: ring(0.1, 0.045, 0, BODY.y + 0.06, -0.24), color: s.warning[400] },
    { geometry: sphere(0.05, 0, BODY.y + 0.06, -0.26, 1, 8), color: s.warning[300] },
  ],
  // 目的から逸れる：ふわふわ浮く羽
  agentDrift: (s) => [
    ...body(s.primary[300], s),
    {
      geometry: sphere(0.13, 0, 0, 0, 0.35, 8)
        .rotateZ(-0.5)
        .translate(-0.24, BODY.y + 0.12, -0.08),
      color: '#ffffff',
    },
    {
      geometry: sphere(0.13, 0, 0, 0, 0.35, 8)
        .rotateZ(0.5)
        .translate(0.24, BODY.y + 0.12, -0.08),
      color: '#ffffff',
    },
  ],
  // 誰も確かめていない：はてなの形の触角
  missingValidation: (s) => [
    ...body(s.danger[300], s),
    {
      geometry: ring(0.06, 0.018, 0, 0, 0, Math.PI * 1.4)
        .rotateZ(-0.6)
        .translate(0.02, TOP + 0.14, 0),
      color: s.neutral[800],
    },
    { geometry: cylinder(0.018, 0.018, 0.06, 0, TOP + 0.05, 0, 8), color: s.neutral[800] },
  ],
  // Subagent 過多：小さな仲間がくっついている
  coordinationExplosion: (s) => [
    ...body(s.accent[300], s),
    ...[-1, 1].flatMap((x) => [
      { geometry: sphere(0.1, x * 0.3, 0.12, 0.05, 0.85, 8), color: s.primary[300] },
      { geometry: sphere(0.03, x * 0.3 - 0.03, 0.15, 0.13, 1, 8), color: '#ffffff' },
      { geometry: sphere(0.03, x * 0.3 + 0.03, 0.15, 0.13, 1, 8), color: '#ffffff' },
      { geometry: sphere(0.015, x * 0.3 - 0.03, 0.15, 0.155, 1, 6), color: s.neutral[800] },
      { geometry: sphere(0.015, x * 0.3 + 0.03, 0.15, 0.155, 1, 6), color: s.neutral[800] },
    ]),
  ],
  // 人間の確認待ち：頭の上の砂時計
  humanBottleneck: (s) => [
    ...body(s.danger[400], s),
    { geometry: cylinder(0.08, 0.08, 0.02, 0, TOP + 0.01, 0), color: s.warning[800] },
    { geometry: cone(0.065, 0.08, 0, TOP + 0.06, 0), color: s.accent[100] },
    {
      geometry: cone(0.065, 0.08, 0, 0, 0)
        .rotateX(Math.PI)
        .translate(0, TOP + 0.14, 0),
      color: s.accent[100],
    },
    { geometry: sphere(0.035, 0, TOP + 0.04, 0, 0.6, 8), color: s.warning[400] },
    { geometry: cylinder(0.08, 0.08, 0.02, 0, TOP + 0.19, 0), color: s.warning[800] },
  ],
};

export function buildIncidentBug(id: IncidentId, preset: VisualPreset) {
  return bakeModel(incidentModels[id], builders[id](colorScales(preset)), groundAo);
}
