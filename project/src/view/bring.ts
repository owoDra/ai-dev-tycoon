import { balance } from '../content/balance';
import { content } from '../content/index';
import { battleSeed, battleWord } from '../core/battle';
import { type BringCard, broughtPart, maxScore, parseBringPartId, strengthOf } from '../core/bring';
import { decodeResultCode, type ResultRecord } from '../core/resultCode';
import { ja } from '../i18n/ja';
import { type ModifierLine, modifierLines } from './harness';

/*
 * 持ち込みの画面の表示用データ（純粋関数）。カードの点・良かった点と伸ばすと強くなる点・「なぜこの性能？」の内訳と、
 * 持ち寄りバトルの結果の比較表を作る。
 */

const t = ja.bring;

export interface BringCardView {
  readonly id: string;
  readonly category: string;
  readonly name: string;
  readonly source: string;
  readonly score: number;
  readonly maxScore: number;
  readonly good: readonly string[];
  readonly grow: readonly string[];
  /** ゲームでの補正（効く仕事に） */
  readonly modifiers: readonly ModifierLine[];
  /** 「なぜこの性能？」：雛形・強さ・効く仕事・書いた量・負担・導入コストの順の説明 */
  readonly why: readonly string[];
}

/** カード1枚の表示 */
export function bringCardView(card: BringCard): BringCardView {
  const part = broughtPart(card.id);
  const spec = parseBringPartId(card.id);
  const template = content.harnessParts.find((p) => p.id === spec?.template);
  const max = maxScore(card.category);
  const why: string[] = [];
  if (template) why.push(t.whyLines.template(template.name));
  why.push(t.whyLines.strength(card.score, max, Math.round(strengthOf(card.score, card.category) * 100)));
  if (part) why.push(t.whyLines.kinds(part.appliesTo.map((k) => ja.harness.kinds[k]).join('・')));
  if (part?.timing) why.push(t.whyLines.timing(ja.harness.lane.shields[part.timing]));
  if (part?.size !== undefined && part.category === 'claudeMd') {
    why.push(t.whyLines.size(part.size, balance.harness.budgets.claudeMd));
  }
  why.push(t.whyLines.burden);
  if (part) why.push(t.whyLines.cost(part.installCost));
  return {
    id: card.id,
    category: t.categories[card.category],
    name: card.name,
    source: card.source,
    score: card.score,
    maxScore: max,
    good: card.checks.filter((c) => c.ok).map((c) => t.criteria[c.id].good),
    grow: card.checks.filter((c) => !c.ok).map((c) => t.criteria[c.id].grow),
    modifiers: part ? modifierLines(part.modifiers) : [],
    why,
  };
}

/** 比較表の1行 */
export interface BattleRow {
  readonly code: string;
  /** 読めたコードの記録（読めなければ null） */
  readonly record: ResultRecord | null;
  /** 1 から。読めない・合言葉が違うコードは null（順位を付けない） */
  readonly rank: number | null;
  /** 順位を付けない理由・注意（読めない・合言葉が違う・別の版） */
  readonly note: string | null;
  readonly cards: string;
}

/**
 * 持ち寄りバトルの比較表。貼り付けたコード（1行に1つ）を読み、合言葉が同じものを利益の大きい順に並べる。
 * 同じ利益は同じ順位。合言葉が違うコードと読めないコードは、順位を付けずに後ろに並べる
 */
export function battleBoard(text: string, wordInput: string): BattleRow[] {
  const word = battleWord(wordInput);
  const seed = word === null ? null : battleSeed(word);
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((code): BattleRow => {
      const r = decodeResultCode(code);
      if (!r.ok) return { code, record: null, rank: null, note: t.battle.bad, cards: '' };
      const cards = (r.record.brought ?? []).map((b) => t.battle.summary(t.categories[b.category], b.score));
      const sameSeed = seed === null || r.record.seed === seed;
      return {
        code,
        record: r.record,
        rank: null,
        note: !sameSeed ? t.battle.otherSeed : r.sameBuild ? null : t.battle.otherBuild,
        cards: cards.join('・') || t.battle.noCards,
      };
    });
  const ranked = rows
    .filter((r) => r.record !== null && r.note !== t.battle.otherSeed)
    .sort((a, b) => (b.record?.profit ?? 0) - (a.record?.profit ?? 0));
  const withRank = ranked.map((r) => ({
    ...r,
    rank: ranked.findIndex((x) => x.record?.profit === r.record?.profit) + 1,
  }));
  return [...withRank, ...rows.filter((r) => !ranked.includes(r))];
}
