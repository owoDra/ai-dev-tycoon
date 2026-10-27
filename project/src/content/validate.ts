import { campaign as defaultCampaign } from './campaign';
import type { Content } from './index';
import type { CampaignDef, Condition, ProjectDef } from './types';

/**
 * ゲームデータの整合性を検査し、問題を文言の配列で返す（問題がなければ空配列）。
 * ID の重複・未定義の参照・依存グラフの循環・0〜1 であるべき値の範囲外を検出する。
 */
export function validateContent(c: Content, campaign: CampaignDef = defaultCampaign): string[] {
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
  errors.push(...validateCampaign(c, campaign));
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

/**
 * キャンペーンの参照と順序を検査する。案件・社員・条件の参照先が存在し、各案件は一度だけ現れ、
 * 段階の条件は前の段階までの案件だけを参照する（受注できない案件の納品を待つような矛盾がない）
 */
export function validateCampaign(c: Content, campaign: CampaignDef): string[] {
  const errors: string[] = [];
  const humanIds = new Set(c.workers.filter((w) => w.kind === 'human').map((w) => w.id));
  const projectIds = new Set(c.projects.map((p) => p.id));
  for (const id of campaign.team) if (!humanIds.has(id)) errors.push(`キャンペーン: 未定義の社員 ${id}`);
  errors.push(...duplicates('キャンペーンの最初の社員', campaign.team));
  const earlier: string[] = [];
  campaign.stages.forEach((stage, i) => {
    const label = `キャンペーンの段階 ${stage.id}`;
    if (i === 0 && stage.when.type !== 'start') errors.push(`${label}: 最初の段階は最初から受注できる必要がある`);
    if (stage.projects.length === 0) errors.push(`${label}: 案件がない`);
    for (const id of stage.projects) {
      if (!projectIds.has(id)) errors.push(`${label}: 未定義の案件 ${id}`);
      if (earlier.includes(id)) errors.push(`${label}: 案件 ${id} が2回現れる`);
    }
    errors.push(...conditionOrder(c, stage.when, earlier).map((e) => `${label}: ${e}`));
    earlier.push(...stage.projects);
  });
  errors.push(
    ...duplicates(
      'キャンペーンの段階',
      campaign.stages.map((s) => s.id),
    ),
  );
  return errors;
}

/** 条件が、前の段階までに受注できる案件だけを参照しているか */
function conditionOrder(c: Content, when: Condition, earlier: readonly string[]): string[] {
  switch (when.type) {
    case 'projectCompleted':
    case 'taskAssigned':
    case 'taskCompleted': {
      if (!earlier.includes(when.projectId)) return [`まだ受注できない案件 ${when.projectId} を待っている`];
      if (when.type === 'projectCompleted') return [];
      const project = c.projects.find((p) => p.id === when.projectId);
      return project?.tasks.some((t) => t.id === when.taskId) ? [] : [`未定義の Task ${when.projectId}/${when.taskId}`];
    }
    case 'projectsCompleted':
      return when.count > earlier.length ? [`前の段階までの案件は${earlier.length}件しかない`] : [];
    default:
      return [];
  }
}

/** Harness 部品の ID の重複と、group の部品どうしのカテゴリの一致を検査する（値の範囲は tests/content/harness.test.ts） */
function validateHarness(c: Content): string[] {
  const errors = duplicates(
    'Harness 部品',
    c.harnessParts.map((p) => p.id),
  );
  for (const p of c.harnessParts) {
    const mates = c.harnessParts.filter((o) => p.group !== undefined && o.group === p.group);
    if (mates.some((o) => o.category !== p.category)) errors.push(`Harness 部品 ${p.id}: group のカテゴリが違う`);
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

function validateProject(p: ProjectDef): string[] {
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
