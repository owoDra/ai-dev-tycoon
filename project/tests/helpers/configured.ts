import { getProject } from '../../src/content/index';
import type { AssignModeId, ContextFeed } from '../../src/content/types';
import type { Command } from '../../src/core/commands';
import { deadlineMinutes } from '../../src/core/formulas';
import { scoreProject } from '../../src/core/scoring';
import { runHeadless } from './headless';
import type { PlayResult } from './strategies';

export const AGENT = 'agent';

/** 振り返り・寄与のテストで使うプレイの構成 */
export interface PlayConfig {
  readonly projectId: string;
  /** すべての Task の担当モード（AI Worker に任せる） */
  readonly mode: AssignModeId;
  readonly parts?: readonly string[];
  readonly modelId?: string;
  readonly feed?: ContextFeed;
}

/**
 * 案件を始め、すべての Task を同じモードで AI Worker に任せ、Model・部品・資料の渡し方を設定してから納期の4倍まで進める
 */
export function playConfigured(config: PlayConfig, seed: string): PlayResult {
  const { projectId } = config;
  const start: Command = { type: 'StartProject', projectId };
  const commands: Command[] = [
    start,
    ...getProject(projectId).tasks.map(
      (t): Command => ({ type: 'AssignTask', projectId, taskId: t.id, mode: config.mode, workerId: AGENT }),
    ),
    ...(config.modelId ? [{ type: 'SetModel', workerId: AGENT, modelId: config.modelId } as const] : []),
    ...(config.parts ?? []).map((partId): Command => ({ type: 'EquipPart', workerId: AGENT, partId })),
    ...(config.feed ? [{ type: 'SetContextFeed', workerId: AGENT, feed: config.feed } as const] : []),
  ];
  const result = runHeadless({
    seed,
    commands: commands.map((command) => ({ at: 0, command })),
    until: deadlineMinutes(getProject(projectId)) * 4,
  });
  const score = scoreProject(result.state, projectId);
  if (!score) throw new Error(`案件 ${projectId} が開始されていない`);
  return { ...result, score };
}
