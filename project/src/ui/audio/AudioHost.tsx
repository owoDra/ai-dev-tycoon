import { type Accessor, createEffect, on, onCleanup, onMount } from 'solid-js';
import { settings } from '../../app/settings';
import type { GameStore } from '../../app/store';
import { audio } from '../../audio/index';
import { momentum } from '../../audio/music/intensity';
import { screenPan } from '../../audio/notes';
import { musicMomentum, type SongId } from '../../content/music';
import { audioRules, eventSfx } from '../../content/sfx';
import { momentumInput } from '../../view/audio';
import { islandId } from '../../view/world';
import type { World } from '../../world/index';
import { installUiSounds } from './uiSounds';

/** 勢いを計り直す間隔（ms） */
const MOMENTUM_INTERVAL_MS = 250;

/**
 * 音のつなぎ役。state と events を読んで、BGM の曲・勢い・一時停止と、演出を通らない効果音（Task の開始）を鳴らす。
 * 設定の音量を反映し、最初のユーザー操作で AudioContext を作る。Command は発行しない。
 * 演出に付く効果音は FxHost が鳴らす。
 */
export function AudioHost(props: {
  store: GameStore;
  /** BGM の曲（null なら止める） */
  song: SongId | null;
  /** 案件をプレイしていないときは null（勢いは 0 になる） */
  projectId: string | null;
  world: Accessor<World | undefined>;
  /** 演出の director のコンボ数 */
  combo: () => number;
}) {
  onMount(() => {
    const unlock = () => audio.unlock();
    const opts = { capture: true } as const;
    window.addEventListener('pointerdown', unlock, opts);
    window.addEventListener('keydown', unlock, opts);
    onCleanup(() => {
      window.removeEventListener('pointerdown', unlock, opts);
      window.removeEventListener('keydown', unlock, opts);
    });
    onCleanup(installUiSounds(document, (id) => audio.play(id)));
  });

  createEffect(() => audio.setVolumes(settings().audio));
  createEffect(() => audio.setSong(props.song));
  createEffect(() => audio.setPaused(props.projectId !== null && props.store.state().paused));

  // 直近の Task 完了（実時間 ms）
  let recent: number[] = [];
  createEffect(
    on(
      () => [props.store, props.projectId] as const,
      ([store, projectId]) => {
        recent = [];
        if (!projectId) return;
        onCleanup(
          store.onEvents((events) => {
            for (const e of events) {
              if (e.type === 'TaskCompleted' && e.projectId === projectId) recent.push(performance.now());
              if (e.type === 'TaskStarted' && e.projectId === projectId) {
                const at = props.world()?.project(islandId(e.taskId));
                const pan = at ? screenPan(at.x, window.innerWidth, audioRules.spatialWidth) : 0;
                audio.play(eventSfx.TaskStarted, { pan });
              }
            }
          }),
        );
      },
    ),
  );

  const timer = setInterval(() => {
    const projectId = props.projectId;
    if (!projectId) {
      audio.setMomentum(0);
      return;
    }
    const now = performance.now();
    recent = recent.filter((t) => now - t <= musicMomentum.recentWindowMs);
    audio.setMomentum(
      momentum(momentumInput(props.store.state(), projectId, props.combo(), recent, now, musicMomentum.recentWindowMs)),
    );
  }, MOMENTUM_INTERVAL_MS);
  onCleanup(() => clearInterval(timer));

  return null;
}
