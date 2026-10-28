import { describe, expect, it } from 'vitest';
import { keyAction, nextIsland } from '../../src/ui/keyboard';

describe('キーボード操作の対応', () => {
  it('Esc は閉じる、Space は次の日へ、矢印キーは島の移動', () => {
    expect(keyAction({ key: 'Escape', target: null })).toEqual({ type: 'close' });
    expect(keyAction({ key: ' ', target: null })).toEqual({ type: 'nextDay' });
    expect(keyAction({ key: 'ArrowUp', target: null })).toEqual({ type: 'move', dir: 'up' });
    expect(keyAction({ key: 'a', target: null })).toBeNull();
    expect(keyAction({ key: 'ArrowUp', target: null, ctrlKey: true })).toBeNull();
  });
});

describe('nextIsland', () => {
  // 左上から右へ流れる配置：a → b → c、b の下に d
  const points = [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 100, y: 0 },
    { id: 'c', x: 200, y: 10 },
    { id: 'd', x: 110, y: 100 },
  ];

  it('何も選んでいなければ先頭', () => {
    expect(nextIsland(points, null, 'right')).toBe('a');
  });

  it('その方向にある、近くて横ずれの小さい島へ移る', () => {
    expect(nextIsland(points, 'a', 'right')).toBe('b');
    expect(nextIsland(points, 'b', 'right')).toBe('c');
    expect(nextIsland(points, 'b', 'down')).toBe('d');
    expect(nextIsland(points, 'd', 'up')).toBe('b');
    expect(nextIsland(points, 'c', 'left')).toBe('b');
  });

  it('その方向に島がなければ並び順で隣へ', () => {
    expect(nextIsland(points, 'c', 'right')).toBe('d');
    expect(nextIsland(points, 'a', 'left')).toBe('d');
  });
});
