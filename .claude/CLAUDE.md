# AI業務改善タイクーン

AIを適切な仕事へ配置し、人間1人あたりの利益を最大化する業務改善タイクーンゲーム。
成果物は外部依存ゼロの単一HTML（`project/dist/index.html`）。

- 企画書: `docs/企画書.md`（企画意図の正本）
- 実装計画: `docs/plan/README.md`（作業計画。仕様の正本ではない）
- デザイン決定の記録: `docs/decisions/`

## リポジトリ構成

ルートは `.claude/` `docs/` `project/`（と Phase 17 で作る `README.md`）だけに保つ。ルートにファイルを増やさない。

- `docs/`：コードで表せないもの（企画意図・計画・デザイン決定の理由）だけ
- `project/`：ソース（`src/`）・テスト（`tests/`）・ツール（`tools/`）・設定ファイルのすべて。`node_modules` やビルド成果物もここに閉じ込める

## コマンド（すべて `project/` で実行）

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run check` | typecheck → lint → test → build → verify:dist（完了判定はこれ） |
| `npm test` | Vitest |
| `npm run build` / `npm run build:explore` | 単一HTMLのビルド / デザイン比較用のビルド |
| `npm run assets` | SVG・WebP・glb の生成（生成物は `src/assets/generated/` にコミット） |

## 正本の扱い

- **ソースコード・テストコード・コメントが正本**。コードで表せることを docs に書かない。
- 計算式の意図は関数の JSDoc に、データの意味は型に、企画書の設計意図は `tests/balance/` のテストに書く。
- `docs/plan/` は実装に追従して更新しない。計画と実装が食い違ったら実装が正しい。計画の誤りに気付いたら報告する。

## 設計ルール（詳細は docs/plan/README.md の3章）

1. `src/core/` は純粋関数で決定論的にする。`Math.random`・`Date`・DOM・Three.js を使わない。
2. 状態を変えるのは Command だけ。描画・UI・演出・音は state と events を読むだけにする。
3. 新しい要素はまず `src/content/` のデータで表現する。バランス値は `content/balance.ts`、見た目と手触りの値は `content/look/` に集約する。
4. UI の文言は `src/i18n/ja.ts` に集約する。状態は色だけでなくアイコンとラベルでも示す。絵文字をアイコンやキャラクターの代わりに使わない。
5. 演出は操作をブロックしない。`prefers-reduced-motion` を尊重する。
6. 外部URL・CDN・外部フォント・音声ファイルを使わない。素材はリポジトリ内のコードと SVG から生成する。

## テスト

- テストは `project/tests/` に置き、`project/src/` と分ける。E2E は作らない。
- 既存テストを削除・skip・弱体化しない。バランステストが落ちたら判定条件ではなく `balance.ts` やコンテンツを調整する。期待値を変える場合は理由をコミットメッセージに書く。

## ユーザーへの確認（/goal 実行中を含む）

- 体験・見た目・スコープに影響する判断が必要になったら、**文章で質問してターンを終えず、AskUserQuestion で確認する**（`/goal` は文章の質問で止まると自動で再開してしまうため）。
- 軽微な実装上の判断は自分で決め、最終報告に判断内容を書く。
- デザイン決定（D1〜D5）では、ユーザーの回答なしに案を採用しない。比較用のビルドは非公開の Artifact として公開し、同じ URL へ再公開する。

## 完了報告

Phase や D の作業を終えるときは、完了条件の各項目を根拠（コマンド出力・テスト名・ファイルパス）付きで報告し、`npm run check` の結果を示し、コミットして `git status --short` が空であることを示す。
