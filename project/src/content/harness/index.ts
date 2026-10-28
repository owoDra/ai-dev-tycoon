import type { HarnessCategory, HarnessPartDef } from '../types';
import { evalParts } from './evals';
import { modParts, routineParts } from './extras';
import { hookParts } from './hooks';
import { mcpParts } from './mcp';
import { memoryParts } from './memory';
import { permissionParts } from './permissions';
import { routerParts } from './router';
import { skillParts } from './skills';
import { subagentParts, worktreeParts } from './subagents';

/** Harness 部品の全一覧。新しい部品はカテゴリのファイルにデータを足すだけで増やせる */
export const harnessParts: readonly HarnessPartDef[] = [
  ...memoryParts,
  ...skillParts,
  ...hookParts,
  ...mcpParts,
  ...subagentParts,
  ...worktreeParts,
  ...permissionParts,
  ...modParts,
  ...routineParts,
  ...evalParts,
  ...routerParts,
];

/** カテゴリの並び（Harness Builder の道の順とは別。データの検査と一覧に使う） */
export const harnessCategories: readonly HarnessCategory[] = [
  'claudeMd',
  'rules',
  'skill',
  'hook',
  'mcp',
  'subagent',
  'permission',
  'mod',
  'routine',
  'eval',
  'contextRouter',
];
