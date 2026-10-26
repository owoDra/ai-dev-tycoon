import { OrthographicCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { agentModels, humanModels, modelAssets } from '../../src/assets/catalog';
import { agentRoles, humanLooks, worldLooks } from '../../src/content/look/world';
import { getPath } from '../../src/dev/explore/tweak';
import { worldTweakGroups } from '../../src/dev/world/fields';
import { toScreen } from '../../src/world/project';
import { syncById } from '../../src/world/sync';

describe('syncById', () => {
  it('新しい ID は作り、続く ID は更新し、消えた ID は取り除く', () => {
    const objects = new Map<string, { v: number }>();
    const log: string[] = [];
    const handlers = {
      create: (view: { id: string; v: number }) => {
        log.push(`create ${view.id}`);
        return { v: view.v };
      },
      update: (o: { v: number }, view: { id: string; v: number }) => {
        o.v = view.v;
      },
      remove: (_o: { v: number }, id: string) => {
        log.push(`remove ${id}`);
      },
    };
    syncById(
      objects,
      [
        { id: 'a', v: 1 },
        { id: 'b', v: 1 },
      ],
      handlers,
    );
    syncById(
      objects,
      [
        { id: 'b', v: 2 },
        { id: 'c', v: 1 },
      ],
      handlers,
    );
    expect(log).toEqual(['create a', 'create b', 'create c', 'remove a']);
    expect([...objects.keys()]).toEqual(['b', 'c']);
    expect(objects.get('b')?.v).toBe(2);
  });
});

describe('toScreen', () => {
  it('ワールド座標をキャンバスの CSS ピクセルに変換する（中心は中央、範囲外は visible: false）', () => {
    const camera = new OrthographicCamera(-10, 10, 5, -5, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    expect(toScreen({ x: 0, y: 0, z: 0 }, camera, 800, 400)).toMatchObject({ x: 400, y: 200, visible: true });
    expect(toScreen({ x: 5, y: 2.5, z: 0 }, camera, 800, 400)).toMatchObject({ x: 600, y: 100, visible: true });
    expect(toScreen({ x: 20, y: 0, z: 0 }, camera, 800, 400).visible).toBe(false);
  });
});

describe('ワールドの見た目のプリセット', () => {
  it.each(Object.keys(worldLooks))('%s: 調整パネルの全項目が値を持つ', (id) => {
    const look = worldLooks[id as keyof typeof worldLooks];
    for (const field of worldTweakGroups.flatMap((g) => g.fields)) {
      expect(getPath(look, field.path), field.path).not.toBeUndefined();
    }
  });

  it('ズームの範囲が初期値を含む', () => {
    for (const look of Object.values(worldLooks)) {
      expect(look.camera.zoomMin).toBeLessThanOrEqual(look.camera.zoomInitial);
      expect(look.camera.zoomInitial).toBeLessThanOrEqual(look.camera.zoomMax);
    }
  });

  it('人間4種以上と Agent 4種のモデルがあり、キャラクターには顔の位置がある', () => {
    expect(humanLooks.length).toBeGreaterThanOrEqual(4);
    expect(agentRoles).toHaveLength(4);
    const characters = [...humanLooks.map((l) => humanModels[l]), ...agentRoles.map((r) => agentModels[r])];
    expect(new Set(characters).size).toBe(characters.length);
    for (const id of characters) expect(modelAssets[id]).toHaveProperty('face');
  });
});
