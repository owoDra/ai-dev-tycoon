import { describe, expect, it } from 'vitest';
import { visualPresets } from '../../src/content/look/visual';
import { visualTweakGroups } from '../../src/dev/explore/d1/fields';
import { readHashParam, resolveVariant, writeHashParam } from '../../src/dev/explore/persist';
import { getPath, setPath } from '../../src/dev/explore/tweak';
import { parseDevFlags } from '../../src/dev/flags';

describe('parseDevFlags', () => {
  it('?dev= の値をカンマ区切り・複数指定で集める', () => {
    expect(parseDevFlags('?dev=tweak')).toEqual(new Set(['tweak']));
    expect(parseDevFlags('?dev=explore,tweak&x=1')).toEqual(new Set(['explore', 'tweak']));
    expect(parseDevFlags('?dev=a&dev=b')).toEqual(new Set(['a', 'b']));
    expect(parseDevFlags('')).toEqual(new Set());
  });
});

describe('選んだ案の保存（URL ハッシュ）', () => {
  it('ハッシュの key だけを読み書きし、他の key は残す', () => {
    expect(readHashParam('#d1=B&d2=A', 'd1')).toBe('B');
    expect(readHashParam('', 'd1')).toBeUndefined();
    expect(writeHashParam('#d2=A', 'd1', 'C')).toBe('#d2=A&d1=C');
    expect(writeHashParam('#d1=A', 'd1', 'B')).toBe('#d1=B');
  });

  it('ハッシュ → 保存値 → 既定値の順に、候補にある ID を選ぶ', () => {
    const ids = ['A', 'B', 'C'] as const;
    expect(resolveVariant(ids, 'B', 'C', 'A')).toBe('B');
    expect(resolveVariant(ids, 'Z', 'C', 'A')).toBe('C');
    expect(resolveVariant(ids, undefined, 'Z', 'A')).toBe('A');
  });
});

describe('調整パネルのパス操作', () => {
  const obj = { shape: { radius: 8, outline: { width: 2 } }, name: 'x' };

  it('getPath はドット区切りで値を読む', () => {
    expect(getPath(obj, 'shape.outline.width')).toBe(2);
    expect(getPath(obj, 'shape.missing.x')).toBeUndefined();
  });

  it('setPath は元を変えずに、その値だけを差し替えた複製を返す', () => {
    const next = setPath(obj, 'shape.outline.width', 4);
    expect(next.shape.outline.width).toBe(4);
    expect(next.shape.radius).toBe(8);
    expect(obj.shape.outline.width).toBe(2);
  });

  it('存在しないパスはエラーにする（綴りの誤りで値が増えないように）', () => {
    expect(() => setPath(obj, 'shape.radious', 1)).toThrow();
  });
});

describe('D1 の調整項目', () => {
  it('すべての項目が VisualPreset に存在し、種類と値の型が合っている', () => {
    for (const preset of Object.values(visualPresets)) {
      for (const field of visualTweakGroups.flatMap((g) => g.fields)) {
        const v = getPath(preset, field.path);
        if (field.kind === 'range') expect(typeof v, field.path).toBe('number');
        else if (field.kind === 'color') expect(v, field.path).toMatch(/^#[0-9a-f]{6}$/i);
        else expect(field.options, field.path).toContain(v);
      }
    }
  });
});
