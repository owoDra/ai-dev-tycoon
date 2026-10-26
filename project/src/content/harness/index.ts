import type { HarnessCategory, HarnessPartDef } from '../types';
import { evalParts } from './evals';
import { hookParts } from './hooks';
import { permissionParts } from './permissions';
import { routerParts } from './router';
import { skillParts } from './skills';
import { subagentParts } from './subagents';
import { toolParts } from './tools';

/** Harness 部品の全一覧。新しい部品はカテゴリのファイルにデータを足すだけで増やせる */
export const harnessParts: readonly HarnessPartDef[] = [
  ...skillParts,
  ...hookParts,
  ...toolParts,
  ...permissionParts,
  ...evalParts,
  ...subagentParts,
  ...routerParts,
];

/** カテゴリの並び（Harness Builder の行の順とは別。データの検査と一覧に使う） */
export const harnessCategories: readonly HarnessCategory[] = [
  'skill',
  'hook',
  'tool',
  'permission',
  'eval',
  'subagent',
  'contextRouter',
];
