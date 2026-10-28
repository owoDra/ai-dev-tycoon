import { balance } from '../content/balance';
import { documents } from '../content/documents';
import { getIndustry, projectTemplates } from '../content/projectTemplates';
import type { ContractKind, DocumentDef, ProjectDef, ProjectSize, ProjectTemplateDef, TaskDef } from '../content/types';
import { ja } from '../i18n/ja';
import { hashSeed, next, pick, type RngState } from './rng';

/*
 * 案件の生成（案件ボードの引き合い）。案件の型（content/projectTemplates.ts）に業種と規模を掛け合わせ、
 * Task の数・作業量・品質要求・納期・価格と、発注者（性格・予算の上限）・競合の数を決める。
 * 定義は id から決定論的に再生成するので、state には id だけを持つ（content/index.ts の getProject が解決する）。
 * id は `p~<seed>~<size>`。
 */

const PREFIX = 'p~';
const SIZES: readonly ProjectSize[] = ['S', 'M', 'L', 'XL'];

/** 生成した案件の id か */
export const isGeneratedProjectId = (id: string) => id.startsWith(PREFIX);

/** seed と規模から案件の id を作る */
export function generatedProjectId(seed: string, size: ProjectSize): string {
  return `${PREFIX}${seed}~${size}`;
}

function parseId(id: string): { readonly seed: string; readonly size: ProjectSize } | undefined {
  if (!isGeneratedProjectId(id)) return undefined;
  const [seed = '', size] = id.slice(PREFIX.length).split('~');
  const found = SIZES.find((s) => s === size);
  return found ? { seed, size: found } : undefined;
}

const clamp01 = (v: number) => {
  const per = 1 / balance.talent.statStep;
  return Math.min(1, Math.max(0, Math.round(v * per) / per));
};
const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);

function uniform(rng: RngState, range: { readonly min: number; readonly max: number }): [number, RngState] {
  const [u, s] = next(rng);
  return [range.min + (range.max - range.min) * u, s];
}

/**
 * 規模に合わせて工程の形を変える。S では型の optional の Task を省き（依存していた Task はその依存を引き継ぐ）、
 * L 以上では scales の Task に並行する複製を足す（複製は元と同じ依存を持ち、元に依存していた Task はすべての複製を待つ）。
 * 依存関係は型の並び順に沿うので、型が非巡回なら結果も非巡回になる
 */
export function shapeTasks(template: ProjectTemplateDef, size: ProjectSize): { tasks: TaskDef[]; copies: number } {
  const def = balance.projectGen.sizes[size];
  let tasks: TaskDef[] = [...template.tasks];
  if (def.dropOptional) {
    for (const id of template.optional) {
      const dropped = tasks.find((t) => t.id === id);
      if (!dropped) continue;
      tasks = tasks
        .filter((t) => t.id !== id)
        .map((t) =>
          t.deps.includes(id)
            ? { ...t, deps: [...new Set(t.deps.flatMap((d) => (d === id ? dropped.deps : [d])))] }
            : t,
        );
    }
  }
  const copies = def.copies;
  if (copies === 0) return { tasks, copies };
  /** 元の Task と複製の id（複製は `<元の id>-<番号>`。番号は元を 1 として 2 から） */
  const copyIds = (id: string) => Array.from({ length: copies + 1 }, (_, i) => (i === 0 ? id : `${id}-${i + 1}`));
  const shaped = tasks.flatMap((t) => {
    const deps = t.deps.flatMap((d) => (template.scales.includes(d) ? copyIds(d) : [d]));
    if (!template.scales.includes(t.id)) return [{ ...t, deps }];
    return copyIds(t.id).map((id, i) => ({ ...t, id, deps, name: ja.projectGen.copy(t.name, i + 1) }));
  });
  return { tasks: shaped, copies };
}

const cache = new Map<string, ProjectDef>();
/** キャッシュに入れる。長く遊ぶと引き合いが増え続けるので、上限を超えたら捨てて作り直す */
function remember<T>(map: Map<string, T>, key: string, value: T): T {
  if (map.size >= balance.projectGen.cacheLimit) map.clear();
  map.set(key, value);
  return value;
}

