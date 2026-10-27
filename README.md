# AI業務改善タイクーン

AI を適切な仕事へ配置し、人間1人あたりの利益（Profit / Human Hour）を最大化する業務改善タイクーンゲーム。
成果物は外部依存ゼロの単一 HTML（`project/dist/index.html`）で、ブラウザで直接開けば遊べる。

## 遊び方

1. `project/dist/index.html` をブラウザで開き、「はじめる」を押す。
2. 案件の Task を選び、担当（人間 / AI / AI → 人間レビュー など）を決める。最初の3分はチュートリアルが案内する。
3. Context・Harness（Skill / Hook / Tool / Permission / Eval / Subagent）・Seat を整え、ボトルネックを動かしながら案件を納品する。
4. 結果画面で、どの改善がどれだけ効いたかを振り返る。良い構成は Workflow Library に保存して次の案件や他のチームに使い回せる。

操作はマウス・タッチ・キーボードのどれでもできる。

## ビルド

Node 22 を使う（リポジトリ直下で `mise install`）。コマンドはすべて `project/` で実行する。

```sh
cd project
npm ci
npm run dev      # 開発サーバー
npm run build    # dist/index.html を作る
npm run check    # typecheck → lint → test → build → verify:dist
```

バランスの確認は `npm run balance:full`（多くの seed で原則テスト）と `npm run balance:report`（全案件 × 全戦略の指標表）。

## ディレクトリ

| パス | 内容 |
|---|---|
| `docs/` | 企画書・実装計画・デザイン決定の理由（コードで表せないものだけ） |
| `project/src/` | ソース（`core/` シミュレーション・`content/` ゲームデータとバランス値・`ui/` `world/` `fx/` `audio/` 表示と演出） |
| `project/tests/` | テスト（`balance/` に企画書の設計意図を戦略シミュレーションとして書いている） |
| `project/tools/` | アセット生成・dist の検証・バランスレポート |

仕様の正本はソースコード・テスト・コメント。詳細はコードを参照してほしい。
