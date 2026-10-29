import { balance } from '../content/balance';
import {
  type BringCategory,
  type BringCriterionId,
  bringCategories,
  bringCheckWords,
  bringCommandWords,
  bringCriteria,
  bringDangerousAllows,
  bringFailWords,
  bringHookEvents,
  bringIgnoredDirs,
  bringKindWords,
  bringSecretFiles,
  bringSecretPatterns,
  bringTemplates,
  bringWhenWords,
} from '../content/bring';
import { harnessParts } from '../content/harness/index';
import type { HarnessModifierKey, HarnessModifiers, HarnessPartDef, HookTiming, TaskKind } from '../content/types';
import { shortHash } from '../lib/codec';

/*
 * 持ち込み（Phase 42）。プレイヤーが普段使っている Claude Code の設定（Skill・Subagent・Hook・権限・MCP・CLAUDE.md・Rules）を
 * 読み込み、書き方の良さを観点ごとに点にして、ゲームの Harness 部品（持ち込みカード）にする。純粋関数で、同じ入力からは同じ結果を返す。
 * 読み込んだ中身はテキストとして扱うだけで、実行も HTML としての描画もしない。秘密に見える文字列のあるファイルはカードにしない。
 *
 * 持ち込みカードの部品は、生成した案件（core/projectGen.ts）と同じく id に性能を書き込み、id から再生成する
 * （`x~雛形~タイミング~点~種類~書いた量~指紋~名前`）。セーブ・Workflow の共有コード・結果コードには id だけが入り、中身は入らない。
 */

/** 読み込むファイル1つ（path は選んだフォルダや zip の中のパス） */
export interface BringFile {
  readonly path: string;
  readonly text: string;
}

/**
 * 読み込まなかった理由。notTarget: 読む対象のファイルではない / secretFile: 秘密が入っていそうな名前（.env など。中身は読まない）/
 * secret: 秘密に見える文字列があった（保存しない）/ tooLarge: 大きすぎる / tooMany: 数か合計の大きさが上限を超えた /
 * unreadable: JSON などとして読めない / unusedHook: ゲームの作業の流れに効かないイベントの Hook
 */
export type BringSkipReason =
  | 'notTarget'
  | 'secretFile'
  | 'secret'
  | 'tooLarge'
  | 'tooMany'
  | 'unreadable'
  | 'unusedHook';

export interface BringSkip {
  readonly path: string;
  readonly reason: BringSkipReason;
  /** secret なら見つけた形の種類（content/bring.ts の bringSecretPatterns の kind）、unusedHook ならイベント名 */
  readonly detail?: string;
}

/**
 * カードの元の中身。プラグインの書き出し（core/pluginExport.ts）で、ゲームの評価で書き換えずにそのまま戻す。
 * file: ファイルの丸ごと / hook: settings.json か hooks.json の hooks のイベントの1件 / permissions: settings.json の permissions /
 * mcp: .mcp.json の mcpServers
 */
export type BringOrigin =
  | { readonly kind: 'file'; readonly path: string; readonly text: string }
  | { readonly kind: 'hook'; readonly event: string; readonly entry: unknown }
  | { readonly kind: 'permissions'; readonly value: unknown }
  | { readonly kind: 'mcp'; readonly servers: Readonly<Record<string, unknown>> };

export interface BringCheck {
  readonly id: BringCriterionId;
  readonly ok: boolean;
  readonly weight: number;
}

/** 持ち込みカード。id は Harness 部品の id（broughtPart で部品に戻せる） */
export interface BringCard {
  readonly id: string;
  readonly category: BringCategory;
  readonly name: string;
  /** 元のファイルのパス（設定ファイルの一部なら、その場所を # の後ろに書く） */
  readonly source: string;
  /** 点（観点の配点の合計。0〜100） */
  readonly score: number;
  readonly checks: readonly BringCheck[];
  readonly kinds: readonly TaskKind[];
  readonly timing?: HookTiming;
  readonly origin: BringOrigin;
}

export interface BringResult {
  readonly cards: readonly BringCard[];
  readonly skipped: readonly BringSkip[];
  /** plugin.json の name（プラグインを読み込んだとき） */
  readonly plugin: string | null;
}

