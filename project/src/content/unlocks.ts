import type { HudItemId } from './look/layout';
import type { AssignModeId, FeatureId, ModeFeatureId, UnlockDef } from './types';

/**
 * 機能の解放（企画書50章「必要になる前に説明しない」）。条件を満たした時点で core/unlocks.ts が解放し、
 * FeatureUnlocked を出す（Tier 2 の演出と「NEW」バッジ）。
 * キャンペーンはチュートリアル（start の機能だけ）から始まり、解放の進み具合を案件をまたいで持ち越す（セーブにも残る）。
 * キャンペーンでない単発のプレイ（テストなど）は、すべて解放済みで始まる。
 */
export const unlockDefs: readonly UnlockDef[] = [
  { id: 'human', feature: 'mode:human', when: { type: 'start' }, message: 'basic' },
  { id: 'ai', feature: 'mode:ai', when: { type: 'start' }, message: 'basic' },
  { id: 'speed', feature: 'dock:speed', when: { type: 'tasksStarted', count: 1 }, message: 'speed' },
  {
    id: 'utilization',
    feature: 'dock:utilization',
    when: { type: 'tasksCompleted', count: 1 },
    message: 'utilization',
  },
  // AI のミスで品質が落ちた後に、確かめる手段を渡す
  { id: 'review', feature: 'mode:aiThenHumanReview', when: { type: 'defectsEscaped', count: 1 }, message: 'review' },
  // レビューを一度やって「毎回確認するのは大変」と感じた後に、自動テストを渡す
  {
    id: 'eval',
    feature: 'mode:aiThenEval',
    when: { type: 'modeCompleted', mode: 'aiThenHumanReview', count: 1 },
    message: 'eval',
  },
  {
    id: 'humanThenAi',
    feature: 'mode:humanThenAi',
    when: { type: 'projectsCompleted', count: 1 },
    message: 'advanced',
  },
  {
    id: 'agentWorkflow',
    feature: 'mode:agentWorkflow',
    when: { type: 'unlocked', feature: 'mode:humanThenAi' },
    message: 'advanced',
  },
  { id: 'problems', feature: 'problems', when: { type: 'projectsCompleted', count: 1 }, message: 'problems' },
  // Context（企画書9〜12章）。資料のある案件でだけ UI に出る。最初は「必要な資料だけ / すべての資料」の2択
  { id: 'context', feature: 'context', when: { type: 'projectsCompleted', count: 1 }, message: 'context' },
  // Session が長くなり、履歴のノイズが目立ってきたら New Session と Handoff を渡す
  { id: 'session', feature: 'session', when: { type: 'sessionAge', minutes: 20 }, message: 'session' },
  // 事件を一度経験したら、資料を1つずつ選べるようにする
  {
    id: 'contextPick',
    feature: 'context:pick',
    when: { type: 'contextStat', stat: 'incidents', count: 1 },
    message: 'contextPick',
  },
  // 一度 Reset したら、成果物に状態を残す方法を渡す
  {
    id: 'artifacts',
    feature: 'session:artifacts',
    when: { type: 'contextStat', stat: 'resets', count: 1 },
    message: 'artifacts',
  },
  // 決済画面の修正を納品したら、最後に Context Router（Phase 11 で Harness Builder に統合する）
  {
    id: 'contextRouter',
    feature: 'context:router',
    when: { type: 'projectCompleted', projectId: 'paymentFix' },
    message: 'contextRouter',
  },
  // Harness Builder（企画書35章）。AI に任せる経験を積んで「Harness Engineering」の名前を知った後に、Model と Skill から
  { id: 'harness', feature: 'harness', when: { type: 'projectsCompleted', count: 1 }, message: 'harness' },
  // Builder と一緒に「お願い」と「Hook」を渡す（同じルールの2つの守らせ方を最初に比べさせる）
  {
    id: 'harnessHook',
    feature: 'harness:hook',
    when: { type: 'unlocked', feature: 'harness' },
    message: 'harnessHook',
  },
  // Workflow で AI に工程をまとめて任せた後に、Tool と権限を渡す
  {
    id: 'harnessTool',
    feature: 'harness:tool',
    when: { type: 'modeCompleted', mode: 'agentWorkflow', count: 1 },
    message: 'harnessTool',
  },
  {
    id: 'harnessPermission',
    feature: 'harness:permission',
    when: { type: 'unlocked', feature: 'harness:tool' },
    message: 'harnessPermission',
  },
  // 自動テスト（簡易 Eval）を使った後に、検証の部品を渡す
  {
    id: 'harnessEval',
    feature: 'harness:eval',
    when: { type: 'modeCompleted', mode: 'aiThenEval', count: 2 },
    message: 'harnessEval',
  },
  // 2つ目の案件を納品したら、分担（Subagent）を渡す
  {
    id: 'harnessSubagent',
    feature: 'harness:subagent',
    when: { type: 'projectsCompleted', count: 2 },
    message: 'harnessSubagent',
  },
  // 2つ目の案件を納品し、案件が大きくなってきたら、社員の Seat を変えられるようにする（企画書6章）
  { id: 'team', feature: 'team', when: { type: 'projectsCompleted', count: 2 }, message: 'team' },
];

export const modeFeature = (mode: AssignModeId): ModeFeatureId => `mode:${mode}`;

/** ドックの項目のうち、解放されるまで出さないもの（載っていない項目は常に出す） */
export const dockFeature: Partial<Record<HudItemId, FeatureId>> = {
  speed: 'dock:speed',
  utilization: 'dock:utilization',
  problems: 'problems',
};

/** すべての機能（解放の定義の順） */
export const allFeatures: readonly FeatureId[] = unlockDefs.map((u) => u.feature);
