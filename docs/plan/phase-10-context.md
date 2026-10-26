# Phase 10: Context・Session / Handoff・事件システム

## 目的
企画書9〜12章と19章（Context に関わる事件）。「情報は多いほど強い」わけではないこと、「履歴を全部持つこと」と「必要な作業状態を残すこと」は違うことを体験させる。

## 前提
D5

## やること
1. **資料（Document）のコンテンツ化（`content/documents.ts`）**：案件ごとの資料一覧。各資料は `relevantTo: TaskId[]`、`stale`（古い仕様）、`conflictsWith`（矛盾するルール）、`size` を持つ。
2. **Context モデル（`core/context.ts`）**
   - AI Worker のセッションごとに `relevant` と `noise` を持つ。渡した資料と経過時間から計算する
   - `noise` が増えると、AIコストの増加・誤判断率の上昇・古い仕様の参照・Tool の誤選択の確率が上がる（係数は `balance.ts` に置く）
   - セッションを続けるほど noise が少しずつ溜まる
3. **Context の受け渡し方の選択（UI）**：最初は「必要な資料だけ / すべての資料」の2択（Recognition over Recall）。解放後は資料を個別に選べるチェックリストになり、最後に「Context Router（自動選別）」を Harness 部品として解放する（Phase 11 で Builder に統合する）。
4. **Session Reset / Handoff**
   - `NewSession` Command：noise は 0 になるが、Handoff がなければ「決定事項の喪失」で品質が下がったり手戻りが起きたりする
   - `Handoff` の設定：Goal / Decisions / Constraints / Modified Files / Validation / Remaining Work から、何を残すかを選ぶ。必要なものが欠けると対応するペナルティが発生する
   - **Artifact Driven Work**（企画書12章）：「成果物に状態を保存する」設定にすると、Session が切れても少ないコストで再開できる
5. **事件システム（`core/incidents.ts` と `content/incidents.ts`）**
   - `IncidentDef`：id、発生条件（state から確率を計算する宣言的な定義）、影響（modifier）、解決アクション（Command）、文言（問題 → 原因 → 次の行動、企画書49章）
   - この Phase で入れる事件：Context Overflow、Stale Context、Instruction Conflict
   - 発生した事件は「次に対応すべき問題」カードで最優先に表示し、解決ボタンから直接対処できるようにする
6. **Context の状態表示**：基本は「● 良好 / ! 散らかり / × 溢れ」の意味を表示し、クリックすると Relevant と Noise の内訳を見られる（企画書41章）
7. **新しい案件**：`content/projects/payment-fix.ts`（決済画面の修正。資料が多く、Context の設計が効く案件）
8. 解放と用語：Context Routing、Session Handoff を、体験した後に明かす

## テスト
- `tests/unit/context.test.ts`：無関係な資料を足すと noise が増える、NewSession で noise が 0 になる
- `tests/unit/incidents.test.ts`：条件を満たすと発生確率が上がる、解決アクションで事件が解消される
- `tests/balance/context.test.ts`
  - 決済修正案件で「必要な資料だけ」は「すべての資料」より Profit / Human Hour が高い（企画書10章）
  - 長い Session では、Handoff 付きで NewSession した場合が、そのまま続けた場合と、Handoff なしで Reset した場合の両方を上回る（企画書11章）

## 完了条件
- [ ] Context の受け渡し方を選択でき、事件が発生して解決できる
- [ ] Handoff の項目を選んで NewSession でき、欠けた項目に応じた影響が出る
- [ ] 上記テストが通る。`npm run check` が exit 0

## `/goal` プロンプト
```
/goal docs/plan/README.md と docs/plan/phase-10-context.md を読み、Phase 10「Context・Session/Handoff・事件システム」を実装する。完了条件（すべて会話内で示すこと）: (1) phase ファイルの「完了条件」の全項目を、根拠（コマンド出力・テスト名・ファイルパス）付きで ✓ 一覧として報告している (2) balance/context.test.ts が pass し、「必要な資料だけ vs すべての資料」「Handoff付きReset vs 継続 vs Handoffなし」の Profit/Human Hour の比較値を出力で示している (3) context / incidents のテストが pass している出力を示している (4) 追加した事件3種の「問題 → 原因 → 次の行動」の文言を示している (5) `npm run check` を実行し、exit code 0 で終わった出力の末尾を示している (6) 変更を「Phase 10: ...」というメッセージでコミットし、`git status --short` の出力が空であることを示している。制約: コマンドは project/ ディレクトリで実行する。docs/plan/ と docs/企画書.md は変更しない（計画の誤りや矛盾は最終報告に書く）。テストを通すために判定条件を緩めず、balance.ts とコンテンツの調整で通す。既存テストを削除・skip・弱体化しない。後続 Phase の機能を先取りしない。体験・見た目・スコープに影響する判断が必要になったら、文章で質問して止まらず AskUserQuestion で私に確認する。それ以外の実装上の判断は docs/plan/README.md の方針に沿って自分で決め、判断内容を最終報告に書く。40ターンで未達なら作業を止め、完了した項目・未完了の項目・残課題を報告する。
```