/** 読むファイルの種類 */
type Target = 'skill' | 'agent' | 'settings' | 'mcp' | 'claudeMd' | 'rules' | 'plugin' | 'hooks';

const ALL_KINDS = Object.keys(bringKindWords) as TaskKind[];
const PREFIX = 'x~';
const NO_TIMING = '-';
const bytesOf = (text: string) => new TextEncoder().encode(text).length;

/** パスの区切りを / にそろえ、先頭の ./ と / を取る */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

function targetOf(path: string): Target | null {
  if (path.split('/').some((seg) => bringIgnoredDirs.includes(seg))) return null;
  const base = baseName(path);
  if (base === 'SKILL.md') return 'skill';
  if (/(^|\/)agents\/[^/]+\.md$/.test(path)) return 'agent';
  if (base === 'settings.json') return 'settings';
  if (base === '.mcp.json') return 'mcp';
  if (base === 'CLAUDE.md') return 'claudeMd';
  if (/(^|\/)rules\/[^/]+\.md$/.test(path)) return 'rules';
  if (base === 'plugin.json') return 'plugin';
  if (base === 'hooks.json') return 'hooks';
  return null;
}

/**
 * 中身を読む前の判定（ファイルの選択・zip の目次で使う）。読むなら null、読まないなら理由。
 * 秘密が入っていそうな名前のファイル（.env など）は、読まずに知らせる
 */
export function screenPath(rawPath: string, size: number): BringSkipReason | null {
  const path = normalizePath(rawPath);
  if (bringSecretFiles.some((re) => re.test(path))) return 'secretFile';
  if (targetOf(path) === null) return 'notTarget';
  if (size > balance.bring.limits.fileBytes) return 'tooLarge';
  return null;
}

/** 秘密に見える文字列の種類（なければ null） */
export function findSecret(text: string): string | null {
  return bringSecretPatterns.find((s) => s.pattern.test(text))?.kind ?? null;
}

/**
 * 読み込んだファイルを評価して、持ち込みカードにする。パスの順に並べ替えてから読むので、渡す順に関わらず同じ結果になる。
 * 読む対象でないファイル・秘密に見える文字列のあるファイル・上限を超えた分は skipped に入れ、カードにも中身にも残さない
 */
export function readBring(files: readonly BringFile[]): BringResult {
  const { limits } = balance.bring;
  const sorted = files
    .map((f) => ({ path: normalizePath(f.path), text: f.text }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const skipped: BringSkip[] = [];
  const cards: BringCard[] = [];
  let plugin: string | null = null;
  let count = 0;
  let total = 0;
  for (const f of sorted) {
    const size = bytesOf(f.text);
    const reason = screenPath(f.path, size);
    if (reason) {
      if (reason !== 'notTarget') skipped.push({ path: f.path, reason });
      continue;
    }
    if (count + 1 > limits.files || total + size > limits.totalBytes) {
      skipped.push({ path: f.path, reason: 'tooMany' });
      continue;
    }
    count++;
    total += size;
    const secret = findSecret(f.text);
    if (secret) {
      skipped.push({ path: f.path, reason: 'secret', detail: secret });
      continue;
    }
    const target = targetOf(f.path);
    try {
      if (target === 'plugin') plugin = pluginName(f.text) ?? plugin;
      else if (target) cards.push(...cardsOf(target, f, skipped));
    } catch {
      skipped.push({ path: f.path, reason: 'unreadable' });
    }
  }
  const kept = cards.slice(0, limits.cards);
  for (const c of cards.slice(limits.cards)) skipped.push({ path: c.source, reason: 'tooMany' });
  return { cards: kept, skipped, plugin };
}

function pluginName(text: string): string | null {
  const json: unknown = JSON.parse(text);
  return isRecord(json) && typeof json.name === 'string' ? json.name : null;
}

function cardsOf(target: Exclude<Target, 'plugin'>, f: BringFile, skipped: BringSkip[]): BringCard[] {
  switch (target) {
    case 'skill':
      return [skillCard(f)];
    case 'agent':
      return [agentCard(f)];
    case 'claudeMd':
      return [claudeMdCard(f)];
    case 'rules':
      return [rulesCard(f)];
    case 'mcp': {
      const card = mcpCard(f);
      return card ? [card] : [];
    }
    case 'hooks':
    case 'settings': {
      const json: unknown = JSON.parse(f.text);
      if (!isRecord(json)) throw new SyntaxError('JSON のオブジェクトではない');
      const hooks = hookCards(f.path, json.hooks, skipped);
      const perms =
        target === 'settings' && isRecord(json.permissions) ? [permissionCard(f.path, json.permissions)] : [];
      return [...hooks, ...perms];
    }
  }
}

/** 先頭の --- で囲んだ frontmatter（key: value と、key: の後の - の並び）と本文 */
export function frontmatter(text: string): { fields: Record<string, string | string[]>; body: string } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') return { fields: {}, body: text };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end < 0) return { fields: {}, body: text };
  const fields: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  for (const line of lines.slice(1, end)) {
    const item = /^\s+-\s*(.*)$/.exec(line);
    if (item && listKey) {
      const list = fields[listKey];
      fields[listKey] = [...(Array.isArray(list) ? list : []), unquote(item[1] ?? '')];
      continue;
    }
    const [, key, raw] = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line) ?? [];
    if (!key) continue;
    const value = unquote(raw ?? '');
    listKey = value === '' ? key : null;
    fields[key] = value;
  }
  return { fields, body: lines.slice(end + 1).join('\n') };
}

