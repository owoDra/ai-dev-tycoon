import { describe, expect, it } from 'vitest';
import { encodeResultCode } from '../../src/core/resultCode';
import { addErrorCorrection, dataCodewords, encodeQr, MAX_VERSION, qrPath } from '../../src/lib/qr';
import { readQr } from '../helpers/qrRead';

describe('QR コードの生成（lib/qr.ts）', () => {
  it('規格の例「HELLO WORLD」（1-M）のデータと誤り訂正の語が一致する', () => {
    const data = dataCodewords('HELLO WORLD', [], true, 1);
    expect(data).toEqual([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
    expect(addErrorCorrection(data ?? [], 1).slice(16)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('結果コードを英数字モードで入れ、別に組んだ読み取りで元の文字列に戻る', () => {
    const code = encodeResultCode({
      seed: 'PARTY-2026-01',
      projectId: 'corporateSite',
      profit: 820_000,
      profitPerPersonDay: 83_000,
      humanMinutes: 588,
      aiCost: 32_000,
      quality: 0.94,
      elapsedMinutes: 2_700,
      rank: 'S',
    });
    const qr = encodeQr(code);
    const read = readQr(qr);
    expect(read).toMatchObject({ text: code, level: 'M', mask: qr.mask, eccValid: true });
    expect(qr.version).toBeLessThanOrEqual(5);
  });

  it('文字数に応じてバージョンが上がり、どのバージョンでも読み戻せる（バイトモード・バージョン情報を含む）', () => {
    const versions = new Set<number>();
    for (const len of [1, 10, 25, 47, 80, 120, 150, 200, 260, 311]) {
      const text = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789-'.repeat(12).slice(0, len);
      const qr = encodeQr(text);
      expect(qr.size).toBe(qr.version * 4 + 17);
      expect(readQr(qr)).toMatchObject({ text, eccValid: true });
      versions.add(qr.version);
    }
    expect(Math.max(...versions)).toBeGreaterThanOrEqual(7);
    const japanese = encodeQr('結果コード：チームA');
    expect(readQr(japanese)).toMatchObject({ text: '結果コード：チームA', eccValid: true });
  });

  it('入りきらない長さは例外にする', () => {
    expect(() => encodeQr('A'.repeat(400))).toThrow(RangeError);
    expect(MAX_VERSION).toBe(10);
  });

  it('SVG のパスは暗いモジュールの数だけ正方形を描き、余白の分ずらす', () => {
    const qr = encodeQr('HELLO WORLD');
    const dark = qr.modules.flat().filter(Boolean).length;
    const path = qrPath(qr, 4);
    expect(path.match(/M/g)?.length).toBe(dark);
    expect(path.startsWith('M4 4h1v1h-1z')).toBe(true);
  });
});
