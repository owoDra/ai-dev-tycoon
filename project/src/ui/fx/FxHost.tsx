import { type Accessor, createEffect, on, onCleanup } from 'solid-js';
import type { GameStore } from '../../app/store';
import { createFxDirector, type FxDirector } from '../../fx/director';
import { feel } from '../../fx/feel';
import { reducedMotion } from '../../fx/reduced';
import { type FxSignal, fxSignals } from '../../view/fx';
import type { WorldViewModel } from '../../view/world';
import type { World } from '../../world/index';
import type { Selection } from '../selection';
import { type FxLayer, FxLayerView } from './FxLayer';

export interface FxHostApi {
  readonly director: FxDirector;
  /** きっかけを直接流す（演出のプレビュー用） */
  trigger(signals: readonly FxSignal[]): void;
}

/**
 * 演出のつなぎ役。store の events と選択の変化を FxSignal にして director に渡し、
 * 起動した演出を world（3D）と FxLayer（DOM）へ配る。state は読むだけで、Command は発行しない。
 * 画面が切り替わっても演出が続くよう、App で画面の外側に1つだけ置く。
 */
export function FxHost(props: {
  store: GameStore;
  /** 案件をプレイしていないときは null（タイトルの後ろのワールドでは演出を出さない） */
  projectId: string | null;
  world: Accessor<World | undefined>;
  vm: Accessor<WorldViewModel | undefined>;
  selection: Selection;
  ref?: (api: FxHostApi) => void;
}) {
  const director = createFxDirector({ now: () => performance.now(), feel, reduced: reducedMotion });
  let layer: FxLayer | undefined;

  const trigger = (signals: readonly FxSignal[]) => {
    if (signals.length === 0) return;
    const { started, cancelled } = director.handle(signals);
    const world = props.world();
    world?.cancelFx(cancelled);
    layer?.cancel(cancelled);
    for (const cue of started) {
      world?.playFx(cue);
      layer?.play(cue, cue.entityId ? (world?.project(cue.entityId) ?? null) : null);
    }
  };

  createEffect(
    on(
      () => [props.store, props.projectId] as const,
      ([store, projectId]) => {
        if (!projectId) return;
        onCleanup(
          store.onEvents((events) =>
            trigger(fxSignals(events, { projectId, bottleneckEntity: props.vm()?.bottleneck?.entityId ?? null })),
          ),
        );
      },
    ),
  );

  // Tier 0：島を選んだら持ち上げる
  createEffect(
    on(
      props.selection.selected,
      (id) => {
        if (id?.startsWith('island:')) trigger([{ kind: 'select', entityId: id }]);
      },
      { defer: true },
    ),
  );

  props.ref?.({ director, trigger });

  return (
    <FxLayerView
      ref={(l) => {
        layer = l;
      }}
    />
  );
}
