# Phase 04: アセットパイプライン・デザイントークン・SVGアイコン

## 目的
絵文字に頼らず、SVG・WebP・3Dモデル（glb）でリッチな見た目を作るための制作基盤を用意する。すべての成果物は `index.html` にインライン化される。

## 前提
D1（ビジュアルの方向性が `content/look/visual.ts` の既定値として決まっていること）。Phase 02・03 とは独立している。

## 方針
- 外部の素材ファイルに依存せず、**素材はすべてリポジトリ内のコードと SVG から生成する**。生成スクリプトは `tools/assets/` に置き、生成物は `src/assets/generated/` にコミットする（ビルド時に毎回生成しない。ビルドを速く、再現可能にするため）。
- 後から人が作ったモデルや画像に差し替えられるように、ランタイムは「アセットID → URL（data URI）」の対応表を経由して読み込む。

## やること
1. **デザイントークン**（`src/styles/tokens.css` の `@theme`）。値は D1 で決めた `content/look/visual.ts` から導出する
   - Neutral（背景は真っ白ではない薄いトーン）、Primary、Success、Warning、Danger、各色の 50〜900 段階
   - 角丸（大きめ）、影（柔らかい多層の影）、余白のスケール、文字サイズのスケール（本文は小さくしない）、イージングとデュレーション
   - フォントは `system-ui` 系のみ（企画書39章）
   - 3D 側でも同じ色を使う。値の二重管理は避け、`content/look/visual.ts` を正本にして CSS 変数を生成するか、テストで一致を検証する
   - `tests/unit/contrast.test.ts`：文字色と背景色の組み合わせが WCAG AA（4.5:1）を満たすこと
2. **SVG アイコンセット**（`src/assets/icons/*.svg` → Solid コンポーネント `<Icon name="..."/>`）
   - D1 で決めた画風に沿った、統一感のあるオリジナルアイコン。初期セットは約30個：人間、AI、レビュー、Workflow、Context、Skill、Hook、Tool、Eval、Subagent、Permission、Seat、Model、お金、時計、警告、成功、失敗、ボトルネック、自動化、Session、Handoff、案件、QA、実装、設計、調査、要件、リリースなど
   - `currentColor` とトークンの CSS 変数で配色を変えられるようにする
   - SVG は Vite の `?raw` で読み込み、ビルド時に最適化する（`svgo` を dev 依存に追加）
3. **SVG → WebP**（`tools/assets/raster.ts`、`sharp` を使う）
   - 描画負荷の高い SVG（多数のグラデーションやフィルタを使うイラスト）は WebP に事前ラスタライズする。対象：タイトル画面のキービジュアル、結果画面の背景、床や壁のテクスチャ、トゥーン用の matcap・グラデーションマップ
   - 解像度は 1x と 2x、品質の設定は `tools/assets/config.ts` に集約する
4. **3D モデル生成**（`tools/assets/models/*.ts` → `.glb`）
   - three の形状（角丸ボックス、カプセル、球など）を組み合わせ、ローポリでポップなモデルを手続き生成し、`GLTFExporter`（Node 上で動かす。必要なら最小限の polyfill を入れる）で書き出す。その後 `@gltf-transform` で dedup・quantize・meshopt 圧縮する
   - 頂点カラーと簡易 AO を焼き込み、テクスチャを使わずに立体感を出す
   - このフェーズでは **パイプラインの確認用に1モデル（デスク）** だけ作る。キャラクターや小物は Phase 05 で作る
5. **ランタイムのアセットレジストリ**（`src/assets/registry.ts`）：`getTexture(id)` `getModel(id)` はキャッシュ付きの非同期関数とする。glb の読み込みには `GLTFLoader` と `MeshoptDecoder` を使う。
6. **npm scripts**：`assets`（全部を生成）、`assets:check`（生成物が最新かどうかをハッシュで比較する。`check` に含める）
7. **スタイルガイドの画面**（`?dev=styleguide` で開く開発用のページ）：トークン・アイコン一覧・WebP・デスクモデルの回転表示

## テスト
- `tests/unit/contrast.test.ts`
- `tests/build/assets.test.ts`：レジストリの全IDに対応する生成物が存在する、各アセットのサイズが予算内に収まる（予算は `tools/assets/config.ts` に置く）
- `tests/unit/icons.test.ts`：全アイコンが同じ viewBox を持つ、外部参照（`href="http`）がない

## 完了条件
- [ ] `npm run assets` で WebP と glb が生成され、`src/assets/generated/` にコミットされている
- [ ] スタイルガイドの画面にアイコン約30個・WebP・デスクモデルが表示される
- [ ] 上記テストがすべて通る
- [ ] `npm run check`（`assets:check` を含む）が exit 0
- [ ] `verify:dist` のサイズ予算内に収まっている

## スコープ外
ゲーム画面への組み込み（Phase 05・06）

## `/goal` プロンプト
```
/goal docs/plan/README.md と docs/plan/phase-04-asset-pipeline.md を読み、Phase 04「アセットパイプライン・デザイントークン・SVGアイコン」を実装する。完了条件（すべて会話内で示すこと）: (1) phase ファイルの「完了条件」の全項目を、根拠（コマンド出力・テスト名・ファイルパス）付きで ✓ 一覧として報告している (2) `npm run assets` の出力と、`ls -la src/assets/generated` で生成された WebP と glb の一覧・サイズを示している (3) contrast / assets / icons のテストが pass している出力を示している (4) 作成したアイコン名の一覧（30個前後）を示している (5) `npm run check` を実行し、exit code 0 で終わった出力の末尾（verify:dist のサイズを含む）を示している (6) 変更を「Phase 04: ...」というメッセージでコミットし、`git status --short` の出力が空であることを示している。制約: コマンドは project/ ディレクトリで実行する。docs/plan/ と docs/企画書.md は変更しない（計画の誤りや矛盾は最終報告に書く）。絵文字をアイコンやキャラクターの代わりに使わない。外部の素材ファイルやURLに依存しない。既存テストを削除・skip・弱体化しない。後続 Phase の機能を先取りしない。体験・見た目・スコープに影響する判断が必要になったら、文章で質問して止まらず AskUserQuestion で私に確認する。それ以外の実装上の判断は docs/plan/README.md の方針に沿って自分で決め、判断内容を最終報告に書く。40ターンで未達なら作業を止め、完了した項目・未完了の項目・残課題を報告する。
```
