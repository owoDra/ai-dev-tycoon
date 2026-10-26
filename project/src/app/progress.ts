import { createSignal } from 'solid-js';

/**
 * プレイヤーの進み具合のうち、セーブ（Phase 13）より前から持ち越すもの。いまはチュートリアルを終えたかだけ。
 * 初回起動ではタイトルの「はじめる」でチュートリアルが始まり、終えた（またはスキップした）後は案件選択へ進む。
 */
export interface Progress {
  readonly tutorialDone: boolean;
}

const STORAGE_KEY = 'ai-dev-tycoon.progress.v1';
const DEFAULTS: Progress = { tutorialDone: false };

/** 保存された進み具合を読む。読めない（プライベートモード・壊れた値）ときは初回起動として扱う */
export function loadProgress(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Progress {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return { tutorialDone: parsed.tutorialDone === true };
  } catch {
    return DEFAULTS;
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const [progress, setProgress] = createSignal<Progress>(loadProgress());

export { progress };

/** チュートリアルを終えた（スキップを含む）ことを保存する */
export function markTutorialDone(storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  const next = { ...progress(), tutorialDone: true };
  setProgress(next);
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても、このセッションの間はチュートリアルを終えたものとして扱う
  }
}
