import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { fxTierList } from '../../src/content/fx';
import { feelPresets } from '../../src/content/look/feel';
import { visual } from '../../src/content/look/visual';
import { createVfx } from '../../src/world/vfx/index';
import { PARTICLE_LIMITS, PARTICLE_TOTAL, type ParticleInit, ParticlePool } from '../../src/world/vfx/particles';
import { MAX_SHAKE_PX, shakeOffset } from '../../src/world/vfx/shake';

const particle = (over: Partial<ParticleInit> = {}): ParticleInit => ({
  x: 0,
  y: 0,
  z: 0,
  vx: 1,
  vy: 2,
  vz: 0,
  life: 1,
  size: 1,
  color: 0xffffff,
  ...over,
});

describe('world/vfx/particles', () => {
  it('プールの上限を超えて生成しない（超えた分は捨てて数える）', () => {
    const pool = new ParticlePool(8);
    const results = Array.from({ length: 20 }, () => pool.spawn(particle()));
    expect(pool.count).toBe(8);
    expect(results.filter(Boolean)).toHaveLength(8);
    expect(pool.dropped).toBe(12);
  });

  it('寿命が尽きたら取り除き、空いた分だけまた生成できる', () => {
    const pool = new ParticlePool(4);
    for (let i = 0; i < 4; i++) pool.spawn(particle({ life: i < 2 ? 0.5 : 2 }));
    pool.step(0.6);
    expect(pool.count).toBe(2);
    expect(pool.spawn(particle())).toBe(true);
    expect(pool.spawn(particle())).toBe(true);
    expect(pool.spawn(particle())).toBe(false);
  });

  it('速度と重力で動き、遅延中は見えない', () => {
    const pool = new ParticlePool(2);
    pool.spawn(particle({ vx: 2, vy: 0, gravity: 10, life: 5 }));
    pool.spawn(particle({ delay: 1, life: 5 }));
    pool.step(0.5);
    const seen: { x: number; y: number }[] = [];
    pool.forEach((p) => {
      seen.push({ x: p.x, y: p.y });
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.x).toBeCloseTo(1);
    expect(seen[0]?.y).toBeLessThan(0);
  });

  it('VFX にどれだけ大量に頼んでも、種類ごとの上限と合計の上限を超えない', () => {
    const vfx = createVfx(visual);
    const at = new Vector3();
    for (let i = 0; i < 10; i++) {
      vfx.coinBurst(at, 1000, 1);
      vfx.confetti(at, 1000, 1);
      vfx.sparkle(at, 1000, 1);
      vfx.packetRush(at, new Vector3(5, 0, 5), 1000);
    }
    vfx.frame(1 / 60, new OrthographicCamera());
    expect(vfx.particleCount()).toBeLessThanOrEqual(PARTICLE_TOTAL);
    const meshes = vfx.root.children.filter((c) => c.name.startsWith('vfx:'));
    for (const mesh of meshes) {
      const kind = mesh.name.slice('vfx:'.length) as keyof typeof PARTICLE_LIMITS;
      expect((mesh as unknown as { count: number }).count).toBeLessThanOrEqual(PARTICLE_LIMITS[kind]);
    }
    vfx.dispose();
  });

  it('上限は 60fps を保てる量に抑えてあり、手触りのプリセットの1回分は上限に収まる', () => {
    expect(PARTICLE_TOTAL).toBeLessThanOrEqual(1000);
    for (const feel of Object.values(feelPresets)) {
      for (const tier of fxTierList) expect(feel.tiers[tier].particles).toBeLessThanOrEqual(PARTICLE_LIMITS.confetti);
    }
  });

  it('カメラの揺れは振幅の上限を超えず、時間が過ぎたら止まる', () => {
    let max = 0;
    for (let t = 0; t < 600; t += 3) {
      const o = shakeOffset(t, 600, 1000);
      max = Math.max(max, Math.abs(o.x), Math.abs(o.y));
    }
    expect(max).toBeLessThanOrEqual(MAX_SHAKE_PX);
    expect(max).toBeGreaterThan(0);
    expect(shakeOffset(600, 600, 10)).toEqual({ x: 0, y: 0 });
  });
});
