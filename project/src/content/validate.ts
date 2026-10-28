import type { Content } from './index';
import { projectTemplates as defaultTemplates } from './projectTemplates';
import { founders as defaultFounders } from './staff';
import type { ProjectDef, ProjectTemplateDef } from './types';

/**
 * ゲームデータの整合性を検査し、問題を文言の配列で返す（問題がなければ空配列）。
 * ID の重複・未定義の参照・依存グラフの循環・0〜1 であるべき値の範囲外を検出する。
 */
export function validateContent(
  c: Content,
  templates: readonly ProjectTemplateDef[] = defaultTemplates,
  founders: readonly string[] = defaultFounders,
): string[] {
  const errors: string[] = [];
  errors.push(
    ...duplicates(
      '案件',
      c.projects.map((p) => p.id),
    ),
  );
  errors.push(
    ...duplicates(
      'Worker',
      c.workers.map((w) => w.id),
    ),
  );
  errors.push(
    ...duplicates(
      'Model',
      c.models.map((m) => m.id),
    ),
  );
  errors.push(
    ...duplicates(
      '担当モード',
      c.assignModes.map((m) => m.id),
    ),
  );

  const modelIds = new Set(c.models.map((m) => m.id));
  for (const w of c.workers) {
    if (w.kind === 'ai' && !modelIds.has(w.modelId)) errors.push(`Worker ${w.id}: 未定義の Model ${w.modelId}`);
  }
  if (!c.workers.some((w) => w.kind === 'human')) errors.push('人間の Worker が1人もいない');
  for (const m of c.assignModes) {
    if (m.steps.length === 0) errors.push(`担当モード ${m.id}: 工程がない`);
  }
  for (const p of c.projects) errors.push(...validateProject(p));
  errors.push(...validateDocuments(c));
  errors.push(...validateHarness(c));
  errors.push(...validateTeam(c));
  errors.push(...validateTemplates(templates));
  const humanIds = new Set(c.workers.filter((w) => w.kind === 'human').map((w) => w.id));
  for (const id of founders) if (!humanIds.has(id)) errors.push(`創業メンバー: 未定義の社員 ${id}`);
  errors.push(...duplicates('創業メンバー', founders));
  return errors;
}

/** 社員の Seat と、AI Worker の運用者の参照を検査する */
function validateTeam(c: Content): string[] {
  const errors = duplicates(
    'Seat',
    c.seats.map((s) => s.id),
  );
  for (const w of c.workers) {
    if (w.kind === 'human' && !c.seats.some((s) => s.id === w.seat))
      errors.push(`Worker ${w.id}: 未定義の Seat ${w.seat}`);
    if (w.kind === 'ai' && w.operatorId !== undefined) {
      const op = c.workers.find((x) => x.id === w.operatorId);
      if (op?.kind !== 'human') errors.push(`Worker ${w.id}: 運用者 ${w.operatorId} が人間の Worker ではない`);
    }
  }
  return errors;
}

/** 案件の型の検査。業種があり、複製する Task と省く Task が型の中にあり、省いても Task が残る */
export function validateTemplates(templates: readonly ProjectTemplateDef[]): string[] {
  const errors = duplicates(
    '案件の型',
    templates.map((t) => t.id),
  );
  for (const t of templates) {
    const ids = new Set(t.tasks.map((x) => x.id));
    if (t.industries.length === 0) errors.push(`案件の型 ${t.id}: 業種がない`);
    for (const id of [...t.scales, ...t.optional]) {
      if (!ids.has(id)) errors.push(`案件の型 ${t.id}: 未定義の Task ${id}`);
    }
    if (t.optional.length >= t.tasks.length) errors.push(`案件の型 ${t.id}: 省くと Task が残らない`);
    if (t.scales.some((id) => t.optional.includes(id)))
      errors.push(`案件の型 ${t.id}: 複製する Task を省こうとしている`);
  }
  return errors;
}

