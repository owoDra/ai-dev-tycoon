import {
  type FxDef,
  type FxId,
  type FxPart,
  type FxSignalKind,
  type FxTier,
  type FxTierRule,
  fxRules,
  fxTable,
  fxTiers,
} from '../content/fx';
import type { FeelPreset } from '../content/look/feel';
import type { FxSignal } from '../view/fx';

/** 起動した演出1回分。world（3D）と ui/fx（DOM）はこれを読んで再生するだけ */
export interface FxCue {
  /** 起動ごとの通し番号。途中で打ち切るときに使う */
  readonly token: number;
  readonly id: FxId;
  readonly tier: FxTier;
  readonly def: FxDef;
  /** 再生する部品（reduced-motion のときは代替の部品） */
  readonly parts: readonly FxPart[];
  readonly reduced: boolean;
  /** 強さ（feel の Tier の scale × コンボの上乗せ） */
  readonly intensity: number;
  /** この時点のコンボ数（Task 完了が続いた回数。1 から） */
  readonly combo: number;
  readonly durationMs: number;
  /** 起動した時点の手触りのプリセット（パーティクル数・揺れ・ヒットストップ） */
  readonly feel: FeelPreset;
  readonly entityId: string | null;
  readonly actorId?: string;
  readonly amount?: number;
}

export interface FxDirectorResult {
  readonly started: readonly FxCue[];
  /** 上の Tier に入れ替えられて打ち切る演出の token */
  readonly cancelled: readonly number[];
}

export interface FxDirectorOptions {
  /** 実時間（ms）。テストでは偽の時計を渡す */
  now: () => number;
  feel: () => FeelPreset;
  reduced: () => boolean;
  table?: readonly FxDef[];
  tiers?: Readonly<Record<FxTier, FxTierRule>>;
  rules?: { exclusiveFromTier: FxTier; comboWindowMs: number };
}

export interface FxDirector {
  /** きっかけを受け取り、クールダウンと同時再生の上限を見て演出を起動する */
  handle(signals: readonly FxSignal[]): FxDirectorResult;
  /** いまのコンボ数（窓を過ぎていたら 0） */
  combo(): number;
  /** 再生中の演出（終わったものは除く） */
  active(): readonly FxCue[];
}

/** コンボを数えるきっかけ */
const COMBO_SIGNAL: FxSignalKind = 'taskDone';

/**
 * 演出の指揮。core には依存せず、FxSignal（view/fx.ts が events と ViewModel から作る）だけを見る。
 * 状態（最後に起動した時刻・再生中の演出・コンボ）は演出のためだけのもので、ゲームの state には書き戻さない。
 * 演出を待つ処理はなく、handle はすぐに戻る（操作はブロックしない）。
 */
export function createFxDirector(options: FxDirectorOptions): FxDirector {
  const table = options.table ?? fxTable;
  const tiers = options.tiers ?? fxTiers;
  const rules = options.rules ?? fxRules;
  const lastStart = new Map<FxTier, number>();
  let playing: FxCue[] = [];
  let token = 0;
  let combo = 0;
  let lastComboAt = Number.NEGATIVE_INFINITY;

  /** 再生中の演出の開始時刻（token → ms） */
  const starts = new Map<number, number>();
  const endsAt = (cue: FxCue) => (starts.get(cue.token) ?? 0) + cue.durationMs;
  const prune = (now: number) => {
    playing = playing.filter((c) => {
      const alive = endsAt(c) > now;
      if (!alive) starts.delete(c.token);
      return alive;
    });
  };

  const countCombo = (now: number) => {
    combo = now - lastComboAt <= rules.comboWindowMs ? combo + 1 : 1;
    lastComboAt = now;
  };

  return {
    handle(signals) {
      const now = options.now();
      prune(now);
      const started: FxCue[] = [];
      const cancelled: number[] = [];
      // 同じ回に来たものは Tier の高い順に処理する（納品と同時のほかの大きな演出は、納品を優先する）
      const ordered = signals
        .map((signal, i) => ({ signal, def: table.find((d) => d.signal === signal.kind), i }))
        .filter((x): x is { signal: FxSignal; def: FxDef; i: number } => x.def !== undefined)
        .sort((a, b) => b.def.tier - a.def.tier || a.i - b.i);

      for (const { signal, def } of ordered) {
        if (signal.kind === COMBO_SIGNAL) countCombo(now);
        const rule = tiers[def.tier];
        const last = lastStart.get(def.tier);
        if (last !== undefined && now - last < rule.cooldownMs) continue;
        if (playing.filter((c) => c.tier === def.tier).length >= rule.maxConcurrent) continue;
        if (def.tier >= rules.exclusiveFromTier) {
          const big = playing.filter((c) => c.tier >= rules.exclusiveFromTier);
          if (big.some((c) => c.tier >= def.tier)) continue;
          for (const c of big) cancelled.push(c.token);
          playing = playing.filter((c) => c.tier < rules.exclusiveFromTier);
        }

        const feel = options.feel();
        const look = feel.tiers[def.tier];
        const comboNow = signal.kind === COMBO_SIGNAL ? combo : 0;
        const boost = 1 + feel.combo.step * Math.min(Math.max(0, comboNow - 1), feel.combo.maxSteps);
        const reduced = options.reduced();
        const cue: FxCue = {
          token: ++token,
          id: def.id,
          tier: def.tier,
          def,
          parts: reduced ? def.reducedAlternative : def.parts,
          reduced,
          intensity: look.scale * boost,
          combo: comboNow,
          durationMs: look.durationMs,
          feel,
          entityId: signal.entityId,
          ...(signal.actorId !== undefined ? { actorId: signal.actorId } : {}),
          ...(signal.amount !== undefined ? { amount: signal.amount } : {}),
        };
        lastStart.set(def.tier, now);
        starts.set(cue.token, now);
        playing.push(cue);
        started.push(cue);
      }
      return { started, cancelled };
    },
    combo() {
      return options.now() - lastComboAt <= rules.comboWindowMs ? combo : 0;
    },
    active() {
      prune(options.now());
      return playing;
    },
  };
}
