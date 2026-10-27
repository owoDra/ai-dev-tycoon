# AI業務改善タイクーン 実装計画

企画書: `docs/企画書.md`　／　AI 向けのプロジェクト規約: `.claude/CLAUDE.md`

**パスの表記**：この計画に出てくる `src/` `tests/` `tools/` `content/` `dist/` などのパスは、特記がない限り **`project/` からの相対パス** である。npm のコマンドもすべて `project/` で実行する。

この `docs/plan/` は **実装を進めるための作業計画** であり仕様の正本ではない。
実装後の正本はソースコード・テストコード・コメントである。plan と実装が食い違った場合は実装（とテスト）を正とし、plan は追従更新しない。

---

## 1. 前提条件（全Phase共通の制約）

| 制約 | 内容 |
|---|---|
| 成果物 | `dist/index.html` **1ファイルのみ**。JS / CSS / SVG / WebP / glb / フォント不使用。外部URL参照ゼロ。`file://` で直接開いて動作 |
| 軽量・高速 | 初回表示 < 1.5s（一般的なノートPC）、プレイ中 60fps、操作から反応まで < 50ms |
| 体験 | インタラクティブ、フィードバック満載、段階的なドーパミン演出、ポップなデザイン、見下ろし2.5D |
| 拡張性 | 案件・Task・Harness部品・事件・演出・効果音は **データ追加だけ** で増やせる。バランス値は1か所に集約 |
| テスト | `src/` と `tests/` を分離。E2E は作らない |
| ドキュメント | コード・テスト・コメントで表せることは docs に書かない。`docs/` は企画意図など「コードにできないもの」だけ |
| リポジトリ構成 | ルートはシンプルに保つ。ドキュメントは `docs/`、ソース・テスト・設定・ツールはすべて `project/` 配下に置く |
| ユーザーへの確認 | `/goal` の実行中に体験・見た目・スコープに影響する判断が必要になったら、文章で質問して止まらず **AskUserQuestion** で確認する |

## 2. 技術スタック

| 用途 | 採用 |
|---|---|
| 言語 | TypeScript（strict, `noUncheckedIndexedAccess`） |
| UI | SolidJS |
| スタイル | Tailwind CSS v4（`@tailwindcss/vite`、トークンは CSS の `@theme` に定義） |
| アニメーション | `motion`（旧 Framer Motion。`animate()` を DOM・数値・Three.js オブジェクトに共通で使う） |
| 2.5D 描画 | Three.js（直交カメラによるアイソメトリック表示、必要なモジュールだけ import して tree-shake） |
| 音 | Web Audio API による自作オーディオエンジン（合成音・プロシージャルBGM） |
| ビルド | Vite + `vite-plugin-singlefile`（すべてのアセットを data URI でインライン化） |
| アセット生成 | `tools/assets/`（Node スクリプト）: SVG → WebP（`sharp`）、手続き生成モデル → glb（three の `GLTFExporter` + `@gltf-transform` で最適化） |
| テスト | Vitest（core は node 環境、UI ロジックは必要最小限で jsdom） |
| Lint / Format | Biome |

## 3. アーキテクチャ

```
content/  ── 型付きデータ（案件・Task・Model・Seat・Harness部品・事件・解放・演出・効果音）
   │          balance.ts に係数を集約
   ▼
core/     ── 純粋関数・決定論的・DOM非依存
   │          state' = reduce(state, command)   プレイヤー操作は全て Command
   │          state' = step(state, dt)            固定ステップ。RNG は state 内の seed 付き乱数
   │          → GameEvent[] を出力
   ▼
view/     ── state → ViewModel のセレクタ（純粋・テスト可能）
   ├─► world/  Three.js 2.5D。ViewModel を読んで描画するだけ
   ├─► ui/     Solid。ViewModel を表示し Command を発行
   ├─► fx/     GameEvent → 演出 Tier → モーション・VFX
   └─► audio/  GameEvent → 効果音・BGM の強度
```

