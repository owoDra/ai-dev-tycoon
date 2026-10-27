import { ja } from '../../i18n/ja';
import type { PracticeAptitude, PracticeAptitudeDef, PracticeFrequency, PracticeTemplateDef } from '../types';

/*
 * 実務モード（企画書24章）のデータ。実際の業務の工程を、ゲームの Task と同じ性質（AI 適性・難易度・品質要求・失敗リスク）で表し、
 * ゲームと同じ式（core/practice.ts）で改善後の見込みを出す。
 */

/** 頻度の選択肢の並び */
export const practiceFrequencies: readonly PracticeFrequency[] = ['daily', 'weekly', 'monthly'];

/** AI 適性の選択肢の並び */
export const practiceAptitudeOrder: readonly PracticeAptitude[] = ['high', 'mid', 'low'];

/**
 * AI 適性の選択肢が表す Task の性質。高いほど AI が得意で失敗しにくい定型の仕事、
 * 低いほど判断や責任が要り、AI に任せると失敗しやすく見逃しの損が大きい仕事
 */
export const practiceAptitudes: Readonly<Record<PracticeAptitude, PracticeAptitudeDef>> = {
  high: { aiAptitude: 0.9, difficulty: 0.2, qualityReq: 0.4, failRisk: 0.2 },
  mid: { aiAptitude: 0.6, difficulty: 0.4, qualityReq: 0.6, failRisk: 0.3 },
  low: { aiAptitude: 0.25, difficulty: 0.6, qualityReq: 0.8, failRisk: 0.4 },
};

const w = ja.practice.template.weekly;

/**
 * 週次アクセス解析（企画書24章：Human 120min → Data取得 → Analysis Agent → Report Skill → Eval → Human Approval → Human 15min）。
 * データ取得からレポートまでを Agent Workflow で一続きに任せ、最後の承認だけを人間に残す
 */
export const weeklyAnalytics: PracticeTemplateDef = {
  id: 'weeklyAnalytics',
  job: {
    name: w.name,
    frequency: 'weekly',
    hourlyWage: 4000,
    valuePerRun: 30_000,
    steps: [
      {
        name: w.fetch,
        minutes: 20,
        kind: 'research',
        aptitude: 'high',
        mode: 'agentWorkflow',
        modelId: 'standard',
        parts: ['toolAnalytics'],
      },
      {
        name: w.analysis,
        minutes: 40,
        kind: 'research',
        aptitude: 'high',
        mode: 'agentWorkflow',
        modelId: 'standard',
        parts: ['toolAnalytics', 'subResearch'],
      },
      {
        name: w.report,
        minutes: 46,
        kind: 'content',
        aptitude: 'high',
        mode: 'agentWorkflow',
        modelId: 'standard',
        parts: ['skillReport', 'evalAcceptance'],
      },
      {
        name: w.approval,
        minutes: 14,
        kind: 'planning',
        aptitude: 'low',
        mode: 'human',
        modelId: 'standard',
        parts: [],
      },
    ],
  },
};

/** 同梱のテンプレート */
export const practiceTemplates: readonly PracticeTemplateDef[] = [weeklyAnalytics];
