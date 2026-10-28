import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type Rect, screenRegions, sheetHeightIn, uiLayout } from '../../src/content/look/layout';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { createCameraRig } from '../../src/world/camera';

/** 確かめる画面の大きさ（スマホ2つ・タブレット縦・狭い PC・広い PC） */
const SIZES = [
  { width: 375, height: 667, shape: 'phone' },
  { width: 390, height: 844, shape: 'phone' },
  { width: 768, height: 1024, shape: 'narrow' },
  { width: 1024, height: 768, shape: 'wide' },
  { width: 1440, height: 900, shape: 'wide' },
] as const;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (r: Rect, size: { width: number; height: number }) =>
  r.x >= 0 && r.y >= 0 && r.x + r.width <= size.width && r.y + r.height <= size.height;

describe('画面の領域（content/look/layout.ts の screenRegions）', () => {
  for (const size of SIZES) {
    describe(`${size.width}×${size.height}`, () => {
      const r = screenRegions(uiLayout, size);

      it(`形は ${size.shape}`, () => {
        expect(r.shape).toBe(size.shape);
      });

      it('上の帯・お知らせの列・3D の世界・ドックは互いに重ならず、画面の中に収まる', () => {
        const regions = { top: r.top, notices: r.notices, world: r.world, dock: r.dock };
        const entries = Object.entries(regions);
        for (const [name, rect] of entries) {
          expect(inside(rect, size), `${name} が画面からはみ出す`).toBe(true);
          expect(rect.width, `${name} の幅`).toBeGreaterThan(0);
          expect(rect.height, `${name} の高さ`).toBeGreaterThan(0);
        }
        for (const [i, [a, ra]] of entries.entries()) {
          for (const [b, rb] of entries.slice(i + 1)) {
            expect(overlaps(ra, rb), `${a} と ${b} が重なる`).toBe(false);
          }
        }
      });

      it('3D の世界の領域が一定の高さ以上残る', () => {
        expect(r.world.height).toBeGreaterThanOrEqual(uiLayout.minWorldHeight);
        expect(r.world.width).toBeGreaterThanOrEqual(r.shape === 'phone' ? size.width : size.width / 3);
      });

      it('シートは上の帯とドックの間に収まる', () => {
        expect(overlaps(r.sheet, r.top)).toBe(false);
        expect(overlaps(r.sheet, r.dock)).toBe(false);
        expect(sheetHeightIn(r, size.height)).toBeLessThanOrEqual(r.sheet.height);
        expect(sheetHeightIn(r, size.height)).toBeGreaterThan(0);
      });
    });
  }

  it('スマホではお知らせを上の帯の下に、PC では右端の列に置く', () => {
    const phone = screenRegions(uiLayout, { width: 375, height: 667 });
    expect(phone.notices.y).toBeGreaterThanOrEqual(phone.top.y + phone.top.height);
    expect(phone.world.y).toBeGreaterThanOrEqual(phone.notices.y + phone.notices.height);
    const pc = screenRegions(uiLayout, { width: 1440, height: 900 });
    expect(pc.notices.x).toBeGreaterThanOrEqual(pc.world.x + pc.world.width);
  });

  it('スマホのドックは2段（44px のボタン2段）が収まる高さで、画面幅いっぱい', () => {
    const phone = screenRegions(uiLayout, { width: 375, height: 667 });
    expect(phone.dock.height).toBeGreaterThanOrEqual(44 * 2);
    expect(phone.dock.height).toBeLessThan(44 * 3);
    expect(phone.dock.width).toBe(375);
  });

  it('形ごとにドックの項目・お知らせの最大件数・操作ボタンの出し方を決めている', () => {
    expect(uiLayout.compact.controls).toBe('dock');
    expect(uiLayout.narrow.controls).toBe('icons');
    expect(uiLayout.wide.controls).toBe('labeled');
    expect(uiLayout.compact.toast.max).toBeLessThanOrEqual(uiLayout.narrow.toast.max);
    expect(uiLayout.narrow.toast.max).toBeLessThanOrEqual(uiLayout.wide.toast.max);
    // 狭い画面ではドックの項目を減らし、減らした項目は「詳細」で開ける
    for (const form of [uiLayout.compact, uiLayout.narrow]) {
      expect(form.dock.items.length).toBeLessThan(uiLayout.wide.dock.items.length);
      for (const id of uiLayout.wide.dock.items) {
        expect([...form.dock.items, ...form.dock.details]).toContain(id);
      }
    }
  });

  it('とても低い画面でも、お知らせの帯を縮めて 3D の世界を残す', () => {
    const r = screenRegions(uiLayout, { width: 375, height: 560 });
    expect(r.world.height).toBeGreaterThanOrEqual(uiLayout.minWorldHeight);
    expect(overlaps(r.notices, r.world)).toBe(false);
  });
});

describe('カメラの構図（world/camera.ts の setFrame）', () => {
  it('案件全体を 3D の世界の領域に収め、その中心に映す', () => {
    const look = worldLooks[defaultWorldLookId].camera;
    const rig = createCameraRig(
      { ...look, zoomInitial: 1 },
      () => true,
      () => {},
    );
    const bounds = { minX: -6, maxX: 6, minZ: -4, maxZ: 4 };
    rig.setLayout({ bounds } as Parameters<typeof rig.setLayout>[0]);
    const size = { width: 375, height: 667 };
    rig.resize(size.width, size.height);
    const frame = screenRegions(uiLayout, size).world;
    rig.setFrame(frame);
    const toPx = (x: number, z: number) => {
      const p = new Vector3(x, 0, z).project(rig.camera);
      return { x: ((p.x + 1) / 2) * size.width, y: ((1 - p.y) / 2) * size.height };
    };
    for (const x of [bounds.minX, bounds.maxX]) {
      for (const z of [bounds.minZ, bounds.maxZ]) {
        const p = toPx(x, z);
        expect(p.x).toBeGreaterThanOrEqual(frame.x - 0.5);
        expect(p.x).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
        expect(p.y).toBeGreaterThanOrEqual(frame.y - 0.5);
        expect(p.y).toBeLessThanOrEqual(frame.y + frame.height + 0.5);
      }
    }
    const c = toPx(0, 0);
    expect(c.x).toBeCloseTo(frame.x + frame.width / 2, 0);
    expect(c.y).toBeCloseTo(frame.y + frame.height / 2, 0);
    rig.dispose();
  });
});
