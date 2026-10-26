import { Vector3 } from 'three';
import type { FxCue } from '../../fx/director';
import type { Actors } from '../actors';
import type { Vfx } from './index';
import type { Squash } from './squash';

/** world が演出の再生に貸すもの */
export interface CueTarget {
  vfx: Vfx;
  squash: Squash;
  actors: Actors | null;
  /** 島・キャラクターの足元。null（画面の中心の演出）のときは出口（納品の台） */
  groundOf(entityId: string | null): Vector3 | null;
  /** 島の大きさ（m）。輪や盾の大きさの基準 */
  islandSize: number;
  /** 表情を変えるキャラクター（actorId がない演出では全員） */
  actorIds(): readonly string[];
  shake(amplitudePx: number, durationMs: number): void;
  hitStop(durationMs: number, timeScale: number): void;
}

/** 島の持ち上げの高さ（m） */
const LIFT = 0.16;
/** 盾の大きさ（島の大きさに対する割合） */
const SHIELD = 0.62;

/**
 * 演出1回分を 3D の部品に割り振って再生する。DOM の部品（文字・フラッシュ）は ui/fx が受け持つので、ここでは何もしない。
 * パーティクルの数は feel の Tier の値にコンボの上乗せを掛け、world/vfx/particles.ts の上限で切り詰められる。
 */
export function playCue(cue: FxCue, target: CueTarget): void {
  const look = cue.feel.tiers[cue.tier];
  const boost = cue.intensity / Math.max(0.01, look.scale);
  const count = Math.round(look.particles * boost);
  const ms = cue.durationMs;
  const at = () => target.groundOf(cue.entityId) ?? new Vector3();
  const size = target.islandSize;
  const actors = cue.actorId ? [cue.actorId] : target.actorIds();

  for (const part of cue.parts) {
    switch (part) {
      case 'islandLift':
        target.squash.liftOnly(cue.entityId, LIFT * cue.intensity, cue.feel.motion.transition);
        break;
      case 'islandBounce':
        if (cue.entityId) target.squash.bounce(cue.entityId, cue.intensity, cue.feel.motion);
        break;
      case 'actorHop':
        for (const id of actors) target.actors?.react(id, { hop: 0.3 * cue.intensity });
        break;
      case 'actorExpression':
        if (cue.def.expression) {
          for (const id of actors) target.actors?.react(id, { expression: cue.def.expression, durationMs: ms });
        }
        break;
      case 'coinBurst':
        target.vfx.coinBurst(at(), count, Math.sqrt(cue.intensity));
        break;
      case 'confetti':
        target.vfx.confetti(at(), count, Math.sqrt(cue.intensity));
        break;
      case 'sparkle':
        target.vfx.sparkle(at(), Math.max(6, Math.round(count / 2)), size * 0.6);
        break;
      case 'ring':
        target.vfx.ring(at(), size * cue.intensity, ms * 0.6);
        break;
      case 'glow':
        target.vfx.glow(at(), size * 0.7, Math.max(400, ms * 0.6));
        break;
      case 'shield':
        target.vfx.shield(at(), size * SHIELD * cue.intensity, ms);
        break;
      case 'packetRush': {
        const exit = target.groundOf(null);
        if (exit) target.vfx.packetRush(at(), exit, Math.max(4, Math.round(count / 8)));
        break;
      }
      case 'rays':
        target.vfx.rays(at().add(new Vector3(0, 1, 0)), size * 1.6 * cue.intensity, ms);
        break;
      case 'cameraShake':
        target.shake(look.shakePx * cue.intensity, Math.min(ms, 600));
        break;
      case 'hitStop':
        target.hitStop(cue.feel.hitStop.durationMs, cue.feel.hitStop.timeScale);
        break;
      default:
        // DOM の部品（popLabel・bigType・flash など）は ui/fx/FxLayer が再生する
        break;
    }
  }
}
