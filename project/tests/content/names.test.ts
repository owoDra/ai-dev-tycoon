import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import { models } from '../../src/content/models';
import { staff } from '../../src/content/staff';
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

/** 実在の AI 企業・AI モデル・技術のブランド名。UI に出す名前にそのまま含めない（もじりにする） */
const REAL_BRANDS = [
  'Claude',
  'クロード',
  'Anthropic',
  'アンソロピック',
  'Haiku',
  'ハイク',
  'Sonnet',
  'ソネット',
  'Opus',
  'オーパス',
  'Fable',
  'OpenAI',
  'オープンAI',
  'GPT',
  'ChatGPT',
  'Gemini',
  'ジェミニ',
  'Google',
  'DeepSeek',
  'ディープシーク',
  'Mistral',
  'ミストラル',
  'Llama',
  'ラマ',
  'Qwen',
  'Grok',
  'グロック',
  'Cohere',
  'Hugging',
  'Rust',
  'TypeScript',
  'Python',
  'Docker',
  'Kubernetes',
  'GitHub',
];

/** UI に出す人と AI モデルと発注者の名前のすべて */
const uiNames = () => [
  ...ja.talent.surnames,
  ...ja.talent.givenNames,
  ...Object.values(ja.projectGen.clients).flat(),
  ...staff.map((h) => h.name),
  ...models.map((m) => m.name),
];

describe('架空の名前', () => {
  it('創業メンバーの名前に、よくある実在の名字を使わない（元ネタがすぐわかるもじりにする）', () => {
    expect(staff.map((h) => h.name).filter((n) => COMMON_SURNAMES.some((s) => n.includes(s)))).toEqual([]);
    expect(staff.map((h) => h.name)).toEqual([ja.workers.sato, ja.workers.suzuki]);
    expect(ja.workers.sato).toContain('安斗露 そね子');
    expect(ja.workers.suzuki).toContain('錆田 おぱ助');
  });

  it('人・AI モデル・発注者の名前に、実在のブランド名（Claude・Gemini・OpenAI など）をそのまま含めない', () => {
    expect(uiNames().filter((n) => REAL_BRANDS.some((b) => n.toLowerCase().includes(b.toLowerCase())))).toEqual([]);
  });

  it('AI モデル（軽量・標準・最上位）は、もじりの名前で互いに重ならない', () => {
    const names = models.map((m) => m.name);
    expect(names).toEqual([ja.models.lite, ja.models.standard, ja.models.frontier]);
    expect(new Set(names).size).toBe(names.length);
    expect(names.some((n) => n.includes('モデル'))).toBe(false);
  });

  it('人材の名字・名前に AI 企業・技術スタック・AI モデルのもじりを含み、創業メンバーと同じ名前にはならない', () => {
    for (const s of ['安斗露', '尾編', '字美仁', '錆田', '型野', '蛇川']) expect(ja.talent.surnames).toContain(s);
    for (const g of ['はいく', 'ふぇぶ子', 'じぇみ男', 'らま吉', 'くうぇん']) expect(ja.talent.givenNames).toContain(g);
    // 創業メンバーの下の名前は人材の名前に使わない（同じ名前の人が並ばない）
    expect(ja.talent.givenNames).not.toContain('そね子');
    expect(ja.talent.givenNames).not.toContain('おぱ助');
  });

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