**不変ルール**
1. `core/` では `Math.random`・`Date`・DOM・Three.js を使わない。同じ Seed と同じ Command 列からは必ず同じ結果になる。
2. 描画・UI・演出・音は state を **読むだけ**。状態を変えるのは Command だけ。
3. 新しい要素はまず `content/` のデータとして表現できないか検討する。計算式は「データが持つ modifier を合算する」形にする。
4. ゲーム内の文言は `src/i18n/ja.ts` に集約する。UI は日本語を基本にする。
5. 演出は非ブロッキング。`prefers-reduced-motion` を尊重する。状態は色だけでなくアイコンとラベルでも伝える。
6. 「企画書の設計意図」は `tests/balance/` の戦略シミュレーションテストとして表現する（例：「高いモデルを買えば勝ち」にならない）。

## 4. ディレクトリ構成（最終形）

```
（リポジトリのルート）
├─ .claude/
│   └─ CLAUDE.md                # AI 向けのプロジェクト規約
├─ docs/                        # コードで表せないものだけ
│   ├─ 企画書.md
│   ├─ plan/                    # この計画
│   └─ decisions/               # デザイン決定（D1〜D5）の理由とコメント
├─ project/                     # ソース・テスト・設定・ツールのすべて
│   ├─ package.json  vite.config.ts  tsconfig.json  biome.json  .gitignore
│   ├─ src/
│   │   ├─ main.tsx  app/       # 起動・画面遷移・ゲームループ
│   │   ├─ core/                # シミュレーション（純粋関数）
│   │   ├─ content/             # ゲームデータ・balance.ts
│   │   │   └─ look/            # 見た目・手触りのプリセット（visual / world / layout / feel）
│   │   ├─ view/                # セレクタ・ViewModel
│   │   ├─ world/               # Three.js 2.5D
│   │   ├─ ui/                  # Solid コンポーネント
│   │   ├─ fx/  audio/  i18n/  styles/
│   │   ├─ assets/              # インライン化される SVG / WebP / glb（generated/ は生成物）
│   │   └─ dev/                 # 開発用ページ（explore の比較シェル・tweak・styleguide など）
│   ├─ tests/
│   │   └─ unit/  content/  balance/  view/  ui/  build/  helpers/
│   └─ tools/
│       ├─ assets/              # アセット生成スクリプト
│       └─ verify-dist.ts       # 単一ファイル・外部参照なし・サイズ予算の検証
└─ README.md                    # 遊び方とビルド方法だけ（Phase 17 で作成）
```
ルートに置くのは上の4つだけにする。ビルド成果物（`project/dist/` `project/dist-explore/`）や `node_modules` は `project/` の中に閉じ込める。

### 見た目と手触りのパラメータ化（デザイン決定ポイントのため）
見た目・手触りに関わる値は計算ロジックと分け、**`content/look/` のプリセット**に集約する。
カメラ角度・陰影の方式・アウトライン・配色・キャラクターの形・UIのレイアウト・演出の強さ・音色などが対象。
案A・B・Cはプリセットの違いとして作るため、同じ画面で即座に切り替えて比較できる。
`?dev=tweak` の調整パネルで値をスライダー操作し、JSON として書き出せる（決定後は調整ツールとして使い続ける）。

## 5. 共通の完了定義（Definition of Done）

すべての Phase で次を満たすこと。

- `project/` で実行した `npm run check` が exit code 0 で終わる
  （= `typecheck` → `lint` → `test` → `build` → `verify:dist`）
- 新しいロジックにはテストを追加している（テストは `tests/` 配下）
- 既存テストを削除・skip・弱体化していない（バランス変更でテストの期待値を変える場合は、理由をコミットメッセージに書く）
- `dist/index.html` が単一ファイルで、サイズ予算（Phase 01 で `tools/verify-dist.ts` に定義）を満たしている
- 変更はコミット済みで `git status` がクリーン

## 6. Phase 一覧

各 Phase は **Claude Code の1セッション + `/goal` で完了できる粒度** に分けている。表の上から順に実施する。
**D1〜D5 はデザイン決定ポイント**で、あなたが案を選んだり意見を出したりする（進め方は 8章）。

