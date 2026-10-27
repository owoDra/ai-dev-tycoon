import { assignModes, primaryActor } from '../content/assignModes';
import { balance } from '../content/balance';
import { content, findWorker, getProject } from '../content/index';
import { libraryPresets } from '../content/library';
import type { FeatureId, LibraryWorkflowDef, WorkflowContext } from '../content/types';
import { modeFeature } from '../content/unlocks';
import { ja } from '../i18n/ja';
import { ByteReader, ByteWriter, openCode, sealCode } from '../lib/codec';
import { getSession, updateSession } from './context';
import { averageSkill } from './expectation';
import { equipPart, equippedParts, harnessOf, removePart, setModel } from './harness';
import { type GameState, updateTask } from './state';

/*
 * Workflow Library（企画書25章）。良い改善（AI Worker の構成と担当モードの組）を名前を付けて保存し、
 * 次の案件の Task に「適用」すると構成と担当がまとめて決まる。共有コードで他のチームと受け渡しできる。
 * 構成の効き方は Harness と同じ（core/harness.ts）で、ここは保存・適用・検証・実績の集計だけを受け持つ。
 */

/** 保存する前の Workflow（id は保存するときに決める） */
export type WorkflowDraft = Omit<LibraryWorkflowDef, 'id'>;

const CONTEXTS: readonly WorkflowContext[] = ['needed', 'all', 'router'];
const ROUTER = 'contextRouter';

/** 棚に並ぶ Workflow。同梱のプリセットの後に、保存した順 */
export function libraryWorkflows(state: GameState): readonly LibraryWorkflowDef[] {
  return [...libraryPresets, ...state.library];
}

export function findWorkflow(state: GameState, id: string): LibraryWorkflowDef | undefined {
  return libraryWorkflows(state).find((w) => w.id === id);
}

/** プリセットか（プリセットは同梱の資産なので、棚の上で区別して見せる） */
export const isPreset = (id: string) => libraryPresets.some((w) => w.id === id);

/** AI Worker の今の構成を、担当モードと組にして Workflow の下書きにする */
export function workflowFromWorker(
  state: GameState,
  workerId: string,
  mode: LibraryWorkflowDef['mode'],
  name: string,
): WorkflowDraft {
  const feed = getSession(state, workerId).feed.mode;
  const harness = harnessOf(state, workerId);
  return {
    name,
    mode,
    modelId: harness.modelId,
    context: feed === 'pick' ? 'needed' : feed,
    parts: harness.parts.filter((id) => id !== ROUTER),
  };
}

/** Workflow の中身の不備（スキーマの検証）。空なら正しい */
export type WorkflowProblem = 'name' | 'mode' | 'model' | 'context' | 'part' | 'duplicate' | 'group';

/** 共有コードから読んだ Workflow や保存する下書きを検証する。存在しない部品・モード・Model、同じ group の部品の重複を拒む */
export function validateWorkflow(w: WorkflowDraft): WorkflowProblem[] {
  const problems: WorkflowProblem[] = [];
  if (w.name.trim().length === 0 || [...w.name].length > balance.library.maxNameLength) problems.push('name');
  const mode = assignModes.find((m) => m.id === w.mode);
  if (!mode || primaryActor(mode) !== 'ai') problems.push('mode');
  if (!content.models.some((m) => m.id === w.modelId)) problems.push('model');
  if (!CONTEXTS.includes(w.context)) problems.push('context');
  const parts = w.parts.map((id) => content.harnessParts.find((p) => p.id === id));
  if (parts.some((p) => p === undefined || p.category === 'contextRouter')) problems.push('part');
  if (new Set(w.parts).size !== w.parts.length) problems.push('duplicate');
  const groups = parts.map((p) => p?.group).filter((g) => g !== undefined);
  if (new Set(groups).size !== groups.length) problems.push('group');
  return problems;
}

/** Workflow のうち、まだ解放されていない部品と機能（読み込み時の警告と、適用時に省くもの） */
export function lockedFeatures(state: GameState, w: WorkflowDraft): { parts: string[]; mode: boolean } {
  const unlocked = (f: FeatureId) => state.unlocked.includes(f);
  const parts = w.parts.filter((id) => {
    const part = content.harnessParts.find((p) => p.id === id);
    return !part || !unlocked(part.unlock);
  });
  const router = content.harnessParts.find((p) => p.id === ROUTER);
  if (w.context === 'router' && router && !unlocked(router.unlock)) parts.push(ROUTER);
  return { parts, mode: !unlocked(modeFeature(w.mode)) };
}

/** 保存した Workflow の次の id（custom1, custom2, ...） */
function nextId(state: GameState): string {
  const used = state.library.map((w) => Number(w.id.replace(/^custom/, ''))).filter(Number.isFinite);
  return `custom${Math.max(0, ...used) + 1}`;
}

/** Workflow を棚に保存する。不備があれば null */
export function saveWorkflow(state: GameState, draft: WorkflowDraft): { state: GameState; id: string } | null {
  const w = { ...draft, name: draft.name.trim() };
  if (validateWorkflow(w).length > 0) return null;
  const id = nextId(state);
  return { state: { ...state, library: [...state.library, { id, ...w }] }, id };
}

export interface ApplyTarget {
  readonly projectId: string;
  readonly taskId: string;
  readonly workerId: string;
}

/**
 * Workflow を Task に適用する。AI Worker の Model・資料の渡し方・部品を Workflow の構成に揃え（初めての部品は導入コストを払う）、
 * Task の担当を Workflow のモードにする。まだ解放されていない部品は付けずに skipped で返す。
 * 適用できなければ（Harness が未解放・Task が始まっている・モードが未解放）null
 */
