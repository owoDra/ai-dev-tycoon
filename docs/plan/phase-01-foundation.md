# Phase 01: 開発基盤・単一HTMLビルド

## 目的
以降の全 Phase が「`npm run check` が通れば完了」と判断できる土台を作る。

## 前提
なし（リポジトリにはまだコミットがなく、企画書だけがある）。

## やること
1. **プロジェクト初期化**（すべて `project/` 配下に作る。リポジトリのルートには何も追加しない）
   - `package.json`（`"type": "module"`、Node 22）、`tsconfig.json`（strict、`noUncheckedIndexedAccess`、`jsx: preserve`、`jsxImportSource: solid-js`、パスエイリアス `@/` → `src/`）
   - 依存: `solid-js` `motion` `three` / dev: `vite` `vite-plugin-solid` `vite-plugin-singlefile` `tailwindcss` `@tailwindcss/vite` `vitest` `jsdom` `@biomejs/biome` `typescript` `@types/three` `tsx`
   - `project/.gitignore`（`node_modules` `dist` `dist-explore` `coverage`）
2. **ディレクトリの骨格**：README の構成どおりに `project/src/` `project/tests/` `project/tools/` を作る。空のディレクトリを作るためだけのファイルは置かない。
3. **リポジトリのルートの確認**：ルートには `.claude/` `docs/` `project/` だけがある状態にする（企画書と計画は `docs/` へ移動済み）。
4. **Vite 設定**
   - `vite-plugin-solid` + `@tailwindcss/vite` + `viteSingleFile()`
   - `build.assetsInlineLimit` を十分大きくし、画像・glb・フォントなども含めて全アセットをインライン化する
   - `build.target: 'es2022'`、`modulePreload: false`
   - Vitest の設定も同じファイルにまとめる（`test.include: ['tests/**/*.test.ts?(x)']`、既定は node 環境、`*.dom.test.tsx` だけ jsdom）
5. **最小の起動画面**：`src/main.tsx` で Solid をマウントし、Tailwind のクラスが効いていることが分かるタイトル表示を出す（デザインは仮でよい）。
6. **`tools/verify-dist.ts`**（`tsx` で実行）
   - `dist/` に `index.html` だけが存在すること
   - HTML 内に `http://` `https://` で始まる `src` / `href` / `url()` / `import` がないこと（SVG の `xmlns` は例外として扱う）
   - サイズ予算：raw ≤ 3.0MB、gzip ≤ 1.2MB（予算値は定数としてファイル先頭に置く。超過したら exit 1）
   - 結果のサイズを標準出力に表示する
7. **npm scripts**
   - `dev` `build` `preview` `typecheck`（`tsc --noEmit`） `lint`（`biome check .`） `format` `test`（`vitest run`） `verify:dist`
   - `check` = `typecheck && lint && test && build && verify:dist`
8. **テスト**：`tests/build/verify-dist.test.ts` で verify ロジックの判定関数（外部URL検出・サイズ判定）を単体テストする。判定関数は `tools/verify-dist.ts` から export して CLI 部分と分ける。
9. **`.claude/CLAUDE.md` の更新**：作成済みの規約のうち、コマンド一覧などが実際の `package.json` と食い違っていれば合わせる（規約の方針自体は変えない）。
10. 初回コミット（それまで未コミットだった `.claude/` と `docs/` も含める）。

## 完了条件
- [ ] `npm run check` が exit 0
- [ ] `dist/` に `index.html` 1ファイルだけが出力され、`verify:dist` がサイズを表示する
- [ ] `tests/build/verify-dist.test.ts` に、外部URLを含む HTML を検出できるケースと、検出しない（`xmlns` など）ケースがある
- [ ] リポジトリのルートが `.claude/` `docs/` `project/` だけになっている
- [ ] `.claude/CLAUDE.md` のコマンド一覧が実際の `package.json` と一致している
- [ ] コミット済みで作業ツリーがクリーン

## スコープ外
ゲームロジック・デザイントークン・アセット（Phase 02 以降）

## `/goal` プロンプト
```
/goal docs/plan/README.md と docs/plan/phase-01-foundation.md を読み、Phase 01「開発基盤・単一HTMLビルド」を実装する。完了条件（すべて会話内で示すこと）: (1) phase ファイルの「完了条件」の全項目を、根拠（コマンド出力・テスト名・ファイルパス）付きで ✓ 一覧として報告している (2) `npm run check` を実行し、exit code 0 で終わった出力の末尾（verify:dist が表示するサイズを含む）を示している (3) `ls dist` の出力が index.html だけであることを示している (4) 変更を「Phase 01: ...」というメッセージでコミットし、`git status --short` の出力が空であることを示している。制約: コマンドは project/ ディレクトリで実行する。docs/plan/ は変更しない（計画の誤りや矛盾は最終報告に書く）。後続 Phase の機能（ゲームロジック・アセット）を先取りしない。体験・見た目・スコープに影響する判断が必要になったら、文章で質問して止まらず AskUserQuestion で私に確認する。それ以外の実装上の判断は docs/plan/README.md の方針に沿って自分で決め、判断内容を最終報告に書く。40ターンで未達なら作業を止め、完了した項目・未完了の項目・残課題を報告する。
```