const unquote = (s: string) => {
  const t = s.trim();
  const q = t[0];
  return (q === '"' || q === "'") && t.length > 1 && t.endsWith(q) ? t.slice(1, -1) : t;
};
const field = (fields: Record<string, string | string[]>, key: string) => {
  const v = fields[key];
  return Array.isArray(v) ? v.join(', ') : (v ?? '');
};
const lineCount = (text: string) => text.replace(/\r\n/g, '\n').trimEnd().split('\n').length;
const has = (text: string, words: readonly string[]) => {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w.toLowerCase()));
};
/** 箇条書き・番号付きの行の数 */
const listItems = (text: string) => text.split('\n').filter((l) => /^\s*(\d+[.)]|[-*])\s+\S/.test(l)).length;

/**
 * 中身のキーワードから効く仕事の種類を推し量る。当たらなければ fallback。
 * limit を渡すと、キーワードの当たった数の多い順に limit 種類まで（1枚のカードで何にでも効かないようにする）
 */
function kindsOf(text: string, fallback: readonly TaskKind[], limit: number = ALL_KINDS.length): TaskKind[] {
  const lower = text.toLowerCase();
  const hits = (k: TaskKind) => bringKindWords[k].reduce((n, w) => n + lower.split(w.toLowerCase()).length - 1, 0);
  const found = ALL_KINDS.filter((k) => hits(k) > 0);
  if (found.length === 0) return [...fallback];
  const top = [...found].sort((a, b) => hits(b) - hits(a)).slice(0, limit);
  return ALL_KINDS.filter((k) => top.includes(k));
}

/** Skill・Subagent・Hook・MCP・Rules のカードが効く仕事の種類 */
const focusedKinds = (text: string, template: string) => kindsOf(text, templateKinds(template), balance.bring.maxKinds);

/** 観点の結果から点とカードを作る */
function card(
  category: BringCategory,
  input: {
    readonly name: string;
    readonly source: string;
    readonly passed: Partial<Record<BringCriterionId, boolean>>;
    readonly kinds: readonly TaskKind[];
    readonly template: string;
    readonly origin: BringOrigin;
    readonly timing?: HookTiming;
    readonly size?: number;
  },
): BringCard {
  const checks = bringCriteria[category].map((c) => ({ id: c.id, weight: c.weight, ok: input.passed[c.id] === true }));
  const score = checks.reduce((sum, c) => sum + (c.ok ? c.weight : 0), 0);
  const name = input.name.trim() || category;
  const id = bringPartId({
    template: input.template,
    timing: input.timing,
    score,
    kinds: input.kinds,
    size: input.size ?? 0,
    hash: shortHash(`${input.source}\n${JSON.stringify(input.origin)}`),
    name,
  });
  return {
    id,
    category,
    name,
    source: input.source,
    score,
    checks,
    kinds: input.kinds,
    ...(input.timing ? { timing: input.timing } : {}),
    origin: input.origin,
  };
}