export function applyWorkflow(
  state: GameState,
  w: LibraryWorkflowDef,
  target: ApplyTarget,
): { state: GameState; skipped: string[] } | null {
  const { projectId, taskId, workerId } = target;
  const unlocked = (f: FeatureId) => state.unlocked.includes(f);
  if (
    !unlocked('harness') ||
    !unlocked(modeFeature(w.mode)) ||
    findWorker(workerId)?.kind !== 'ai' ||
    state.projects[projectId]?.tasks[taskId]?.status !== 'waiting' ||
    validateWorkflow(w).length > 0
  ) {
    return null;
  }
  let next = setModel(state, workerId, w.modelId);
  const wanted = new Set([...w.parts, ...(w.context === 'router' ? [ROUTER] : [])]);
  for (const p of equippedParts(next, workerId)) {
    if (!wanted.has(p.id)) next = removePart(next, workerId, p.id);
  }
  const skipped: string[] = [];
  for (const id of wanted) {
    next = equipPart(next, workerId, id, (p) => unlocked(p.unlock));
    if (!equippedParts(next, workerId).some((p) => p.id === id)) skipped.push(id);
  }
  if (w.context !== 'router' && unlocked('context')) {
    next = updateSession(next, workerId, (s) => ({ ...s, feed: { mode: w.context as 'needed' | 'all' } }));
  }
  next = updateTask(next, projectId, taskId, (r) => ({ ...r, assignment: { mode: w.mode, workerId } }));
  const use = { workflowId: w.id, projectId, taskId, workerId, at: next.clock };
  const uses = next.libraryUses.filter((u) => u.projectId !== projectId || u.taskId !== taskId);
  return { state: { ...next, libraryUses: [...uses, use] }, skipped };
}

/** Workflow の実績（会社の資産としての働き） */
export interface WorkflowStats {
  /** 使った回数（適用した Task のうち、今もその担当のもの） */
  readonly uses: number;
  /** 削減した人間時間の累計（分）。完了した Task で、人間だけで作業した場合の見込みから実際の人間時間を引いた合計 */
  readonly savedHumanMinutes: number;
}

export function workflowStats(state: GameState, workflowId: string): WorkflowStats {
  const w = findWorkflow(state, workflowId);
  let uses = 0;
  let saved = 0;
  if (!w) return { uses, savedHumanMinutes: saved };
  const skill = averageSkill();
  for (const u of state.libraryUses) {
    if (u.workflowId !== workflowId) continue;
    const run = state.projects[u.projectId]?.tasks[u.taskId];
    if (run?.assignment?.mode !== w.mode || run.assignment.workerId !== u.workerId) continue;
    uses++;
    if (run.status !== 'done') continue;
    const task = getProject(u.projectId).tasks.find((t) => t.id === u.taskId);
    if (task) saved += task.effort / skill - run.humanMinutes;
  }
  return { uses, savedHumanMinutes: saved };
}

/*
 * 共有コード。[識別の印, 形式のバージョン, 名前, モード, Model, 資料の渡し方, 部品の数, 部品...] を
 * lib/codec.ts のチェックサム付き Base32 にする。部品はデータの並びではなく id で書くので、部品の並びが違うビルドでも読める
 */

/** 結果コードと見分けるための先頭の印（'W'） */
const WORKFLOW_CODE_MAGIC = 'W'.charCodeAt(0);
export const WORKFLOW_CODE_VERSION = 1;

/** 読み込みの失敗。format: 壊れている / checksum: 写し間違い / version: 別の形式 / invalid: 中身が不正（存在しない部品など） */
export type WorkflowCodeError = 'format' | 'checksum' | 'version' | 'invalid';

export type WorkflowCodeResult =
  | { readonly ok: true; readonly workflow: WorkflowDraft }
  | { readonly ok: false; readonly error: WorkflowCodeError };

export function encodeWorkflowCode(w: WorkflowDraft, version: number = WORKFLOW_CODE_VERSION): string {
  const out = new ByteWriter()
    .byte(WORKFLOW_CODE_MAGIC)
    .byte(version)
    .text(w.name)
    .text(w.mode)
    .text(w.modelId)
    .byte(CONTEXTS.indexOf(w.context))
    .uint(w.parts.length);
  for (const id of w.parts) out.text(id);
  return sealCode(out.bytes);
}

/** 共有コードを読む。区切り・空白・小文字は無視する。中身はスキーマを検証し、不正なら invalid */
export function decodeWorkflowCode(code: string): WorkflowCodeResult {
  const opened = openCode(code);
  if (!opened.ok) return opened;
  try {
    const r = new ByteReader(opened.bytes);
    if (r.byte() !== WORKFLOW_CODE_MAGIC) return { ok: false, error: 'format' };
    if (r.byte() !== WORKFLOW_CODE_VERSION) return { ok: false, error: 'version' };
    const name = r.text();
    const mode = r.text() as LibraryWorkflowDef['mode'];
    const modelId = r.text();
    const context = CONTEXTS[r.byte()];
    const count = r.uint();
    if (!context || count > content.harnessParts.length) return { ok: false, error: 'invalid' };
    const parts = Array.from({ length: count }, () => r.text());
    if (!r.done()) return { ok: false, error: 'format' };
    const workflow: WorkflowDraft = { name, mode, modelId, context, parts };
    return validateWorkflow(workflow).length > 0 ? { ok: false, error: 'invalid' } : { ok: true, workflow };
  } catch {
    return { ok: false, error: 'format' };
  }
}

/** 名前を付けずに保存したときの名前 */
export const defaultWorkflowName = (state: GameState) => ja.library.untitled(state.library.length + 1);
