import { companyTiers } from '../content/companyTiers';
import { getHarnessPart } from '../content/index';
import type { BringCard } from '../core/bring';
import {
  exportPlugin,
  type PluginComponent,
  type PluginComponentKind,
  type PluginExport,
  type PluginOrigin,
} from '../core/pluginExport';
import type { GameState } from '../core/state';
import { ja } from '../i18n/ja';

/*
 * プラグインの書き出しの画面（Phase 43）の表示用データ（純粋関数）。ハーネスのレベル・入っている部品の種類ごとの一覧・次に増えるもの。
 */

const t = ja.pluginExport;

export interface PluginGroupView {
  readonly kind: PluginComponentKind;
  readonly label: string;
  readonly items: readonly { readonly name: string; readonly origin: PluginOrigin; readonly originLabel: string }[];
}

export interface PluginExportView {
  readonly exp: PluginExport;
  readonly level: string;
  readonly groups: readonly PluginGroupView[];
  readonly next: string;
  /** 会社のセーブがない（持ち込みカードだけ） */
  readonly noCompany: boolean;
  readonly fileCount: string;
}

const KINDS: readonly PluginComponentKind[] = ['workflow', 'skill', 'agent', 'hook', 'mcp', 'template'];

export function pluginExportView(state: GameState | null, cards: readonly BringCard[]): PluginExportView {
  const exp = exportPlugin({ state, cards });
  const groups = KINDS.map((kind) => ({
    kind,
    label: t.kinds[kind],
    items: exp.components
      .filter((c: PluginComponent) => c.kind === kind)
      .map((c) => ({ name: c.name, origin: c.origin, originLabel: t.origins[c.origin] })),
  })).filter((g) => g.items.length > 0);
  return {
    exp,
    level: t.level(exp.level, exp.components.length),
    groups,
    next: nextText(exp),
    noCompany: state === null,
    fileCount: t.files(exp.files.length),
  };
}

function nextText(exp: PluginExport): string {
  const n = exp.next;
  if (!n) return t.next.none;
  if (n.type === 'feature') return t.next.feature(n.parts.map((id) => getHarnessPart(id).name).join('・'));
  if (n.type === 'tier') {
    return t.next.tier(companyTiers.find((c) => c.id === n.tier)?.name ?? n.tier, n.workflows);
  }
  return t.next.workflow(n.room);
}
