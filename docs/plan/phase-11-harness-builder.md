# Phase 11: Harness Builder

## 目的
企画書7〜8章・13〜18章・35章・48章。「Model × Harness × 使用可能量」で AI Worker の実力が決まることと、「AIへのお願い」と「システムとして保証すること」の違いを体験させる。

## 前提
Phase 10

## やること
1. **Harness 部品のコンテンツ化（`content/harness/*.ts`）**：部品はすべて同じ型 `HarnessPartDef` にする
   - 共通項目：id、カテゴリ（skill / hook / tool / permission / eval / subagent / contextRouter）、導入コスト、ランニングコスト、`modifiers`（成功率・速度・noise・人間介入・AIコスト・セキュリティリスクへの補正）、`appliesTo`（Task の種類）、解放条件
   - **Skill**：Frontend Change、Report、PR Review など。一度作ると以降の案件でも再利用できる（会社の資産として持ち越す）
   - **Hook**：Formatter、Linter、Unit Test。「お願い（指示文に書く）」と「Hook（強制）」の両方を選択肢として用意し、お願いの場合は確率的にしか守られないようにする
   - **Tools / MCP**：Files、Git、Browser、Database、Analytics、Communication。数を増やすと Tool の複雑さとセキュリティ面のリスクが上がる
   - **Permissions**：READ / WRITE / EXECUTE / DEPLOY と Human Gate。過剰な権限を与えると事故の確率が上がる
   - **Eval**：Unit Test、受け入れ基準、Accessibility、Security、Coding Rules、UI要件。Generate → Eval → FAIL → Repair → Eval のループで、失敗を人間より先に検出して自動修復する
   - **Subagent**：Research、Code、QA への分割。並列化による速度向上と、調整コスト（Subagent 数の2乗で増える）のトレードオフ
2. **計算式の統合**：Phase 03 の計算式を、Worker が装着している部品の modifier の合算で補正する形に拡張する。カテゴリごとに合算方法（加算・乗算・上限付き）を `balance.ts` で定義する。
3. **Harness Builder の UI（カード形式。ノードエディタにはしない。企画書35章）**
   - AI Worker のカード：モデル / 渡す情報 / ツール / 自動化 / 検証 / 権限 / 分担 の各行。行を押すと選択肢のシートが開く
   - 選択肢にフォーカスするたびに、**Before → After の予測**（人間時間・AIコスト・品質・自律時間）を即座に表示する（Phase 06 の forecast を拡張する）
   - 確定時：「✓ Test Hook を導入」というトースト。効果が大きい場合は Tier 3 の演出
   - 詳細（modifier の内部値など）は「詳しく見る」を開いたときだけ表示する
4. **3D への反映**：部品を装着すると Agent のモデルに小物が付く（Hook はベルトのギア、Eval はチェックの盾、Subagent は子機が周りを回る、など）。Workflow 化するとコンベアが自動化レーンに変わる。
5. **Agent Workflow の正式化**：複数の Task を1つの Workflow としてまとめて Agent に任せられるようにする（企画書5章）
6. 新しい案件：`content/projects/corporate-site.ts`（中規模。Harness の効果が大きく出る案件）

## テスト
- `tests/content/harness.test.ts`：全部品の modifier が範囲内で、解放条件の参照先が存在する
- `tests/unit/harness-modifiers.test.ts`：合算のルール（上限・乗算）
- `tests/balance/harness.test.ts`（★企画書の核）
  - **高いモデルを買えば勝ちにならない**：最上位モデル ＋ Harness なし ＜ 標準モデル ＋ 適切な Harness（Profit / Human Hour）
  - **Hook ＞ お願い**：同じ内容でも Hook にした方が手戻り率が低い
  - **Eval で人間の介入間隔が伸びる**
  - **Subagent は増やすほど強いわけではない**：Subagent 数と成果の関係が山型になり、最適値は 2〜3
  - **Tool は多ければ良いわけではない**：全部入りは必要最小限より事故率が高い

## 完了条件
- [ ] Harness Builder から部品を付け外しでき、Before → After の予測が即座に更新される
- [ ] 部品の装着が 3D の見た目に反映される
- [ ] 上記テストが通る。`npm run check` が exit 0

## `/goal` プロンプト
```
/goal docs/plan/README.md と docs/plan/phase-11-harness-builder.md を読み、Phase 11「Harness Builder」を実装する。完了条件（すべて会話内で示すこと）: (1) phase ファイルの「完了条件」の全項目を、根拠（コマンド出力・テスト名・ファイルパス）付きで ✓ 一覧として報告している (2) balance/harness.test.ts の5つの原則テストが pass し、それぞれの比較値（例: 最上位モデル+Harnessなし vs 標準モデル+Harness の Profit/Human Hour、Subagent 数 1〜5 ごとの成果）を出力で示している (3) 追加した Harness 部品の一覧（カテゴリ・名前・主な modifier）を表で示している (4) `npm run check` を実行し、exit code 0 で終わった出力の末尾を示している (5) 変更を「Phase 11: ...」というメッセージでコミットし、`git status --short` の出力が空であることを示している。制約: コマンドは project/ ディレクトリで実行する。docs/plan/ と docs/企画書.md は変更しない（計画の誤りや矛盾は最終報告に書く）。部品ごとの特別扱いを計算式に書かず、modifier のデータで表現する。テストを通すために判定条件を緩めず、balance.ts とコンテンツの調整で通す。既存テストを削除・skip・弱体化しない。後続 Phase の機能を先取りしない。体験・見た目・スコープに影響する判断が必要になったら、文章で質問して止まらず AskUserQuestion で私に確認する。それ以外の実装上の判断は docs/plan/README.md の方針に沿って自分で決め、判断内容を最終報告に書く。40ターンで未達なら作業を止め、完了した項目・未完了の項目・残課題を報告する。
```
