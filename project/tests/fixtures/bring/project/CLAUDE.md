# 在庫管理アプリ

社内の在庫を管理する Web アプリ。TypeScript と React で書いている。

## よく使うコマンド

```sh
npm run dev      # 開発サーバー
npm test         # テスト（vitest）
npm run lint     # Biome
```

## 決まりごと

- 型は any を使わない
- API の呼び出しは src/api/ にまとめる
- 画面の文言は src/i18n/ja.ts に置く
