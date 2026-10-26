import { staleReasons } from './manifest';

/** `npm run assets:check`：生成物が最新かどうかを manifest.json のハッシュと比べる */
const reasons = staleReasons();
if (reasons.length > 0) {
  for (const r of reasons) console.error(`✗ ${r}`);
  console.error('生成物が最新ではない。`npm run assets` を実行してコミットする');
  process.exit(1);
}
console.log('✓ assets:check OK（生成物は最新）');
