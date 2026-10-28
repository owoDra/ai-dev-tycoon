import type { HudItemId } from './look/layout';
import type { AssignModeId, FeatureId, ModeFeatureId, UnlockDef } from './types';

/**
 * 機能の解放（企画書50章「必要になる前に説明しない」「順番に解放する」）。問題を体験した後に、その解決策を渡す順に並べる。
 * 体験の条件だけだと遊び方によっては永久に届かないので、規模の昇格など「いずれは届く」条件を any で添える。
 * 条件を満たした時点で core/unlocks.ts が解放し、FeatureUnlocked を出す（Tier 2 の演出と「NEW」バッジ）。
 * チュートリアルの後は1営業日に1つずつ渡す（同じ条件で同時に満たしたものと、解放を条件にする連鎖は同じ日にまとめる）。
 * 会社（案件ボード）はチュートリアル（start の機能だけ）から始まり、解放の進み具合を案件をまたいで持ち越す（セーブにも残る）。
 * チュートリアルなしで始めた会社とチュートリアルを飛ばした会社は、チュートリアルを終えたのと同じところ（tutorialFeatures）から始まり、
 * 残りは同じはしごで1つずつ渡す（一度にすべて渡すと、自分で工夫する前に答えが並んでしまう）。
 * 案件ボードのない単発のプレイ（テストなど）だけが、すべて解放済みで始まる。
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
  // チュートリアルの案件を納品したら、次に手を打つ場所を教える
  { id: 'problems', feature: 'problems', when: { type: 'projectsCompleted', count: 1 }, message: 'problems' },
  // 2つ目の案件を納品したら、人間の判断を先に置く任せ方を渡す
  {
    id: 'humanThenAi',
    feature: 'mode:humanThenAi',
    when: { type: 'projectsCompleted', count: 2 },
    message: 'advanced',
  },
  // 案件を重ねて人手が足りなくなってきたら、採用市場で人を増やせるようにする（社員の画面もここから開ける）。
  // 会社の伸びを左右するので、同じ日に条件を満たした解放が重なったら Context や Harness より先に渡す
  { id: 'hire', feature: 'hire', when: { type: 'projectsCompleted', count: 4 }, message: 'hire' },
  // Context（企画書9〜12章）。AI のミスが重なってきたら、渡す資料を選べるようにする（遅くとも4件目の納品で）。
  // 資料のある案件でだけ UI に出る。最初は「必要な資料だけ / すべての資料」の2択
  {
    id: 'context',
    feature: 'context',
    when: {
      type: 'any',
      of: [
        { type: 'defectsEscaped', count: 3 },
        { type: 'projectsCompleted', count: 4 },
      ],
    },
    message: 'context',
  },
  // Session が長くなり、履歴のノイズが目立ってきたら New Session と Handoff を渡す
  {
    id: 'session',
    feature: 'session',
    when: {
      type: 'all',
      of: [
        { type: 'unlocked', feature: 'context' },
        { type: 'sessionAge', minutes: 20 },
      ],
    },
    message: 'session',
  },
  // 事件を一度経験したら、資料を1つずつ選べるようにする
  {
    id: 'contextPick',
    feature: 'context:pick',
    when: {
      type: 'all',
      of: [
        { type: 'unlocked', feature: 'context' },
        { type: 'contextStat', stat: 'incidents', count: 1 },
      ],
    },
    message: 'contextPick',
  },
  // 一度 Reset したら、成果物に状態を残す方法を渡す
  {
    id: 'artifacts',
    feature: 'session:artifacts',
    when: {
      type: 'all',
      of: [
        { type: 'unlocked', feature: 'session' },
        { type: 'contextStat', stat: 'resets', count: 1 },
      ],
    },
    message: 'artifacts',
  },
  // 決済画面の修正（の型の案件）を納品したら、最後に Context Router（Harness Builder の部品）
  {
    id: 'contextRouter',
    feature: 'context:router',
    when: {
      type: 'all',
      of: [
        { type: 'unlocked', feature: 'harness' },
        { type: 'templateCompleted', templateId: 'paymentFix' },
      ],
    },
    message: 'contextRouter',
  },
  // Harness Builder（企画書35章）。人間のレビューを何度も繰り返し「毎回同じ確認をしている」と感じた後に、
  // Model・CLAUDE.md と Rules・Skill を渡す（遅くともスタートアップへの昇格で）
  {
    id: 'harness',
    feature: 'harness',
    when: {
      type: 'any',
      of: [
        { type: 'modeCompleted', mode: 'aiThenHumanReview', count: 6 },
        { type: 'tier', tier: 'startup' },
      ],
    },
    message: 'harness',
  },
  // Builder と一緒に「お願い」と「Hook」を渡す（同じルールの2つの守らせ方を最初に比べさせる）
  {
    id: 'harnessHook',
    feature: 'harness:hook',
    when: { type: 'unlocked', feature: 'harness' },
    message: 'harnessHook',
  },
  // Harness の部品を1つ導入して AI Worker を整えた後に、工程をまとめて AI に任せる Agent Workflow と、
  // その組み合わせを保存・適用する Workflow Library を渡す
  {
    id: 'agentWorkflow',
    feature: 'mode:agentWorkflow',
    when: { type: 'partsOwned', count: 1 },
    message: 'workflow',
  },
  // スタートアップに昇格し、案件が大きくなってきたら、社員の Seat を変えられるようにする（企画書6章）
  { id: 'team', feature: 'team', when: { type: 'tier', tier: 'startup' }, message: 'team' },
  // 自動テスト（簡易 Eval）を使った後に、検証の部品を渡す（遅くともスタートアップへの昇格で）
  {
    id: 'harnessEval',
    feature: 'harness:eval',
    when: {
      type: 'all',
      of: [
        { type: 'unlocked', feature: 'harness' },
        {
          type: 'any',
          of: [
            { type: 'modeCompleted', mode: 'aiThenEval', count: 2 },
            { type: 'tier', tier: 'startup' },
          ],
        },
      ],
    },
    message: 'harnessEval',
  },
  // スタートアップに昇格したら、分担（Subagent）を渡す
  {
    id: 'harnessSubagent',
    feature: 'harness:subagent',
    when: {
      type: 'all',
      of: [
        { type: 'unlocked', feature: 'harness' },
        { type: 'tier', tier: 'startup' },
      ],
    },
    message: 'harnessSubagent',
  },
  // Workflow で AI に工程をまとめて任せた後に、MCP と権限モードを渡す（遅くともスタートアップへの昇格で）
  {
    id: 'harnessTool',
    feature: 'harness:tool',
    when: {
      type: 'all',
      of: [
        { type: 'unlocked', feature: 'harness' },
        {
          type: 'any',
          of: [
            { type: 'modeCompleted', mode: 'agentWorkflow', count: 1 },
            { type: 'tier', tier: 'startup' },
          ],
        },
      ],
    },
    message: 'harnessTool',
  },
  {
    id: 'harnessPermission',
    feature: 'harness:permission',
    when: { type: 'unlocked', feature: 'harness:tool' },
    message: 'harnessPermission',
  },
  // 小規模企業に昇格したら、人間が見張る時間を減らす Mod と、夜も AI を働かせる Routine を渡す
  {
    id: 'harnessMod',
    feature: 'harness:mod',
    when: {
      type: 'all',
      of: [
        { type: 'unlocked', feature: 'harness' },
        { type: 'tier', tier: 'small' },
      ],
    },
    message: 'harnessMod',
  },
  {
    id: 'harnessRoutine',
    feature: 'harness:routine',
    when: { type: 'unlocked', feature: 'harness:mod' },
    message: 'harnessRoutine',
  },
];

export const modeFeature = (mode: AssignModeId): ModeFeatureId => `mode:${mode}`;

/** ドックの項目のうち、解放されるまで出さないもの（載っていない項目は常に出す） */
export const dockFeature: Partial<Record<HudItemId, FeatureId>> = {
  utilization: 'dock:utilization',
  problems: 'problems',
};

