import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import { generatedProjectId } from '../../src/core/projectGen';
import { ja } from '../../src/i18n/ja';

/** よくある名字（上位）。生成する人材の名前は、実在の人と重ならないようにこれらを使わない */
const COMMON_SURNAMES = [
  '佐藤',
  '鈴木',
  '高橋',
  '田中',
  '伊藤',
  '渡辺',
  '山本',
  '中村',
  '小林',
  '加藤',
  '吉田',
  '山田',
  '佐々木',
  '山口',
  '松本',
  '井上',
  '木村',
  '林',
  '斎藤',
  '清水',
  '山崎',
  '森',
  '池田',
  '橋本',
  '阿部',
  '石川',
  '山下',
  '中島',
  '石井',
  '小川',
  '前田',
  '岡田',
  '長谷川',
  '藤田',
  '後藤',
  '近藤',
  '村上',
  '遠藤',
  '青木',
  '坂本',
];

/** 実在の企業・ブランドでよく使われる語。発注者の名前に含めない */
const REAL_COMPANY_WORDS = [
  'トヨタ',
  'ソニー',
  'パナソニック',
  '日立',
  '東芝',
  '三菱',
  '三井',
  '住友',
  '大和',
  '朝日',
  '北斗',
  '三葉',
  '楽天',
  'ヤフー',
  'アマゾン',
  'グーグル',
  'アップル',
  'エクセル',
  'バックログ',
  'ニトリ',
  'ユニクロ',
  'セブン',
  'ローソン',
  'みずほ',
  'りそな',
  '日本郵',
  'NTT',
  'KDDI',
  'ソフトバンク',
  'メルカリ',
];

describe('架空の名前', () => {
  it('人材の名字に、よくある実在の名字を使わない', () => {
    expect(ja.talent.surnames.filter((s) => COMMON_SURNAMES.includes(s))).toEqual([]);
    expect(new Set(ja.talent.surnames).size).toBe(ja.talent.surnames.length);
    expect(new Set(ja.talent.givenNames).size).toBe(ja.talent.givenNames.length);
  });

  it('発注者の名前に、実在の企業・ブランドの語を含めない', () => {
    const clients = Object.values(ja.projectGen.clients).flat();
    expect(clients.filter((c) => REAL_COMPANY_WORDS.some((w) => c.includes(w)))).toEqual([]);
    expect(new Set(clients).size).toBe(clients.length);
  });

  it('生成した案件の名前は、発注者の架空の名前から作る', () => {
    const clients = Object.values(ja.projectGen.clients).flat();
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const name = getProject(generatedProjectId(seed, 'M')).name;
      expect(
        clients.some((c) => name.startsWith(c)),
        name,
      ).toBe(true);
    }
  });
});