const templatePart = (id: string) => harnessParts.find((p) => p.id === id);
const templateKinds = (id: string) => templatePart(id)?.appliesTo ?? ALL_KINDS;
const describesWhen = (fields: Record<string, string | string[]>) =>
  has(field(fields, 'description'), bringWhenWords) || field(fields, 'when_to_use').length > 0;

function skillCard(f: BringFile): BringCard {
  const { fields, body } = frontmatter(f.text);
  const dir = f.path.split('/').slice(0, -1).at(-1) ?? '';
  const template = bringTemplates.skill;
  return card('skill', {
    name: field(fields, 'name') || dir,
    source: f.path,
    passed: {
      hasDescription: field(fields, 'description').trim().length > 0,
      whenToUse: describesWhen(fields),
      concreteSteps: listItems(body) >= balance.bring.minSteps,
      notTooLong: lineCount(f.text) <= balance.bring.skillMaxLines,
    },
    kinds: focusedKinds(f.text, template),
    template,
    origin: { kind: 'file', path: f.path, text: f.text },
  });
}

function agentCard(f: BringFile): BringCard {
  const { fields, body } = frontmatter(f.text);
  const tools = field(fields, 'tools')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const template = bringTemplates.subagent;
  return card('subagent', {
    name: field(fields, 'name') || baseName(f.path).replace(/\.md$/, ''),
    source: f.path,
    passed: {
      hasDescription: field(fields, 'description').trim().length > 0,
      whenToUse: describesWhen(fields),
      toolsLimited: tools.length > 0 && tools.length <= balance.bring.agentMaxTools && !tools.includes('*'),
      roleClear: body.trim().length > 0,
    },
    kinds: focusedKinds(f.text, template),
    template,
    origin: { kind: 'file', path: f.path, text: f.text },
  });
}

/** CLAUDE.md・Rules の行数を、ゲームの書いた量にする */
const sizeOf = (text: string) =>
  Math.min(balance.bring.maxSize, Math.max(1, Math.ceil(lineCount(text) / balance.bring.linesPerSize)));

function claudeMdCard(f: BringFile): BringCard {
  const lines = lineCount(f.text);
  const { min, max } = balance.bring.claudeMdLines;
  return card('claudeMd', {
    name: f.path,
    source: f.path,
    passed: {
      lengthOk: lines >= min && lines <= max,
      hasCommands: has(f.text, bringCommandWords),
      hasStructure: /^##+\s/m.test(f.text),
    },
    // CLAUDE.md は毎回読むので、キーワードに当たらなければすべての仕事に効く
    kinds: kindsOf(f.text, ALL_KINDS),
    template: bringTemplates.claudeMd,
    size: sizeOf(f.text),
    origin: { kind: 'file', path: f.path, text: f.text },
  });
}

function rulesCard(f: BringFile): BringCard {
  const { fields, body } = frontmatter(f.text);
  const paths = field(fields, 'paths');
  return card('rules', {
    name: baseName(f.path).replace(/\.md$/, ''),
    source: f.path,
    passed: {
      scoped: paths.length > 0,
      concise: lineCount(f.text) <= balance.bring.rulesMaxLines,
      concrete: listItems(body) >= balance.bring.minSteps,
    },
    kinds: kindsOf(`${paths}\n${f.text}`, ALL_KINDS, balance.bring.maxKinds),
    template: bringTemplates.rules,
    size: sizeOf(f.text),
    origin: { kind: 'file', path: f.path, text: f.text },
  });
}

/** matcher で道具を絞れるイベント（それ以外のイベントは matcher がなくてもよい） */
const TOOL_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'];

