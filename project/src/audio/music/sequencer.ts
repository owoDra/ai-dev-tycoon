/**
 * ステップシーケンサー（先読みスケジューリング方式）。
 * setInterval のような粗いタイマーで tick を呼び、now() + lookahead までに来るステップをまとめて予約する。
 * 予約する時刻は「基準の時刻 + ステップ数 × 1ステップの長さ」で毎回計算するので、tick が遅れても揺れても
 * ずれが積み重ならない（ドリフトしない）。時計（now）は AudioContext.currentTime を渡す。テストでは偽の時計を渡す。
 */

export interface SequencerOptions {
  /** いまの時刻（秒） */
  now: () => number;
  /** 何秒先まで予約するか */
  lookahead: number;
  /** ステップの予約。step は開始からの通し番号、time は鳴らす時刻（秒） */
  schedule: (step: number, time: number) => void;
}

export interface Sequencer {
  /** at（秒）から step 0 を始める */
  start(at: number, tempo: number, stepsPerBeat: number): void;
  stop(): void;
  /** テンポを変える。まだ予約していないステップから新しいテンポになる */
  setTempo(tempo: number, stepsPerBeat?: number): void;
  /** 予約を進める。戻り値は予約したステップの数 */
  tick(): number;
  readonly running: boolean;
  /** 次に予約するステップと、その時刻 */
  next(): { step: number; time: number } | null;
}

/** 1ステップの長さ（秒） */
export function stepSeconds(tempo: number, stepsPerBeat: number): number {
  return 60 / tempo / stepsPerBeat;
}

export function createSequencer(options: SequencerOptions): Sequencer {
  let running = false;
  /** 基準：この step をこの time に鳴らす。テンポを変えたときだけ置き直す */
  let anchor = { step: 0, time: 0 };
  let dur = 0;
  let beatSteps = 1;
  let nextStep = 0;
  const timeOf = (step: number) => anchor.time + (step - anchor.step) * dur;

  return {
    get running() {
      return running;
    },
    start(at, tempo, stepsPerBeat) {
      running = true;
      anchor = { step: 0, time: at };
      beatSteps = stepsPerBeat;
      dur = stepSeconds(tempo, stepsPerBeat);
      nextStep = 0;
    },
    stop() {
      running = false;
    },
    setTempo(tempo, stepsPerBeat) {
      anchor = { step: nextStep, time: timeOf(nextStep) };
      beatSteps = stepsPerBeat ?? beatSteps;
      dur = stepSeconds(tempo, beatSteps);
    },
    tick() {
      if (!running) return 0;
      const now = options.now();
      // タブが裏に回るなどで大きく遅れたら、過ぎたステップは鳴らさずに格子の上で飛ばす（まとめて鳴らさない）
      const late = now - timeOf(nextStep);
      if (late > dur) nextStep += Math.floor(late / dur);
      let count = 0;
      while (timeOf(nextStep) < now + options.lookahead) {
        options.schedule(nextStep, timeOf(nextStep));
        nextStep++;
        count++;
      }
      return count;
    },
    next() {
      return running ? { step: nextStep, time: timeOf(nextStep) } : null;
    },
  };
}
