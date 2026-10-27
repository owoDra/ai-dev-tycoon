import { describe, expect, it } from 'vitest';
import {
  buildFingerprint,
  decodeResultCode,
  encodeResultCode,
  RESULT_CODE_VERSION,
  type ResultRecord,
} from '../../src/core/resultCode';
import { resultRecord } from '../../src/view/result';
import { playConfigured } from '../helpers/configured';

const RECORD: ResultRecord = {
  seed: 'PARTY-2026-01',
  projectId: 'corporateSite',
  profit: -123_456,
  profitPerHumanHour: 83_210,
  humanMinutes: 588,
  aiCost: 32_400,
  quality: 0.94,
  elapsedMinutes: 2_712,
  rank: 'A',
};

/** Crockford Base32 の文字 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

describe('結果コード（core/resultCode.ts）', () => {
  it('エンコードしてデコードすると元に戻る（品質は 0.1% 単位）', () => {
    const code = encodeResultCode(RECORD);
    expect(decodeResultCode(code)).toEqual({ ok: true, record: RECORD, sameBuild: true });
    const odd = { ...RECORD, seed: 'チーム😀', quality: 0.98765, profit: 0.4, rank: 'S' as const };
    const back = decodeResultCode(encodeResultCode(odd));
    expect(back).toMatchObject({ ok: true, record: { ...odd, quality: 0.988, profit: 0 } });
  });

  it('紛らわしい文字を使わない、4文字区切りの短い英数字になる', () => {
    const code = encodeResultCode(RECORD);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{1,4}(-[0-9A-HJKMNP-TV-Z]{1,4})*$/);
    expect(code).not.toMatch(/[ILOU]/);
    expect(code.replace(/-/g, '').length).toBeLessThanOrEqual(64);
  });

  it('区切り・空白・小文字・I/L/O の読み替えを許す', () => {
    const code = encodeResultCode(RECORD);
    const sloppy = ` ${code.toLowerCase().replace(/-/g, ' ').replace(/1/g, 'l').replace(/0/g, 'o')} `;
    expect(decodeResultCode(sloppy)).toMatchObject({ ok: true, record: RECORD });
  });

  it('どの位置の1文字を変えても、チェックサム（か形式の検査）で検出できる', () => {
    const chars = encodeResultCode(RECORD).replace(/-/g, '');
    let changed = 0;
    for (let i = 0; i < chars.length; i++) {
      for (const c of ALPHABET) {
        if (c === chars[i]) continue;
        const tampered = chars.slice(0, i) + c + chars.slice(i + 1);
        const result = decodeResultCode(tampered);
        expect(result.ok, `${i}文字目を ${c} に`).toBe(false);
        changed++;
      }
    }
    expect(changed).toBe(chars.length * (ALPHABET.length - 1));
    // 本文の1文字を変えたものはチェックサムで弾かれる
    const first = chars[0] === 'A' ? 'B' : 'A';
    expect(decodeResultCode(first + chars.slice(1))).toEqual({ ok: false, error: 'checksum' });
  });

  it('文字の欠け・使えない文字は形式の誤りになる', () => {
    expect(decodeResultCode('')).toEqual({ ok: false, error: 'format' });
    expect(decodeResultCode('AB!C')).toEqual({ ok: false, error: 'format' });
    expect(decodeResultCode('UUUU')).toEqual({ ok: false, error: 'format' });
    const code = encodeResultCode(RECORD).replace(/-/g, '');
    expect(decodeResultCode(code.slice(0, -1)).ok).toBe(false);
  });

  it('形式のバージョン違いを検出できる', () => {
    const future = encodeResultCode(RECORD, { version: RESULT_CODE_VERSION + 1 });
    expect(decodeResultCode(future)).toEqual({ ok: false, error: 'version' });
  });

  it('内容（案件・バランス）の違うビルドで遊んだ結果は、読めるが同じビルドではないと分かる', () => {
    const other = encodeResultCode(RECORD, { build: (buildFingerprint() + 1) & 0xffff });
    expect(decodeResultCode(other)).toEqual({ ok: true, record: RECORD, sameBuild: false });
  });

  it('結果画面と同じスコア・ランクを書き出す', () => {
    const { state, score } = playConfigured({ projectId: 'corporateSite', mode: 'aiThenHumanReview' }, 'code');
    const record = resultRecord(state, 'corporateSite');
    expect(record).toMatchObject({
      seed: 'code',
      projectId: 'corporateSite',
      profit: score.profit,
      humanMinutes: score.humanMinutes,
      aiCost: score.aiCost,
      quality: score.quality,
    });
    const decoded = decodeResultCode(encodeResultCode(record as ResultRecord));
    expect(decoded).toMatchObject({
      ok: true,
      record: { profit: Math.round(score.profit), humanMinutes: Math.round(score.humanMinutes) },
    });
    expect(resultRecord(state, 'promoLp')).toBeNull();
  });
});
