import { balance } from '../content/balance';
import { type Command, reduce } from './commands';
import { generatedProjectId } from './projectGen';
import { createInitialState, type GameState } from './state';

/*
 * 持ち寄りバトル（Phase 42。Phase 15 の結果コードに乗せる）。同じ合言葉を入れた人どうしが、同じ seed の案件1件を
 * 各自の持ち込みカードで遊び、結果コードの利益を比べる。会社（案件ボード）とは別の単発のプレイで、すべての機能を解放して始める
 * （持ち込みカードをすぐ Harness Builder で付けられる）。社員・案件・事件は seed だけで決まるので、違いは構成だけになる。
 */

/** 合言葉をそろえる（前後の空白を除き、英大文字・数字・ハイフンだけにして長さを切る）。空なら null */
export function battleWord(input: string): string | null {
  const word = input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z\d-]/g, '')
    .slice(0, balance.bring.battleWordLength);
  return word.length > 0 ? word : null;
}

/** 合言葉の seed */
export const battleSeed = (word: string) => `BATTLE-${word}`;

/** 合言葉の案件（seed から生成する案件） */
export const battleProjectId = (word: string) => generatedProjectId(battleSeed(word), balance.bring.battleSize);

/** 持ち寄りバトルを始めた state。seed から社員を生成し、持ち込みカードを選べるようにして、案件を始める */
export function createBattle(word: string, brought: readonly string[]): GameState {
  const commands: Command[] = [
    { type: 'SetBroughtParts', parts: brought },
    { type: 'StartProject', projectId: battleProjectId(word) },
  ];
  return commands.reduce((s, c) => reduce(s, c).state, createInitialState(battleSeed(word), { talent: true }));
}