/**
 * チュートリアルで渡す機能（台本どおりに遊ぶと、終えたときにちょうどこれが解放済みになる。tests/unit/unlocks.test.ts で確かめる）。
 * チュートリアルなしで始めた会社・飛ばした会社は、ここから始める
 */
export const tutorialFeatures: readonly FeatureId[] = [
  'mode:human',
  'mode:ai',
  'dock:speed',
  'dock:utilization',
  'mode:aiThenHumanReview',
  'mode:aiThenEval',
  'problems',
];

/** すべての機能（解放の定義の順） */
export const allFeatures: readonly FeatureId[] = unlockDefs.map((u) => u.feature);

/** 「NEW」の印を出すメニューの入口 */
export type MenuSpot = 'harness' | 'library' | 'team' | 'context';

/**
 * メニューの入口ごとに、解放したら「NEW」の印を出す機能（その入口を開いたら消す）。
 * Workflow Library は Agent Workflow と一緒に開くので、その担当カードと印を共有する（どちらかを使えば消える）。
 * 担当モードの機能（mode:*）は、担当カードに印を出す（その任せ方で担当を決めたら消す）
 */
export const menuFeatures: Readonly<Record<MenuSpot, readonly FeatureId[]>> = {
  harness: [
    'harness',
    'harness:hook',
    'harness:tool',
    'harness:permission',
    'harness:eval',
    'harness:subagent',
    'harness:mod',
    'harness:routine',
    'context:router',
  ],
  library: ['mode:agentWorkflow'],
  team: ['team', 'hire'],
  context: ['context', 'context:pick', 'session', 'session:artifacts'],
};

/** 解放したときに「NEW」の印を付ける機能か（担当カードかメニューの入口に出す場所がある） */
export const hasNewBadge = (feature: FeatureId): boolean =>
  feature.startsWith('mode:') || Object.values(menuFeatures).some((fs) => fs.includes(feature));

/** その機能を開くメニューの入口（解放のカードの「開く」）。入口のない機能（担当モード・ドックの項目など）は undefined */
export const menuSpotOf = (feature: FeatureId): MenuSpot | undefined =>
  (Object.keys(menuFeatures) as MenuSpot[]).find((spot) => menuFeatures[spot].includes(feature));
