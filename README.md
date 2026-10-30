# AI業務改善タイクーン

AI を適切な仕事へ配置し、人間1人あたりの利益（Profit / Human Hour）を最大化する業務改善タイクーンゲームのPoC（概念実証）。

![ゲーム紹介動画のポスター](project/public/intro-poster.jpg)

[紹介動画を見る](project/public/intro.mp4)

このリポジトリは、AIに任せる仕事の選択、Harnessによる品質改善、人間による確認といった開発の意思決定をゲームとして表現・検証するためのものです。
リポジトリからローカルでビルドしてプレイできます。また、外部依存ゼロの単一HTML版（`project/dist-standalone/index.html`）も生成でき、ブラウザで直接開いて遊べます。

## 検証するゲーム性

- AIと人間の役割分担、レビュー、コストのトレードオフ
- Context・Harness・Seatが、品質・速度・利益に与える影響
- 決定論的なシミュレーションとバランステストによる設計検証
- 持ち込みのClaude Code設定をローカルで評価し、ゲーム内の部品として扱う仕組み

## 遊び方

1. `npm run dev` で起動した画面、またはビルドした単一HTML版（`project/dist-standalone/index.html`）をブラウザで開き、「はじめる」を押す。
2. 案件の Task を選び、担当（人間 / AI / AI → 人間レビュー など）を決める。最初の3分はチュートリアルが案内する。
3. Context・Harness（Skill / Hook / Tool / Permission / Eval / Subagent）・Seat を整え、ボトルネックを動かしながら案件を納品する。
4. 結果画面で、どの改善がどれだけ効いたかを振り返る。良い構成は Workflow Library に保存して次の案件や他のチームに使い回せる。

操作はマウス・タッチ・キーボードのどれでもできる。

## ビルド

Node 22 を使う（リポジトリ直下で `mise install`）。コマンドはすべて `project/` で実行する。

```sh
cd project
npm ci
npm run dev               # 開発サーバー
npm run build             # Cloudflare Pages 向け（dist/。紹介動画入り）
npm run build:standalone  # 単一 HTML 版（dist-standalone/index.html）
npm run check             # typecheck → lint → test → build → verify:pages → build:standalone → verify:dist
```

バランスの確認は `npm run balance:full`（多くの seed で原則テスト）と `npm run balance:report`（全案件 × 全戦略の指標表）。

## ディレクトリ

| パス | 内容 |
|---|---|
| `docs/` | 企画書・実装計画・デザイン決定の理由（コードで表せないものだけ） |
| `project/src/` | ソース（`core/` シミュレーション・`content/` ゲームデータとバランス値・`ui/` `world/` `fx/` `audio/` 表示と演出） |
| `project/tests/` | テスト（`balance/` に企画書の設計意図を戦略シミュレーションとして書いている） |
| `project/tools/` | アセット生成・dist の検証・バランスレポート |
| `project/public/` | 公開済みの紹介動画・字幕・ポスター（動画の制作プロジェクトは含めない） |

仕様の正本はソースコード・テスト・コメント。詳細はコードを参照してほしい。

## 公開方針・ライセンス

このリポジトリはゲーム性・設計アイデアのPoCです。運用サービスとしての安全性や、取り込んだClaude Code設定の安全性・有効性を保証するものではありません。

- **ソースコード:** [MIT License](LICENSE)（著作権・ライセンス表示を保持してください）
- **動画・ポスター等:** `project/public/intro.mp4` などのメディア成果物は、上記MITによる再利用許諾の対象外です
- **音声:** 紹介動画はVOICEVOXの「ずんだもん」を使用しています。動画内の表記と各音声ライブラリの利用規約に従ってください

持ち込み設定の読み込みはブラウザ内で実施し、内容を外部サービスには送信しません。読み込んだカードの元データはブラウザの`localStorage`に保存されることがあり、プラグイン書き出し時に元の内容を含む場合があります。秘密情報を含むファイルは読み込まないでください。実際のClaude Codeへ導入する前に、書き出された設定・コマンドを確認してください。

`project/public/intro.mp4` は配布済みのプレビュー用成果物です。動画制作に用いたRemotionのソースは、このPoCの公開範囲に含めていません。
