# Phase 03: 案件・Task・担当モード・スコア

## 目的
企画書 4〜5章・20章・22章の基本ルールを、ヘッドレスで「遊べる」状態にする。あわせて、企画書の設計意図を自動検証するバランステスト基盤を作る。

## 前提
Phase 02

## やること
1. **コンテンツのスキーマ（`content/types.ts`）**
   - `ProjectDef`：id、名前、売上、納期（営業日）、`tasks: TaskDef[]`
   - `TaskDef`：id、名前、`deps`、`effort`（人間の作業量・分）、`difficulty`、`aiAptitude`、`qualityReq`、`failRisk`、`contextNeeds`（後の Phase で使う。今は型だけ）
   - `WorkerDef`：人間（時給・スキル）と AI Worker（Model の参照）
   - `ModelDef`：能力・速度・単価（Phase 13 で拡張する）
2. **`content/validate.ts`**：依存グラフの循環・未定義参照・ID の重複を検出する。起動時と content テストの両方で呼ぶ。
3. **最初の案件** `content/projects/ec-renewal.ts`（企画書4章のECサイトリニューアル：要望整理 → 要件定義 → UI設計 / 競合調査 → 実装 → QA → リリース）
4. **担当モード**（`content/assignModes.ts` にデータとして定義し、計算式側は分岐ではなく modifier として読む）
   - `human` / `ai` / `aiThenHumanReview` / `humanThenAi` / `agentWorkflow`（`agentWorkflow` は Phase 11 で拡張する。今は複数の Task をつないで連続実行する最小版でよい）
5. **計算式 `core/formulas.ts`**：すべて純粋関数で、係数は `balance.ts` から読む。各関数の JSDoc に式の意図を1〜2行で書く（ここが式の正本になる）。
   - 所要時間、成功確率、AI コスト、人間の拘束時間
   - 失敗時の扱い：レビューがあれば発見して手戻り（人間の時間を消費）、なければ見逃して品質が低下する
6. **システム**：`taskSystem`（依存が解決した Task を開始し、進捗を進め、完了・失敗を判定する）、`humanQueueSystem`（人間のレビューや作業の待ち行列。人間1人は同時に1件しか処理できない）
7. **Command**：`AssignTask { taskId, mode, workerId }`、`StartProject`
8. **スコア `core/scoring.ts`**：利益（売上 − 人件費 − AI費用 − 手戻り − 遅延損失）、**Profit / Human Hour**、Human Intervention、Autonomous Time、Rework Rate、AI Cost / Work。
9. **ボトルネック検出 `core/bottleneck.ts`**：待ち行列の長さと待ち時間から、最大のボトルネックになっている Task または人を返す。
10. **events**：`TaskStarted` `TaskCompleted` `TaskFailed` `ReworkDetected` `ProjectCompleted` `BottleneckChanged`
11. **バランステスト基盤**
    - `tests/helpers/strategies.ts`：戦略 Bot（`allHuman` `allAiNoReview` `aiWithReview` `smart`（AI適性の高い Task だけ AI に任せ、残りは人間））。各 Bot は `state → Command[]` の関数とする
    - `tests/helpers/compare.ts`：複数の seed（例：20個）で平均を取って比較するユーティリティ（乱数の偶然に左右されないようにするため）

## テスト
- `tests/unit/formulas.test.ts`：単調性（難易度が上がると成功率が下がる、など）と、値が範囲内に収まること
- `tests/unit/bottleneck.test.ts`
- `tests/content/projects.test.ts`：全案件が validate を通る
- `tests/balance/basics.test.ts`
  - `allHuman` より `smart` の方が Profit / Human Hour が高い
  - `allAiNoReview` は `aiWithReview` より品質が低い
  - 実装を AI 化すると、ボトルネックが QA またはレビューへ移る（企画書20章）

## 完了条件
- [ ] ECサイトリニューアル案件を `runHeadless` で最後まで実行でき、スコアが算出される
- [ ] 上記テストがすべて通る
- [ ] `content/balance.ts` 以外の場所にバランス用の数値リテラルがない（計算式内の 0・1 などの数学定数は除く）
- [ ] 仮 UI で、Task の一覧・担当の変更・スコアを確認できる
- [ ] `npm run check` が exit 0

## スコープ外
3D 表示・正式な UI・Context・Harness

## `/goal` プロンプト
```
/goal docs/plan/README.md と docs/plan/phase-03-tasks-and-scoring.md を読み、Phase 03「案件・Task・担当モード・スコア」を実装する。完了条件（すべて会話内で示すこと）: (1) phase ファイルの「完了条件」の全項目を、根拠（コマンド出力・テスト名・ファイルパス）付きで ✓ 一覧として報告している (2) `npx vitest run tests/balance tests/content tests/unit` の出力で、basics.test.ts の3つのバランステスト（smart > allHuman、レビューなしの品質低下、ボトルネックの移動）が pass していることを示している (3) ECサイトリニューアル案件を戦略 smart と allHuman でヘッドレス実行したときの Profit/Human Hour・人間時間・品質の比較表を会話に示している (4) `npm run check` を実行し、exit code 0 で終わった出力の末尾を示している (5) 変更を「Phase 03: ...」というメッセージでコミットし、`git status --short` の出力が空であることを示している。制約: コマンドは project/ ディレクトリで実行する。docs/plan/ と docs/企画書.md は変更しない（計画の誤りや矛盾は最終報告に書く）。既存テストを削除・skip・弱体化しない。テストを通すために判定条件を緩めず、balance.ts の調整で通す。後続 Phase の機能を先取りしない。体験・見た目・スコープに影響する判断が必要になったら、文章で質問して止まらず AskUserQuestion で私に確認する。それ以外の実装上の判断は docs/plan/README.md の方針に沿って自分で決め、判断内容を最終報告に書く。40ターンで未達なら作業を止め、完了した項目・未完了の項目・残課題を報告する。
```