function hookCards(path: string, hooks: unknown, skipped: BringSkip[]): BringCard[] {
  if (!isRecord(hooks)) return [];
  const out: BringCard[] = [];
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    const timing = bringHookEvents[event];
    if (!timing) {
      skipped.push({ path: `${path}#hooks.${event}`, reason: 'unusedHook', detail: event });
      continue;
    }
    entries.forEach((entry, i) => {
      if (!isRecord(entry)) return;
      const matcher = typeof entry.matcher === 'string' ? entry.matcher : '';
      const handlers = Array.isArray(entry.hooks) ? entry.hooks.filter(isRecord) : [];
      const commands = handlers
        .map((h) => [h.command, h.prompt, h.url].find((v): v is string => typeof v === 'string') ?? '')
        .join('\n');
      const template =
        bringTemplates.hook.byWord.find((w) => has(commands, w.words))?.part ?? bringTemplates.hook.byTiming[timing];
      const head = commands.split('\n')[0]?.trim() ?? '';
      out.push(
        card('hook', {
          name: `${event}${matcher ? `(${matcher})` : ''} ${head}`,
          source: `${path}#hooks.${event}[${i}]`,
          passed: {
            runsCheck: has(commands, bringCheckWords),
            matcherNarrow: !TOOL_EVENTS.includes(event) || (matcher !== '' && matcher !== '*' && matcher !== '.*'),
            failLoud: has(commands, bringFailWords),
          },
          kinds: focusedKinds(commands, template),
          template,
          timing,
          origin: { kind: 'hook', event, entry },
        }),
      );
    });
  }
  return out;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

function permissionCard(path: string, permissions: Record<string, unknown>): BringCard {
  const allow = strings(permissions.allow);
  const deny = strings(permissions.deny);
  const safe = !allow.some((a) => bringDangerousAllows.includes(a)) && permissions.defaultMode !== 'bypassPermissions';
  const template = safe ? bringTemplates.permission.safe : bringTemplates.permission.risky;
  return card('permission', {
    name: `permissions (allow ${allow.length} / deny ${deny.length})`,
    source: `${path}#permissions`,
    passed: { hasDeny: deny.length > 0, noDangerous: safe, hasAllow: allow.length > 0 },
    kinds: templateKinds(template),
    template,
    origin: { kind: 'permissions', value: permissions },
  });
}