/** 生成した案件の定義。同じ id なら必ず同じ定義になる。生成した案件の id でなければ undefined */
export function generateProject(id: string): ProjectDef | undefined {
  const parsed = parseId(id);
  if (!parsed) return undefined;
  const hit = cache.get(id);
  if (hit) return hit;
  const gen = balance.projectGen;
  const size = gen.sizes[parsed.size];
  const [template, s1] = pick(hashSeed(`project:${parsed.seed}`), projectTemplates);
  const [industryId, s2] = pick(s1, template.industries);
  // 以前のコンペの条件（発注者の性格・予算・競合の数）に使っていた乱数は、同じ案件を生成し続けるために読み飛ばす
  const [, s3] = next(s2);
  const [client, s4] = pick(s3, ja.projectGen.clients[industryId]);
  const [priceJitter, s5] = uniform(s4, gen.priceJitter);
  const [, s7] = next(next(s5)[1]);
  // 契約は別の乱数で決める（案件の中身の生成をずらさない）
  const [contractRoll] = uniform(hashSeed(`contract:${parsed.seed}`), { min: 0, max: 1 });
  const contract: ContractKind = contractRoll < balance.contract.strictShare ? 'strict' : 'lenient';
  const industry = getIndustry(industryId);
  const shaped = shapeTasks(template, parsed.size);
  let rng = s7;
  const tasks = shaped.tasks.map((t) => {
    const [jitter, s] = uniform(rng, gen.effortJitter);
    rng = s;
    const split = template.scales.some((id) => t.id === id || t.id.startsWith(`${id}-`)) ? shaped.copies + 1 : 1;
    return {
      ...t,
      effort: roundTo((t.effort * size.effort * jitter) / split, gen.effortStep),
      qualityReq: clamp01(t.qualityReq + industry.qualityReq + size.qualityReq),
      failRisk: clamp01(t.failRisk + industry.failRisk + size.failRisk),
      aiAptitude: clamp01(t.aiAptitude + industry.aiAptitude),
    };
  });
  const premium = contract === 'strict' ? balance.contract.strictPremium : 1;
  const revenue = roundTo(template.revenue * size.price * industry.price * priceJitter * premium, gen.priceStep);
  const def: ProjectDef = {
    id,
    name: ja.projectGen.name(client, template.name),
    revenue,
    deadlineDays: Math.max(1, Math.round(template.deadlineDays * size.deadline * gen.deadlineScale)),
    tasks,
    contract,
    brief: {
      templateId: template.id,
      industry: industryId,
      size: parsed.size,
      client,
    },
  };
  return remember(cache, id, def);
}

/**
 * 生成した案件の資料。型の資料（content/documents.ts の、型の id の案件の資料）を写し、id を `<案件の id>/<資料の id>` にする。
 * 役に立つ Task は、省いた Task を除き、複製した Task にはすべての複製を含める
 */
export function generatedDocuments(projectId: string): readonly DocumentDef[] {
  const hit = docCache.get(projectId);
  if (hit) return hit;
  return remember(docCache, projectId, buildDocuments(projectId));
}

const docCache = new Map<string, readonly DocumentDef[]>();

function buildDocuments(projectId: string): DocumentDef[] {
  const def = generateProject(projectId);
  if (!def?.brief) return [];
  const ids = new Set(def.tasks.map((t) => t.id));
  const expand = (taskId: string) =>
    def.tasks.map((t) => t.id).filter((id) => id === taskId || id.startsWith(`${taskId}-`));
  const docId = (id: string) => `${projectId}/${id}`;
  const templateId = def.brief.templateId;
  const scale = balance.projectGen.sizes[def.brief.size].docScale;
  return documents
    .filter((d) => d.projectId === templateId)
    .map((d) => ({
      ...d,
      size: Math.round(d.size * scale),
      id: docId(d.id),
      projectId,
      relevantTo: d.relevantTo.flatMap(expand).filter((id) => ids.has(id)),
      conflictsWith: d.conflictsWith.map(docId),
    }));
}
