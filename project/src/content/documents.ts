import { generatedDocuments, isGeneratedProjectId } from '../core/projectGen';
import { ja } from '../i18n/ja';
import type { DocumentDef, HandoffItemId } from './types';

const d = ja.documents;

/**
 * 案件の資料（企画書9〜10章）。決済画面の修正（と、その型から生成した案件）では、Task に役立つのは決済仕様・関連コード・関連テスト・Coding Rules などの一部で、
 * 残りは古い仕様・矛盾するルール・無関係な Issue・過去案件・重複ドキュメントといったノイズになる。
 * 資料を持たない案件では Context は常に良好で、資料の渡し方を選ぶ UI も出さない。
 */
export const documents: readonly DocumentDef[] = [
  // 役に立つ資料
  {
    id: 'bugReport',
    projectId: 'paymentFix',
    name: d.bugReport,
    relevantTo: ['reproduce', 'spec'],
    stale: false,
    conflictsWith: [],
    size: 5,
  },
  {
    id: 'paymentCode',
    projectId: 'paymentFix',
    name: d.paymentCode,
    relevantTo: ['reproduce', 'fix'],
    stale: false,
    conflictsWith: [],
    size: 14,
  },
  {
    id: 'paymentSpec',
    projectId: 'paymentFix',
    name: d.paymentSpec,
    relevantTo: ['spec', 'fix', 'tests'],
    stale: false,
    conflictsWith: [],
    size: 12,
  },
  {
    id: 'paymentTests',
    projectId: 'paymentFix',
    name: d.paymentTests,
    relevantTo: ['fix', 'tests'],
    stale: false,
    conflictsWith: [],
    size: 10,
  },
  {
    id: 'codingRules',
    projectId: 'paymentFix',
    name: d.codingRules,
    relevantTo: ['fix', 'tests'],
    stale: false,
    conflictsWith: [],
    size: 5,
  },
  {
    id: 'releaseGuide',
    projectId: 'paymentFix',
    name: d.releaseGuide,
    relevantTo: ['release'],
    stale: false,
    conflictsWith: [],
    size: 4,
  },
  // ノイズになる資料
  {
    id: 'oldPaymentSpec',
    projectId: 'paymentFix',
    name: d.oldPaymentSpec,
    relevantTo: ['spec', 'fix', 'tests'],
    stale: true,
    conflictsWith: [],
    size: 12,
  },
  {
    id: 'legacyRules',
    projectId: 'paymentFix',
    name: d.legacyRules,
    relevantTo: [],
    stale: false,
    conflictsWith: ['codingRules'],
    size: 5,
  },
  {
    id: 'unrelatedIssues',
    projectId: 'paymentFix',
    name: d.unrelatedIssues,
    relevantTo: [],
    stale: false,
    conflictsWith: [],
    size: 12,
  },
  {
    id: 'pastMinutes',
    projectId: 'paymentFix',
    name: d.pastMinutes,
    relevantTo: [],
    stale: false,
    conflictsWith: [],
    size: 8,
  },
  {
    id: 'specCopy',
    projectId: 'paymentFix',
    name: d.specCopy,
    relevantTo: [],
    stale: false,
    conflictsWith: [],
    size: 6,
  },
  {
    id: 'companyWiki',
    projectId: 'paymentFix',
    name: d.companyWiki,
    relevantTo: [],
    stale: false,
    conflictsWith: [],
    size: 5,
  },
];

/** 案件の資料。生成した案件は、型の資料を写したもの（core/projectGen.ts） */
export function documentsOf(projectId: string): readonly DocumentDef[] {
  if (isGeneratedProjectId(projectId)) return generatedDocuments(projectId);
  return documents.filter((doc) => doc.projectId === projectId);
}

/** 資料の定義。生成した案件の資料（`<案件の id>/<資料の id>`）も解決する */
export function findDocument(id: string): DocumentDef | undefined {
  const slash = id.lastIndexOf('/');
  if (slash < 0) return documents.find((d) => d.id === id);
  return documentsOf(id.slice(0, slash)).find((d) => d.id === id);
}

/** Handoff の項目（企画書11章の並び） */
export const handoffItems: readonly HandoffItemId[] = [
  'goal',
  'decisions',
  'constraints',
  'modifiedFiles',
  'validation',
  'remainingWork',
];

/** Artifact Driven Work（企画書12章）で、会話ではなく成果物（コード・テスト・Task State）に残る項目 */
export const artifactCovers: readonly HandoffItemId[] = ['modifiedFiles', 'validation', 'remainingWork'];