function mcpCard(f: BringFile): BringCard | null {
  const json: unknown = JSON.parse(f.text);
  if (!isRecord(json) || !isRecord(json.mcpServers)) throw new SyntaxError('mcpServers がない');
  const servers = json.mcpServers;
  const names = Object.keys(servers);
  if (names.length === 0) return null;
  const configs = Object.values(servers).filter(isRecord);
  // 鍵や接続先は ${VAR} で環境変数から受け取る（ファイルに直接書かない）
  const envRef = configs.every((s) =>
    [s.env, s.headers].every((m) => !isRecord(m) || Object.values(m).every((v) => String(v).includes('${'))),
  );
  // npx・uvx で取ってくるサーバーは、版を固定している
  const pinned = configs.every((s) => {
    const runner = s.command === 'npx' || s.command === 'uvx';
    return !runner || strings(s.args).some((a) => /@\d|==\d/.test(a));
  });
  const template = bringTemplates.mcp;
  return card('mcp', {
    name: names.join(', '),
    source: f.path,
    passed: { fewServers: names.length <= balance.bring.mcpMaxServers, envRef, pinned },
    kinds: focusedKinds(f.text, template),
    template,
    origin: { kind: 'mcp', servers },
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/* 部品の id と、id から作る部品 */

/** 生成した持ち込みカードの部品の id か */
export const isBroughtPartId = (id: string) => id.startsWith(PREFIX);

interface PartSpec {
  readonly template: string;
  readonly timing?: HookTiming | undefined;
  readonly score: number;
  readonly kinds: readonly TaskKind[];
  readonly size: number;
  readonly hash: string;
  readonly name: string;
}

/** 部品の id。名前は ~ を含まないよう URI の形に符号化して末尾に置く */
export function bringPartId(spec: PartSpec): string {
  const mask = spec.kinds.reduce((m, k) => m | (1 << ALL_KINDS.indexOf(k)), 0);
  const name = encodeURIComponent([...spec.name].slice(0, balance.bring.maxNameLength).join('')).replace(/~/g, '%7E');
  return `${PREFIX}${[spec.template, spec.timing ?? NO_TIMING, spec.score, mask, spec.size, spec.hash, name].join('~')}`;
}

/** 部品の id を読む。形が違えば undefined */
export function parseBringPartId(id: string): PartSpec | undefined {
  if (!isBroughtPartId(id)) return undefined;
  const [template = '', timing = '', score = '', mask = '', size = '', hash = '', name = '', ...rest] = id
    .slice(PREFIX.length)
    .split('~');
  const tpl = templatePart(template);
  const timingOk = timing === NO_TIMING || Object.values(bringHookEvents).includes(timing as HookTiming);
  const nums = [score, mask, size].map(Number);
  const [s = -1, m = -1, z = -1] = nums;
  if (!tpl || rest.length > 0 || !timingOk || !nums.every(Number.isInteger) || !/^[\da-z]+$/.test(hash))
    return undefined;
  if (
    s < 0 ||
    s > maxScore(tpl.category) ||
    m < 0 ||
    m >= 1 << ALL_KINDS.length ||
    z < 0 ||
    z > balance.bring.maxSize
  ) {
    return undefined;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    return undefined;
  }
  return {
    template,
    timing: timing === NO_TIMING ? undefined : (timing as HookTiming),
    score: s,
    kinds: ALL_KINDS.filter((_, i) => m & (1 << i)),
    size: z,
    hash,
    name: decoded,
  };
}

/** カテゴリの満点（観点の配点の合計） */
export function maxScore(category: string): number {
  const criteria = bringCriteria[category as BringCategory] ?? [];
  return criteria.reduce((sum, c) => sum + c.weight, 0);
}

/** 点を補正の強さにする（満点で balance.bring.maxStrength） */
export const strengthOf = (score: number, category: string) =>
  (score / Math.max(1, maxScore(category))) * balance.bring.maxStrength;

/** 補正を強さ s で効かせる（add・any は s 倍、mul は 1 からの差を s 倍） */
function scaleModifiers(mods: Partial<HarnessModifiers>, s: number): Partial<HarnessModifiers> {
  return Object.fromEntries(
    (Object.entries(mods) as [HarnessModifierKey, number][]).map(([k, v]) => [
      k,
      balance.harness.combine[k].op === 'mul' ? 1 + (v - 1) * s : v * s,
    ]),
  );
}

/**
 * 持ち込みカードの部品。雛形の部品の補正を点の強さで効かせ、負担（burden）・ランニングコスト・解放の条件は雛形のまま。
 * CLAUDE.md は書いた量（size）を持ち、効かない仕事では Noise になる（同梱の CLAUDE.md の部品と同じ）。
 * 権限は同梱の権限モードと同じ group で、どちらか1つだけ付けられる。id が持ち込みの形でなければ undefined
 */
export function broughtPart(id: string): HarnessPartDef | undefined {
  const spec = parseBringPartId(id);
  const tpl = spec && templatePart(spec.template);
  if (!spec || !tpl) return undefined;
  const sized = tpl.category === 'claudeMd' || tpl.category === 'rules';
  const everywhere = spec.kinds.length === ALL_KINDS.length;
  return {
    id,
    category: tpl.category,
    name: spec.name,
    installCost: Math.round(tpl.installCost * balance.bring.costRatio),
    runningCost: tpl.runningCost,
    modifiers: scaleModifiers(tpl.modifiers, strengthOf(spec.score, tpl.category)),
    burden: tpl.burden,
    appliesTo: spec.kinds,
    enforcement: 'system',
    ...(tpl.category === 'permission' && tpl.group ? { group: tpl.group } : {}),
    ...(sized ? { size: spec.size } : {}),
    ...(tpl.category === 'claudeMd' && !everywhere
      ? { offTarget: { noise: spec.size * balance.harness.claudeMdNoisePerSize } }
      : {}),
    ...(spec.timing && tpl.category === 'hook' ? { timing: spec.timing } : {}),
    unlock: tpl.unlock,
    origin: 'brought',
  };
}

/** 結果コードに入れる、使った持ち込みカードの要約（カテゴリと点。中身は入れない） */
export interface BringSummary {
  readonly category: BringCategory;
  readonly score: number;
}

/** 部品の id の並びから、持ち込みカードの要約を作る（持ち込みでない id は除く） */
export function bringSummary(partIds: readonly string[]): BringSummary[] {
  return partIds.flatMap((id) => {
    const part = broughtPart(id);
    const spec = parseBringPartId(id);
    const category = bringCategories.find((c) => c === part?.category);
    return category && spec ? [{ category, score: spec.score }] : [];
  });
}