| # | ファイル | 内容 | 依存 |
|---|---|---|---|
| 01 | [phase-01-foundation.md](phase-01-foundation.md) | 開発基盤・単一HTMLビルド・検証スクリプト | – |
| 02 | [phase-02-sim-core.md](phase-02-sim-core.md) | シミュレーション基盤（State / Command / Step / RNG / Event） | 01 |
| 03 | [phase-03-tasks-and-scoring.md](phase-03-tasks-and-scoring.md) | 案件・Task・担当モード・計算式・スコア・バランステスト基盤 | 02 |
| **D1** | [design-D1-visual.md](design-D1-visual.md) | **ビジュアルの方向性**（配色・質感・アイコンの画風）。探索用の基盤もここで作る | 01 |
| 04 | [phase-04-asset-pipeline.md](phase-04-asset-pipeline.md) | アセット生成パイプライン・デザイントークン・SVGアイコン | D1 |
| 05 | [phase-05-world-3d.md](phase-05-world-3d.md) | Three.js 2.5D ワールド・3Dモデル・選択操作（見た目はプリセットで切り替え可能にする） | 03, 04 |
| **D2** | [design-D2-world-look.md](design-D2-world-look.md) | **2.5Dの見せ方**（カメラ・陰影の方式・キャラクター・ワークフローの表現） | 05 |
| **D3** | [design-D3-ui-layout.md](design-D3-ui-layout.md) | **画面構成**（HUD・パネル・問題カード） | D2 |
| 06 | [phase-06-ui-shell.md](phase-06-ui-shell.md) | Solid UI（HUD・詳細パネル・担当変更・キーボード・レスポンシブ） | D3 |
| 07 | [phase-07-fx-motion.md](phase-07-fx-motion.md) | 演出基盤（Tier・motion・3D VFX・reduced-motion） | 06 |
| 08 | [phase-08-audio.md](phase-08-audio.md) | オーディオエンジン（効果音・アダプティブBGM・立体音響） | 07 |
| **D4** | [design-D4-feel.md](design-D4-feel.md) | **手触り**（演出の強さ・音色のパレット） | 08 |
| 09 | [phase-09-tutorial.md](phase-09-tutorial.md) | 機能解放システム・最初の3分のチュートリアル | D4 |
| **D5** | [design-D5-first-playtest.md](design-D5-first-playtest.md) | **最初の3分の通しプレイ**とフィードバックの反映 | 09 |
| 10 | [phase-10-context.md](phase-10-context.md) | Context・Session/Handoff・事件システム | D5 |
| 11 | [phase-11-harness-builder.md](phase-11-harness-builder.md) | Harness Builder（Skill/Hook/Tool/Permission/Eval/Subagent）・Before/After 予測 | 10 |
| 12 | [phase-12-autonomy-bottleneck.md](phase-12-autonomy-bottleneck.md) | Harness 由来の事件・Autonomy Streak・ボトルネックの移動 | 11 |
| 13 | [phase-13-economy-campaign.md](phase-13-economy-campaign.md) | Seat / Model の経済・複数案件の同時進行・キャンペーン・セーブ | 12 |
| 14 | [phase-14-results.md](phase-14-results.md) | 結果画面・振り返り（改善効果の寄与分析） | 13 |
| 15 | [phase-15-party-mode.md](phase-15-party-mode.md) | 懇親会モード（Seed・結果コード・比較表） | 14 |
| 16 | [phase-16-library-practice.md](phase-16-library-practice.md) | Workflow Library・実務モード（ROI計算） | 14 |
| 17 | [phase-17-polish.md](phase-17-polish.md) | 全体のバランス調整・性能・サイズ・a11y・仕上げ | 15, 16 |
| 18 | [phase-18-rebalance-person-day.md](phase-18-rebalance-person-day.md) | 担当モードの再バランス（自動テストの支配の解消）・KPI を人日へ・売値と原価 | 17 |
| 19 | [phase-19-talent.md](phase-19-talent.md) | 人材の自動生成（能力と単価がさまざま）・採用 | 18 |
| 20 | [phase-20-generated-projects-bidding.md](phase-20-generated-projects-bidding.md) | 案件の自動生成・コンペ（見積額＋提案力）・キャンペーンの廃止 | 19 |
| 21 | [phase-21-growth-teams.md](phase-21-growth-teams.md) | 会社の成長・複数チーム・人間 PM / AI PM への委任（序盤は全員の担当をプレイヤーが決める） | 20 |
| 22 | [phase-22-long-play.md](phase-22-long-play.md) | 決算・目標と実績・後半の要素・長期のバランステスト | 21 |

