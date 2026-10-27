import type { PracticeJobInput } from '../content/types';
import { parsePracticeJob } from '../core/practice';

/*
 * 実務モードの入力の保存（localStorage）。読めない・保存できない環境でも、そのまま入力して試算できる。
 */

const PRACTICE_KEY = 'ai-dev-tycoon.practice.v1';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function safeStorage(): Store | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** 保存した入力を読む。ない・壊れている・読めなければ null */
export function loadPracticeJob(storage: Pick<Store, 'getItem'> | undefined = safeStorage()): PracticeJobInput | null {
  try {
    const raw = storage?.getItem(PRACTICE_KEY);
    return raw ? parsePracticeJob(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** 入力を保存する。保存できなければ何もしない */
export function savePracticeJob(job: PracticeJobInput, storage: Pick<Store, 'setItem'> | undefined = safeStorage()) {
  try {
    storage?.setItem(PRACTICE_KEY, JSON.stringify(job));
  } catch {
    // 保存できなくても、この画面を開いている間は試算できる
  }
}
