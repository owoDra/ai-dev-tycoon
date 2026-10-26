import { type Accessor, createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import { getTask } from '../../content/index';
import { layoutFormFor, type UiLayout, uiLayout } from '../../content/look/layout';
import type { AssignModeId } from '../../content/types';
import { ja } from '../../i18n/ja';
import { type Advice, adviseProblems } from '../../view/advice';
import { detailView } from '../../view/detail';
import { defaultWorkerFor } from '../../view/project';
import type { WorldViewModel } from '../../view/world';
import type { World } from '../../world/index';
import { keyAction, nextIsland } from '../keyboard';
import { createNotices } from '../notices';
import type { Selection } from '../selection';
import { DetailSheet } from './DetailSheet';
import { Dock } from './Dock';
import { IslandLabels } from './IslandLabels';
import { NoticeHost } from './NoticeHost';
import { ProblemToasts } from './ProblemToasts';

/** シートの縁をドックの縁に重ねる量（px）。太い輪郭を1本に見せる */
const SHEET_OVERLAP = 3;

/**
 * プレイ画面の UI（3D ワールドの上に重ねる）。D3「ゲームのドック」の構成で、
 * 下部のドック（HUD）・上のトースト（次に対応すべき問題）・下から出るシート（詳細と担当変更）・島のラベル・お知らせを置く。
 * state は読むだけで、変更は store.dispatch（Command）で行う。選択は UI の state（Selection）。
 */
export function PlayScreen(props: {
  store: GameStore;
  projectId: string;
  selection: Selection;
  vm: Accessor<WorldViewModel | undefined>;
  world?: Accessor<World | undefined>;
  layout?: UiLayout;
}) {
  const layout = () => props.layout ?? uiLayout;
  const [view, setView] = createSignal({ width: window.innerWidth, height: window.innerHeight });
  const onResize = () => setView({ width: window.innerWidth, height: window.innerHeight });
  window.addEventListener('resize', onResize);
  onCleanup(() => window.removeEventListener('resize', onResize));
  const form = createMemo(() => layoutFormFor(layout(), view().width));

  const [dockHeight, setDockHeight] = createSignal(0);
  const observeDock = (el: HTMLElement) => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setDockHeight(el.offsetHeight));
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  };
  const sheetBottom = () => dockHeight() + form().form.dock.bottom - SHEET_OVERLAP;
  const sheetHeight = () => view().height * form().form.sheet.heightRatio;

  // 問題は中身が同じなら同じ配列を返し、トーストを毎フレーム作り直さない
  const problems = createMemo(() => adviseProblems(props.store.state(), props.projectId), [], {
    equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  const [dismissed, setDismissed] = createSignal<ReadonlySet<string>>(new Set());
  const shownProblems = () => problems().filter((p) => !dismissed().has(p.id));

  const notices = createNotices(() => form().form.notice);
  onCleanup(
    props.store.onEvents((events) => {
      for (const e of events) {
        if (e.type === 'TaskCompleted' && e.projectId === props.projectId) {
          const name = getTask(e.projectId, e.taskId).name;
          const ok = e.quality >= 1;
          notices.push({
            text: ok ? ja.notices.taskDone(name) : ja.notices.taskDefect(name),
            icon: ok ? 'success' : 'defect',
            tone: ok ? 'success' : 'danger',
          });
        }
        if (e.type === 'ReworkDetected' && e.projectId === props.projectId) {
          notices.push({
            text: ja.notices.rework(getTask(e.projectId, e.taskId).name),
            icon: 'review',
            tone: 'warning',
          });
        }
      }
    }),
  );

  const selected = () => props.selection.selected();
  const detail = createMemo(() => {
    const id = selected();
    const vm = props.vm();
    return id && vm ? detailView(props.store.state(), props.projectId, vm, id) : null;
  });

  let sheetEl: HTMLElement | undefined;
  let root!: HTMLDivElement;
  /** 矢印キーで移る起点。担当を決めてシートが閉じても、続けて隣の島へ進めるように最後に選んだ島を覚えておく */
  let lastIsland: string | null = null;
  const select = (entityId: string | null) => {
    if (entityId?.startsWith('island:')) lastIsland = entityId;
    props.selection.dispatch({ type: 'SelectEntity', entityId });
  };
  /** シートとドックに隠れない範囲の中心へカメラを寄せる */
  const focusCamera = (entityId: string) =>
    props.world?.()?.focus(entityId, { x: 0, y: -(sheetHeight() + dockHeight()) / 2 }, layout().flow.focusZoom);

  const close = () => {
    const was = selected();
    const inside = sheetEl?.contains(document.activeElement) ?? false;
    select(null);
    // シートの中にフォーカスがあったら、閉じたものの島のラベルへ戻す（なければ画面全体）
    if (inside) {
      const label = was ? root.querySelector<HTMLElement>(`[data-island="${was}"]`) : null;
      (label ?? root).focus();
    }
  };

  const goTo = (advice: Advice) => {
    select(advice.entityId);
    focusCamera(advice.entityId);
  };

  const assign = (taskId: string, mode: AssignModeId) => {
    props.store.dispatch({
      type: 'AssignTask',
      projectId: props.projectId,
      taskId,
      mode,
      workerId: defaultWorkerFor(mode),
    });
    notices.push({ text: ja.assign.assigned(getTask(props.projectId, taskId).name, ja.modes[mode]), icon: 'success' });
    if (!layout().flow.keepDetailAfterAssign) close();
  };

  const moveIsland = (dir: Parameters<typeof nextIsland>[2]) => {
    const vm = props.vm();
    if (!vm) return;
    const world = props.world?.();
    const points = vm.islands.map((island, i) => {
      const p = world?.project(island.id);
      // ワールドがなければ（テストなど）並び順を横一列とみなす
      return { id: island.id, x: p?.x ?? i, y: p?.y ?? 0 };
    });
    const current = selected();
    const next = nextIsland(points, current?.startsWith('island:') ? current : lastIsland, dir);
    if (!next) return;
    select(next);
    focusCamera(next);
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = keyAction(e);
      if (!action) return;
      if (action.type === 'close') {
        if (selected() === null) return;
        e.preventDefault();
        close();
      } else if (action.type === 'pause') {
        e.preventDefault();
        props.store.dispatch({ type: 'TogglePause' });
      } else {
        e.preventDefault();
        moveIsland(action.dir);
      }
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  return (
    <div ref={root} tabindex={-1} class="pointer-events-none absolute inset-0 outline-none" data-play-screen>
      <p class="sr-only">{ja.keys.help}</p>
      <Show when={props.world?.() && props.vm()}>
        <IslandLabels
          world={props.world?.() as World}
          islands={props.vm()?.islands ?? []}
          selected={selected()}
          compact={form().compact}
          onSelect={(id) => select(id)}
        />
      </Show>
      <ProblemToasts
        problems={shownProblems()}
        layout={form().form.toast}
        dismissible={layout().flow.toastDismissible}
        onGo={goTo}
        onLater={(p) => setDismissed((s) => new Set([...s, p.id]))}
      />
      <NoticeHost notices={notices.list()} compact={form().compact} />
      <Show when={detail()}>
        {(d) => (
          <div class="pointer-events-auto">
            <DetailSheet
              ref={(el) => {
                sheetEl = el;
              }}
              store={props.store}
              projectId={props.projectId}
              detail={d()}
              layout={form().form.sheet}
              scrollCards={form().form.assignCards === 'scroll'}
              bottom={sheetBottom()}
              viewHeight={view().height}
              onClose={close}
              onAssign={assign}
            />
          </div>
        )}
      </Show>
      <div class="pointer-events-auto">
        <Dock
          ref={observeDock}
          store={props.store}
          projectId={props.projectId}
          layout={form().form.dock}
          compact={form().compact}
          problemCount={problems().length}
          onProblems={() => setDismissed(new Set<string>())}
        />
      </div>
    </div>
  );
}
