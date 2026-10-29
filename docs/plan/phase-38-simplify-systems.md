# Phase 38: 仕組みの取捨選択（シンプルに始めて段階的に複雑にする）

## 目的
序盤に同時に動く仕組みを減らし、規模が上がるたびに新しい概念を1〜2個ずつ渡す。役割の重なる仕組みは削る・まとめる。

## 前提
Phase 37

## 決定済みの方針（2026-10-29 ユーザー回答）
- 削る・まとめる：担当モード「人間 → AI」（humanThenAi）を削る。Context の解放を2段階（資料を選ぶ／Session と成果物に残す）にまとめる。Harness の部品の解放を3束（守らせる／検証する／自動化する）にまとめる
- 後に回す：個人事業では同時に進める案件を1件にする。Seat の購入は AI の使用量が上限に達してから（遅くともスタートアップで）。時価総額（企業価値）・事件・実績はスタートアップから
- 倒産の猶予は入れない（今のまま）

## やること
1. humanThenAi を型・コンテンツ・解放・文言から外す。セーブは移行する（担当中の humanThenAi は同じ形の工程を持つ「AI」に置き換え、解放の記録から外す）
2. 機能 ID を `context`・`session`・`harness`・`harness:eval`・`harness:tool` に寄せる（context:pick → context、session:artifacts → session、harness:hook / permission → harness、subagent / mod / routine / context:router → harness:tool）。セーブの解放と NEW の印を移行する
3. `balance.company.tiers.solo.maxProjects` を 1 に
4. 機能 `seats`（Seat の枚数の変更）を足し、使用量が上限に達した回数（会社の記録）か、スタートアップへの昇格で解放する
5. 事件はスタートアップから起きる。会社の帯の企業価値と実績はスタートアップから出す
6. `tests/balance/` に、規模ごとに新しく解放される機能の数の上限を表すテストを置く

## 完了条件
- [ ] 担当モードが5つ・Harness の解放が3回・Context の解放が2回
- [ ] 個人事業は1件ずつ、Seat の購入は後から
- [ ] 古いセーブが読み込める
- [ ] `npm run check` が exit 0
