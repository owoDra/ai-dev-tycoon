import { getAssignMode, primaryActor } from '../content/assignModes';
import { content, getHarnessPart, getModel } from '../content/index';
import type { AssignModeId, LibraryWorkflowDef } from '../content/types';
import { modeFeature } from '../content/unlocks';
import { type Command, reduce } from '../core/commands';
import {
  decodeWorkflowCode,
  encodeWorkflowCode,
  isPreset,
  libraryWorkflows,
  lockedFeatures,
  type WorkflowDraft,
  workflowStats,
} from '../core/library';
import type { GameState } from '../core/state';
import { MINUTES_PER_HOUR } from '../core/units';
import { isUnlocked } from '../core/unlocks';
import { ja } from '../i18n/ja';
import { hudView } from './hud';

/*
 * Workflow Library（企画書25章）の表示用データ（純粋関数）。棚の Workflow の構成・実績・共有コードと、
 * Task に適用するときの Command。Before → After の予測は Harness Builder と同じ view/harness.ts の harnessForecast で出す。
 */

const t = ja.library;

/** Workflow の構成を読める形にしたもの */
export interface WorkflowSummary {
  readonly name: string;
  readonly mode: string;
  readonly model: string;
  readonly context: string;
  readonly parts: readonly string[];
  /** まだ解放されていない部品・モードの名前（空なら警告なし） */
  readonly locked: readonly string[];
}

export interface LibraryEntryView extends WorkflowSummary {
  readonly id: string;
  readonly preset: boolean;
  readonly uses: number;
  /** 削減した人間時間の累計（h） */
  readonly savedHours: number;
  readonly code: string;
  /** Task に適用する Command。適用先がない・適用できない（モードが未解放）なら null */
  readonly apply: Command | null;
}

export interface LibraryTarget {
  readonly projectId: string;
  readonly taskId: string;
  readonly workerId: string;
}

export function summarize(state: GameState, w: WorkflowDraft): WorkflowSummary {
  const locked = lockedFeatures(state, w);
  return {
    name: w.name,
    mode: getAssignMode(w.mode).name,
    model: getModel(w.modelId).name,
    context: t.contexts[w.context],
    parts: w.parts.map((id) => getHarnessPart(id).name),
    locked: [
      ...(locked.mode ? [`${t.lockedMode}（${getAssignMode(w.mode).name}）`] : []),
      ...locked.parts.map((id) => getHarnessPart(id).name),
    ],
  };
}

function entry(state: GameState, w: LibraryWorkflowDef, target: LibraryTarget | null): LibraryEntryView {
  const stats = workflowStats(state, w.id);
  const runnable = target !== null && isUnlocked(state, modeFeature(w.mode));
  return {
    ...summarize(state, w),
    id: w.id,
    preset: isPreset(w.id),
    uses: stats.uses,
    savedHours: stats.savedHumanMinutes / MINUTES_PER_HOUR,
    code: encodeWorkflowCode(w),
    apply: runnable ? { type: 'ApplyLibraryWorkflow', workflowId: w.id, ...target } : null,
  };
}

export interface LibraryView {
  readonly presets: readonly LibraryEntryView[];
  readonly saved: readonly LibraryEntryView[];
}

/** 棚の一覧。target を渡すと、それぞれに Task へ適用する Command を付ける */
export function libraryView(state: GameState, target: LibraryTarget | null = null): LibraryView {
  const all = libraryWorkflows(state).map((w) => entry(state, w, target));
  return { presets: all.filter((e) => e.preset), saved: all.filter((e) => !e.preset) };
}

/** 共有コードの読み込みの結果。読めたら警告（未解放の部品）付きの要約と、ライブラリに追加する Command */
export type ImportView =
  | { readonly ok: true; readonly summary: WorkflowSummary; readonly command: Command }
  | { readonly ok: false; readonly message: string };

export function importPreview(state: GameState, code: string): ImportView {
  const result = decodeWorkflowCode(code);
  if (!result.ok) return { ok: false, message: t.importErrors[result.error] };
  return {
    ok: true,
    summary: summarize(state, result.workflow),
    command: { type: 'SaveLibraryWorkflow', workflow: result.workflow },
  };
}

/** Harness Builder から保存するときに選べる担当モード（AI が関わる、解放済みのモード） */
export function saveModes(state: GameState): readonly { id: AssignModeId; name: string }[] {
  return content.assignModes
    .filter((m) => primaryActor(m) === 'ai' && isUnlocked(state, modeFeature(m.id)))
    .map((m) => ({ id: m.id, name: m.name }));
}

/** 保存するときの担当モードの既定値。この案件でその AI Worker が最も多く担当しているモード（なければ AI → 人間レビュー） */
export function defaultSaveMode(state: GameState, projectId: string, workerId: string): AssignModeId {
  const counts = new Map<AssignModeId, number>();
  for (const run of Object.values(state.projects[projectId]?.tasks ?? {})) {
    if (run.assignment?.workerId === workerId) {
      counts.set(run.assignment.mode, (counts.get(run.assignment.mode) ?? 0) + 1);
    }
  }
  const modes = saveModes(state).map((m) => m.id);
  const best = [...counts].filter(([m]) => modes.includes(m)).sort((a, b) => b[1] - a[1])[0]?.[0];
  return best ?? (modes.includes('aiThenHumanReview') ? 'aiThenHumanReview' : (modes[0] ?? 'ai'));
}

/** Task の詳細に出すおすすめの Workflow */
export interface WorkflowPick {
  readonly id: string;
  readonly name: string;
  readonly apply: Command;
  /** 適用したときの、この案件の見込み利益の差（円。マイナスなら減る） */
  readonly profitDelta: number;
}

/**
 * Task に適用できる Workflow（未解放の部品を含まないもの）を、案件の見込み利益（view/hud.ts の projectedProfit）が増える順に limit 件まで。
 * 適用は AI Worker の構成ごと変え、部品の導入コストもかかるので、減るものも差のまま見せる（ほかの Task の見込みの変化も含める）
 */
export function recommendWorkflows(state: GameState, target: LibraryTarget, limit: number): readonly WorkflowPick[] {
  const now = hudView(state, target.projectId)?.projectedProfit ?? 0;
  const entries = libraryView(state, target);
  return [...entries.presets, ...entries.saved]
    .flatMap((e): WorkflowPick[] => {
      // まだ解放していない部品を含む Workflow は、適用しても部品が省かれて別物になるので勧めない
      if (!e.apply || e.locked.length > 0) return [];
      const after = hudView(reduce(state, e.apply).state, target.projectId)?.projectedProfit ?? now;
      return [{ id: e.id, name: e.name, apply: e.apply, profitDelta: after - now }];
    })
    .sort((a, b) => b.profitDelta - a.profitDelta)
    .slice(0, limit);
}
