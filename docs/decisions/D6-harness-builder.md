# D6: Harness Builder の見た目（決定）

- 決定日: 2026-10-28
- 結果: **案D（作業の流れの道＋スロット）**。実装は `project/src/ui/play/HarnessLane.tsx` と `project/src/view/harness.ts`
- デモ（案A〜D・ルールの仕分け）: https://claude.ai/artifact/Gaecb4sU7NA1v5yhNsqVGp
- 確認用ビルド: https://claude.ai/artifact/XQEVr6mZU9ejTRCTfsmDht （非公開の Artifact。版1。すべての部品を解放した状態で Builder を触れる）
  - ローカル：`project/` で `npm run build:explore` → `project/dist-explore/index.html`（既定のページが D6。Phase 25 の画面構成の確認は `#page=layout`）

## なぜ案D か
- 案A（流れの道と関所）は「作業のどこで何が効くか」が分かる。案B（装備スロット）はシンプル。案D はその両方を取り、各地点に丸いスロットを1つずつ置いた
- Hook は道の上の「盾」、権限は道の下の「鍵」にして、守り方の違い（必ず通る／入れる範囲）を形で分けた
- 「受け取る」には CLAUDE.md と Rules の2つを並べた。作業ルールは Rules に分けるのが上手だが、CLAUDE.md がないのもおかしい（ユーザーの指摘）
- 設定ファイル（settings.json など）は Builder に出さない。実際の書き方は実務モードの書き出しでだけ扱う

## あなたのコメント
- デモへの回答：「案A の作業の流れがわかる感じはいい。案B のシンプルさも捨てがたい。settings.json を出すのはいらない」
- 案D のデモへの回答：「D はいい」
- 確認用ビルド（版1）への回答：「案D で採用」
