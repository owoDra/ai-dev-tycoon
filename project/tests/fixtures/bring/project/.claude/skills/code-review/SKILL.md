---
name: code-review
description: 変更をレビューし、バグと危ない箇所を重い順に挙げる。レビューを頼まれたときに使う
allowed-tools: Read, Grep, Glob
---

# コードレビュー

1. `git diff` で変更を読む
2. 正しさ・安全性・テストの不足を挙げる
3. 重い順に並べ、直し方を1行で添える
