import type { TermDef } from './types';

/**
 * 体験の後で名前を教える用語（企画書34章「体験 → 用語」）。選択肢は平易な言葉で出し、
 * その仕組みを使い終えた後で「これは〇〇と呼ばれる」と短いカードで知らせる。名前と説明は i18n の ja.glossary。
 */
export const glossary: readonly TermDef[] = [
  { id: 'delegation', reveal: { type: 'modeCompleted', mode: 'ai', count: 1 } },
  { id: 'humanInTheLoop', reveal: { type: 'modeCompleted', mode: 'aiThenHumanReview', count: 1 } },
  { id: 'eval', reveal: { type: 'modeCompleted', mode: 'aiThenEval', count: 1 } },
  { id: 'harnessEngineering', reveal: { type: 'projectsCompleted', count: 1 } },
  // 必要な資料だけを渡して AI が作業した後に
  { id: 'contextRouting', reveal: { type: 'contextStat', stat: 'routedWorks', count: 2 } },
  // Handoff を付けて Session を始め直した後に
  { id: 'sessionHandoff', reveal: { type: 'contextStat', stat: 'handoffResets', count: 1 } },
];