/** Harness 部品の ID の重複と、group の部品どうしのカテゴリの一致（CLAUDE.md と Rules は同じとみなす）を検査する（値の範囲は tests/content/harness.test.ts） */
function validateHarness(c: Content): string[] {
  const errors = duplicates(
    'Harness 部品',
    c.harnessParts.map((p) => p.id),
  );
  // 同じルールのカードを CLAUDE.md に書くか Rules に分けるかは、カテゴリが違っても同じ group（どちらか1つ）
  const family = (category: string) => (category === 'rules' ? 'claudeMd' : category);
  for (const p of c.harnessParts) {
    const mates = c.harnessParts.filter((o) => p.group !== undefined && o.group === p.group);
    if (mates.some((o) => family(o.category) !== family(p.category))) {
      errors.push(`Harness 部品 ${p.id}: group のカテゴリが違う`);
    }
  }
  return errors;
}

/** 資料の ID の重複・未定義の案件や Task・矛盾の相手の参照・大きさを検査する */
function validateDocuments(c: Content): string[] {
  const errors = duplicates(
    '資料',
    c.documents.map((d) => d.id),
  );
  const docIds = new Set(c.documents.map((d) => d.id));
  for (const d of c.documents) {
    const project = c.projects.find((p) => p.id === d.projectId);
    if (!project) errors.push(`資料 ${d.id}: 未定義の案件 ${d.projectId}`);
    for (const t of d.relevantTo) {
      if (project && !project.tasks.some((x) => x.id === t)) errors.push(`資料 ${d.id}: 未定義の Task ${t}`);
    }
    for (const other of d.conflictsWith) {
      if (!docIds.has(other)) errors.push(`資料 ${d.id}: 未定義の矛盾の相手 ${other}`);
    }
    if (!(d.size > 0)) errors.push(`資料 ${d.id}: size が正でない`);
  }
  return errors;
}

export function validateProject(p: ProjectDef): string[] {
  const errors = duplicates(
    `案件 ${p.id} の Task`,
    p.tasks.map((t) => t.id),
  );
  if (p.tasks.length === 0) errors.push(`案件 ${p.id}: Task がない`);
  const ids = new Set(p.tasks.map((t) => t.id));
  for (const t of p.tasks) {
    for (const d of t.deps) {
      if (!ids.has(d)) errors.push(`案件 ${p.id} の Task ${t.id}: 未定義の依存 ${d}`);
    }
    for (const key of ['difficulty', 'aiAptitude', 'qualityReq', 'failRisk'] as const) {
      if (!(t[key] >= 0 && t[key] <= 1)) errors.push(`案件 ${p.id} の Task ${t.id}: ${key} が 0〜1 の範囲外`);
    }
    if (!(t.effort > 0)) errors.push(`案件 ${p.id} の Task ${t.id}: effort が正でない`);
    if (t.kind === undefined) errors.push(`案件 ${p.id} の Task ${t.id}: kind がない`);
  }
  const cycle = findCycle(p);
  if (cycle) errors.push(`案件 ${p.id}: 依存が循環している（${cycle.join(' → ')}）`);
  return errors;
}

function duplicates(label: string, ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup].map((id) => `${label}: ID ${id} が重複している`);
}

/** 深さ優先探索で循環を探し、見つかれば循環する ID の列（始点と終点が同じ）を返す */
function findCycle(p: ProjectDef): string[] | null {
  const deps = new Map(p.tasks.map((t) => [t.id, t.deps]));
  const done = new Set<string>();
  const path: string[] = [];
  const visit = (id: string): string[] | null => {
    const at = path.indexOf(id);
    if (at >= 0) return [...path.slice(at), id];
    if (done.has(id)) return null;
    path.push(id);
    for (const d of deps.get(id) ?? []) {
      const found = deps.has(d) ? visit(d) : null;
      if (found) return found;
    }
    path.pop();
    done.add(id);
    return null;
  };
  for (const t of p.tasks) {
    const found = visit(t.id);
    if (found) return found;
  }
  return null;
}

/** 起動時の検査。問題があれば例外にして、壊れたデータのまま遊べないようにする */
export function assertValidContent(c: Content): void {
  const errors = validateContent(c);
  if (errors.length > 0) throw new Error(`ゲームデータが不正:\n${errors.join('\n')}`);
}