## 7. `/goal` の使い方

1. Claude Code を **auto mode** で起動する（`/goal` は権限モードを変えないため、manual mode だとコマンドごとに確認が入る）。
2. 新しいセッション（または `/clear` の後）で、各 Phase ファイル末尾の「`/goal` プロンプト」をそのまま貼り付ける。
3. 進捗は `/goal`（引数なし）で確認し、中断したいときは `/goal clear` を使う。

**プロンプトの書き方の方針**：完了を判定するモデルはファイルを読まず、会話の内容だけで判断する。そのため各プロンプトには「コマンド出力と完了条件のチェックリストを **会話に示すこと**」を完了条件として含めている。各プロンプトは 4,000 文字以内に収めている。

**途中での確認**：`/goal` の実行中に Claude が文章で質問してターンを終えると、ゴールが未達のため自動で再開されてしまう。そのため確認が必要な場面では **AskUserQuestion** を使う（回答を待つ間は止まり、回答を受け取るとそのまま作業を続ける）。体験・見た目・スコープに影響する判断は AskUserQuestion で確認し、軽微な実装判断は Claude が決めて最終報告に書く。この規約は `.claude/CLAUDE.md` にも書いている。

## 8. デザイン決定ポイント（D1〜D5）の進め方

各 D は **1つの `/goal`（各 D ファイルの「探索・決定プロンプト」）** で、探索から決定の反映までを行う。あなたの選択は AskUserQuestion で受け取るため、`/goal` が勝手に先へ進むことはない。

```
① 探索      案A/B/C をプリセットとして実装し、切り替えられる比較ページを用意する
             → ローカル（project/ で npm run dev）で確認できる状態にし、単一HTMLを非公開の Artifact として公開する
             → 比較表・各案の狙いを会話に出す
② 選択      AskUserQuestion で質問する（選択肢：案A / 案B / 案C / 追加で探索してほしい）
             あなたは比較ページを見て触ってから回答する。細かい意見はメモ欄や「Other」に書く
             例:「B案。ただし色はA案寄り、キャラはもう少し丸く」
③ 追加探索  「追加で探索」や大きな修正の意見なら、意見を反映した案を追加して Artifact を再公開し、②に戻る（何回でも）
④ 反映      採用した値をコードの既定値にし、不採用の案を削除し、決定記録を残してコミットする
             → 反映後の比較ページで最終確認を AskUserQuestion で取り、OK ならゴール達成
```

別のセッションで決定を伝えたい場合（例：一晩考えてから決めたい）は、①の後に `/goal clear` で止め、後で各 D ファイルの「反映プロンプト」を使う。

**決定の記録**：採用した値そのものはコード（`content/look/` の既定値）が正本になる。コードで表せない「なぜそれを選んだか」「あなたのコメント」だけを `docs/decisions/Dn-*.md` に短く残す。

**探索の約束（各 D のプロンプトに含めている）**
- Claude はあなたの回答なしにどの案も採用しない。
- 案どうしの違いがはっきり分かるようにする（似た案を3つ出さない）。各案に「狙い」を1行付ける。
- 比較ページでは、案の切り替えボタンを画面の隅に常に表示する（Artifact ではクエリパラメータを使えないため）。探索用のビルドは `npm run build:explore` で `project/dist-explore/index.html` に出力する。
- Artifact は D ごとに1つとし、追加探索や反映のたびに同じ URL へ再公開する。URL は `docs/decisions/Dn-*.md` に記録する。
