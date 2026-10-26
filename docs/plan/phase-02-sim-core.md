# Phase 02: シミュレーション基盤

## 目的
決定論的で、ヘッドレス実行できて、セーブ可能なゲームの心臓部を作る。この段階ではゲーム内容は最小限にする。

## 前提
Phase 01

## やること
1. **`core/rng.ts`**：seed 文字列 → 32bit ハッシュ → mulberry32。RNG の状態は数値として `GameState` の中に持つ（関数は `(rngState) => [value, nextRngState]` の純粋関数）。`int` `pick` `chance` `weighted` のヘルパーを用意する。
2. **`core/state.ts`**：`GameState` 型。`clock`（ゲーム内の分）、`rng`、`speed`、`paused`、`entities`（今は空でよい）、`pendingEvents` など。**JSON にシリアライズできる値だけ** を持たせる（Map・class・関数は禁止）。
3. **`core/commands.ts`**：`Command` を判別共用体として定義し、`reduce(state, command) → { state, events }` を作る。最初は `SetSpeed` `TogglePause` だけ用意する。
4. **`core/step.ts`**：`step(state, dtMinutes) → { state, events }`。固定ステップ（ゲーム内1分単位など）で進め、`balance.ts` の `minutesPerRealSecond` を使う。
5. **`core/events.ts`**：`GameEvent` 判別共用体。後続の Phase で種類を追加していく。
6. **`core/system.ts`**：step を「システム関数の配列」を順番に適用する形にする（`(state, ctx) => state`。ctx は events を push する場所と rng を持つ）。後続の Phase は、システムを追加するだけで機能を足せるようにする。
7. **`app/loop.ts`**：`requestAnimationFrame` でアキュムレータ方式の固定ステップループを回す。描画用に補間係数 `alpha` を渡す。タブが非表示になったら一時停止する。（ここは DOM 依存なので core の外に置く）
8. **`app/store.ts`**：Solid の `createStore` / signal と core をつなぐ層。`dispatch(command)` と、events を購読するバス（`onEvents(fn)`）を用意する。
9. **`core/serialize.ts`**：`saveVersion` を付けて state を保存・復元する。バージョン違いはマイグレーション関数の配列で処理する。
10. **`tests/helpers/headless.ts`**：`runHeadless({ seed, commands: [{ at, command }], until }) → { state, events }`。後続のバランステストの土台になる。
11. `content/balance.ts` を作り、時間係数だけを置く。

## テスト
- `tests/unit/rng.test.ts`：同じ seed で同じ数列になる、seed が違えば数列が違う、`int` が範囲内に収まる
- `tests/unit/step.test.ts`：dt を分割して進めても一括で進めても結果が同じ（固定ステップの性質）、一時停止中は進まない
- `tests/unit/determinism.test.ts`：同じ入力で `runHeadless` を2回実行すると、state と events が完全に一致する
- `tests/unit/serialize.test.ts`：保存して復元すると等価になる、旧バージョンのデータがマイグレーションされる

## 完了条件
- [ ] 上記4つのテストファイルがあり、すべて通る
- [ ] `core/` 配下で `Math.random` / `Date` / `document` / `window` を使っていない（`grep` の結果で示す）
- [ ] 画面上で、ゲーム内時計が進み、一時停止と速度変更ができる（UI は仮でよい）
- [ ] `npm run check` が exit 0

## スコープ外
案件・Task・スコア（Phase 03）

## `/goal` プロンプト
```
/goal docs/plan/README.md と docs/plan/phase-02-sim-core.md を読み、Phase 02「シミュレーション基盤」を実装する。完了条件（すべて会話内で示すこと）: (1) phase ファイルの「完了条件」の全項目を、根拠（コマンド出力・テスト名・ファイルパス）付きで ✓ 一覧として報告している (2) `npx vitest run tests/unit` の出力で rng / step / determinism / serialize の各テストが pass していることを示している (3) `grep -rnE "Math\.random|new Date|Date\.now|document\.|window\." src/core` の出力が空であることを示している (4) `npm run check` を実行し、exit code 0 で終わった出力の末尾を示している (5) 変更を「Phase 02: ...」というメッセージでコミットし、`git status --short` の出力が空であることを示している。制約: コマンドは project/ ディレクトリで実行する。docs/plan/ と docs/企画書.md は変更しない（計画の誤りや矛盾は最終報告に書く）。既存テストを削除・skip・弱体化しない。後続 Phase の機能を先取りしない。体験・見た目・スコープに影響する判断が必要になったら、文章で質問して止まらず AskUserQuestion で私に確認する。それ以外の実装上の判断は docs/plan/README.md の方針に沿って自分で決め、判断内容を最終報告に書く。40ターンで未達なら作業を止め、完了した項目・未完了の項目・残課題を報告する。
```
