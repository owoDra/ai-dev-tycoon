# Phase 12: Harness 由来の事件・Autonomy Streak・ボトルネックの移動

## 目的
企画書19章・20章・23章。技術的な問題を「敵」として登場させ、「高速化すると次のボトルネックがどこへ移るか」を探すゲームにする。最大の報酬である **AUTONOMY STREAK** を作る。

## 前提
Phase 11

## やること
1. **事件の追加（`content/incidents.ts`）**：Retry Spiral、Agent Drift、Missing Validation、Coordination Explosion、Human Bottleneck。Phase 10 の事件の仕組みにデータを追加するだけで実装する。それぞれの解決アクションは Harness 部品の導入や設定変更につなげる（例：Missing Validation → Eval を導入する）。
2. **敵としての演出**：事件ごとに 3D の「バグ生物」のようなモデルを島に出現させる（ポップでかわいく、怖くしない）。解決すると弾けて消える（Tier 2〜3）。モデルは `tools/assets/models/incidents/` で生成する。
3. **Autonomy の計測（`core/autonomy.ts`）**
   - 人間が介入せずに AI が処理を続けた時間を Streak として計測する。人間のレビュー・修正・承認が入ると途切れる
   - 「人間の介入間隔」の平均と最大を記録する
   - Streak のしきい値（30分・60分・2時間…。`balance.ts` で定義する）を超えるたびに `AutonomyMilestone` イベントを出す
4. **AUTONOMY STREAK の演出（Tier 4）**：「AUTONOMY STREAK 74 MIN」の大きなタイポグラフィ、BGM のレイヤー追加、Agent たちのハイタッチのアニメーション。HUD の小さな Streak メーターが燃え上がるように変化する。
5. **ボトルネックの移動の可視化**
   - `BottleneckChanged` イベントで、旧ボトルネックの島が落ち着き、新しいボトルネックの島へカメラが案内する（自動移動はせず、矢印とボタンで知らせる）
   - 工程ごとの時間を Before → After の棒グラフで比較するミニパネル（企画書20章の「Implementation 8h → 20m、QA 3h ← Bottleneck」）
6. **Visual Reward（企画書61章）**：人間の島が減って Agent ＋ Eval の整った配置になるほど、オフィスが明るく整っていく（床の模様・照明・植物が増える）。ViewModel に「整理度」を持たせる。
7. 新しい案件：`content/projects/saas-feature.ts`（Human Bottleneck が起きやすい案件）

## テスト
- `tests/unit/autonomy.test.ts`：人間が介入すると Streak がリセットされる、しきい値を超えるとイベントが1回だけ出る
- `tests/content/incidents.test.ts`：全事件に解決アクションと3段構成の文言がある
- `tests/balance/bottleneck.test.ts`：企画書20章のシナリオどおり、実装を AI 化 → QA がボトルネック → QA を AI 化 → 人間レビューがボトルネック → Eval を導入 → 全工程が短くなる、という順にボトルネックが移る
- `tests/balance/autonomy.test.ts`：Hook と Eval を導入した構成は、未導入の構成より人間の介入間隔が5倍以上長い（企画書23章：8分 → 74分）

## 完了条件
- [ ] 8種類の事件すべてが発生し、解決できる（Phase 10 の3種類 ＋ 5種類）
- [ ] AUTONOMY STREAK の演出が発生する
- [ ] ボトルネックの移動がプレイ中に視覚的に分かる
- [ ] 上記テストが通る。`npm run check` が exit 0

## `/goal` プロンプト
```
/goal docs/plan/README.md と docs/plan/phase-12-autonomy-bottleneck.md を読み、Phase 12「Harness由来の事件・Autonomy Streak・ボトルネックの移動」を実装する。完了条件（すべて会話内で示すこと）: (1) phase ファイルの「完了条件」の全項目を、根拠（コマンド出力・テスト名・ファイルパス）付きで ✓ 一覧として報告している (2) balance/bottleneck.test.ts が pass し、各段階のボトルネック名と工程時間の推移を出力で示している (3) balance/autonomy.test.ts が pass し、導入前後の人間の介入間隔（分）を出力で示している (4) 事件8種の一覧（発生条件の概要 → 解決アクション）を表で示している (5) `npm run check` を実行し、exit code 0 で終わった出力の末尾（verify:dist のサイズを含む）を示している (6) 変更を「Phase 12: ...」というメッセージでコミットし、`git status --short` の出力が空であることを示している。制約: コマンドは project/ ディレクトリで実行する。docs/plan/ と docs/企画書.md は変更しない（計画の誤りや矛盾は最終報告に書く）。事件はデータ追加で実装し、事件ごとの分岐を core に書かない。テストを通すために判定条件を緩めない。既存テストを削除・skip・弱体化しない。後続 Phase の機能を先取りしない。体験・見た目・スコープに影響する判断が必要になったら、文章で質問して止まらず AskUserQuestion で私に確認する。それ以外の実装上の判断は docs/plan/README.md の方針に沿って自分で決め、判断内容を最終報告に書く。40ターンで未達なら作業を止め、完了した項目・未完了の項目・残課題を報告する。
```
