# Phase 13: Seat / Model の経済・複数案件・キャンペーン・セーブ

## 目的
企画書6章・21章。Claude Team のシートとモデルを経営資源にし、「全員を Premium にすれば強い」わけではないことを体験させる。案件が進むにつれて、複数の案件を同時に回すようにする。

## 前提
Phase 12

## やること
1. **Seat（`content/seats.ts`）**：Standard と Premium。月額費用（企画書6章の価格をゲーム内の円に換算する係数は `balance.ts` に置く）と AI 使用可能量の上限。上限を超えると速度が落ちる、または待ちが発生する。固定費は日割りで計上する。
2. **Model（`content/models.ts`）**：上位・標準・軽量の3段階（実在のモデル名を使うかどうかは i18n の文言で差し替えられるようにする）。能力・速度・使用量あたりの消費量が異なる。使用量は Seat の上限から消費する。
3. **社員（`content/staff.ts`）**：PM・Designer・Developer A/B・QA など。時給・得意分野・割り当てる Seat を持つ。
4. **社員と Seat の画面**：誰にどの Seat を割り当てるかを選ぶ。変更時に「AI 容量 +400% / 費用 +¥XX,XXX / 月」を即座にプレビューする（企画書47章）。
5. **複数案件の同時進行**：同時に2〜3件を進める。案件の切り替えはタブで行い、3D では複数のフロア、またはフロアの区画として表示する。人と Seat の容量は案件をまたいで共有される。
6. **キャンペーン（`content/campaign.ts`）**：案件の受注順・解放・難易度の上昇をデータで定義する。チュートリアル → ECサイト → 決済修正 → コーポレートサイト → SaaS機能 → 複数同時進行、の順にする。1プレイ20〜30分に収める（企画書21章）。
7. **会社の資産**：作成した Skill や Workflow は次の案件へ持ち越す（Phase 16 の Library の準備）。
8. **セーブ / ロード**：キャンペーンの進行状況を自動保存し、タイトル画面から「続きから」を選べるようにする。

## テスト
- `tests/unit/seats.test.ts`：上限を超えたときの速度低下、日割りの固定費
- `tests/content/campaign.test.ts`：全案件の参照先が存在し、解放の順序が矛盾しない
- `tests/balance/seats.test.ts`：**全員 Premium は最適ではない**。「Agent を運用する人だけ Premium」が「全員 Premium」より Profit / Human Hour が高い
- `tests/balance/workflow-vs-premium.test.ts`：**Premium を増やすより Workflow を直す方が効く**場面がある（企画書68章）
- `tests/balance/campaign.test.ts`：smart 系の戦略 Bot がキャンペーンを最後までクリアでき、所要時間（実時間換算・1倍速）が20〜30分の範囲に収まる

## 完了条件
- [ ] Seat と Model を割り当てて変更でき、プレビューが即座に表示される
- [ ] 2件以上の案件を同時に進められる
- [ ] キャンペーンを最初から最後まで通しで遊べ、途中から再開できる
- [ ] 上記テストが通る。`npm run check` が exit 0

## `/goal` プロンプト
```
/goal docs/plan/README.md と docs/plan/phase-13-economy-campaign.md を読み、Phase 13「Seat/Modelの経済・複数案件・キャンペーン・セーブ」を実装する。完了条件（すべて会話内で示すこと）: (1) phase ファイルの「完了条件」の全項目を、根拠（コマンド出力・テスト名・ファイルパス）付きで ✓ 一覧として報告している (2) balance/seats・workflow-vs-premium の各テストが pass し、比較値（全員Premium vs 一部Premium、Premium追加 vs Workflow改善 の Profit/Human Hour）を出力で示している (3) balance/campaign.test.ts が pass し、キャンペーン全体の所要時間（実時間換算）と各案件の Profit/Human Hour を出力で示している (4) `npm run check` を実行し、exit code 0 で終わった出力の末尾を示している (5) 変更を「Phase 13: ...」というメッセージでコミットし、`git status --short` の出力が空であることを示している。制約: コマンドは project/ ディレクトリで実行する。docs/plan/ と docs/企画書.md は変更しない（計画の誤りや矛盾は最終報告に書く）。テストを通すために判定条件を緩めず、balance.ts とコンテンツの調整で通す。既存テストを削除・skip・弱体化しない。後続 Phase の機能を先取りしない。体験・見た目・スコープに影響する判断が必要になったら、文章で質問して止まらず AskUserQuestion で私に確認する。それ以外の実装上の判断は docs/plan/README.md の方針に沿って自分で決め、判断内容を最終報告に書く。40ターンで未達なら作業を止め、完了した項目・未完了の項目・残課題を報告する。
```
