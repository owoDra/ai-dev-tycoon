import { type Accessor, createEffect, createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import { audio } from '../../audio/index';
import { aiWorkers, getHarnessPart, getModel, getTask } from '../../content/index';
import { layoutFormFor, type UiLayout, uiLayout } from '../../content/look/layout';
import { eventSfx } from '../../content/sfx';
import type { AssignModeId, FeatureId } from '../../content/types';
import { modeFeature, unlockDefs } from '../../content/unlocks';
import type { BottleneckRef } from '../../core/bottleneck';
import { getIncidentDef } from '../../core/incidents';
import { isUnlocked } from '../../core/unlocks';
import { ja } from '../../i18n/ja';
import { type Advice, adviseProblems } from '../../view/advice';
import { type BottleneckMove, bottleneckMove, stageRows } from '../../view/bottleneck';
import { contextView, toggleDoc } from '../../view/context';
import { detailView } from '../../view/detail';
import { harnessForecast, harnessView } from '../../view/harness';
import { defaultWorkerFor, workflowTasks } from '../../view/project';
import type { WorldViewModel } from '../../view/world';
import type { World } from '../../world/index';
import { keyAction, nextIsland } from '../keyboard';
import { createNotices } from '../notices';
import { Presence } from '../Presence';
import type { Selection } from '../selection';
import { BottleneckGuide } from './BottleneckGuide';
import { ContextSheet } from './ContextSheet';
import { DetailSheet } from './DetailSheet';
import { Dock } from './Dock';
import { HarnessSheet } from './HarnessSheet';
import { IslandLabels } from './IslandLabels';
import { NoticeHost } from './NoticeHost';
import { ProblemToasts } from './ProblemToasts';
import { TutorialCoach } from './TutorialCoach';

/** シートの縁をドックの縁に重ねる量（px）。太い輪郭を1本に見せる */
const SHEET_OVERLAP = 3;

/**
 * プレイ画面の UI（3D ワールドの上に重ねる）。D3「ゲームのドック」の構成で、
 * 下部のドック（HUD）・上のトースト（次に対応すべき問題）・下から出るシート（詳細と担当変更）・島のラベル・お知らせを置く。
 * state は読むだけで、変更は store.dispatch（Command）で行う。選択は UI の state（Selection）。
 * チュートリアル中はコーチマークを重ね、「次に対応すべき問題」は解放されるまで出さない。
 */
export function PlayScreen(props: {
  store: GameStore;
  projectId: string;
  selection: Selection;
  vm: Accessor<WorldViewModel | undefined>;
  world?: Accessor<World | undefined>;
  layout?: UiLayout;
  onSettings?: () => void;
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
  const problemsOn = () => isUnlocked(props.store.state(), 'problems');
  const shownProblems = () => (problemsOn() ? problems().filter((p) => !dismissed().has(p.id)) : []);
  /** 解放されたばかりで、まだ使っていない機能（担当カードの「NEW」バッジ） */
  const [fresh, setFresh] = createSignal<ReadonlySet<FeatureId>>(new Set());
  // 問題のトーストが新しく出たら警告音を添える（トーストのアイコンと文言が本体で、音は補助）
  let heard = new Set<string>();
  createEffect(() => {
    const ids = new Set(shownProblems().map((p) => p.id));
    if ([...ids].some((id) => !heard.has(id))) audio.play(eventSfx.problemShown);
    heard = ids;
  });

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
        if (e.type === 'EvalCaught' && e.projectId === props.projectId) {
          notices.push({ text: ja.notices.evalCaught(getTask(e.projectId, e.taskId).name), icon: 'eval' });
        }
        if (e.type === 'IncidentStarted' && e.projectId === props.projectId) {
          const name = ja.incidents[e.incident].name;
          notices.push({ text: ja.notices.incident(name), icon: getIncidentDef(e.incident).icon, tone: 'danger' });
        }
        if (e.type === 'BottleneckChanged') showBottleneckMove(e.bottleneck);
        if (e.type === 'IncidentResolved') {
          notices.push({ text: ja.notices.incidentResolved(ja.incidents[e.incident].name), icon: 'success' });
        }
        if (e.type === 'SessionReset') {
          const lost = e.lost.length > 0;
          notices.push({
            text: lost ? ja.notices.sessionLost : ja.notices.sessionReset,
            icon: lost ? 'warning' : 'session',
            tone: lost ? 'danger' : undefined,
          });
        }
        if (e.type === 'HarnessChanged') {
          const text =
            e.change === 'model'
              ? ja.notices.modelChanged(getModel(e.id).name)
              : e.change === 'equip'
                ? ja.notices.equipped(getHarnessPart(e.id).name)
                : ja.notices.removed(getHarnessPart(e.id).name);
          notices.push({
            text,
            icon: e.change === 'remove' ? 'tool' : 'success',
            tone: e.change === 'remove' ? undefined : 'success',
          });
        }
        if (e.type === 'HarnessAccident' && e.projectId === props.projectId) {
          notices.push({
            text: ja.notices.accident(getTask(e.projectId, e.taskId).name),
            icon: 'warning',
            tone: 'danger',
          });
        }
        if (e.type === 'WorkflowAssigned' && e.projectId === props.projectId) {
          notices.push({ text: ja.notices.workflow(e.taskIds.length), icon: 'workflow', tone: 'success' });
        }
        if (e.type === 'FeatureUnlocked') {
          const message = unlockDefs.find((u) => u.feature === e.feature)?.message ?? 'basic';
          notices.push({ text: `${ja.unlocks.badge} ${ja.unlocks[message]}`, icon: 'success', tone: 'success' });
          setFresh((s) => new Set([...s, e.feature]));
        }
      }
    }),
  );

  // ボトルネックの移動の案内（企画書20章）。core の BottleneckChanged で移った先を覚え、
  // ワールドでその場所に輪が出る（目立たせる大きさになる）ときに案内する。小さな詰まりでは出さない
  const [move, setMove] = createSignal<BottleneckMove | null>(null);
  const [compare, setCompare] = createSignal(false);
  let guided: BottleneckRef | null = null;
  let pending: BottleneckRef | null = null;
  const showBottleneckMove = (to: BottleneckRef | null) => {
    pending = to;
  };
  const ringAt = createMemo(() => props.vm()?.bottleneck?.entityId ?? null);
  createEffect(() => {
    const entity = ringAt();
    const state = props.store.state();
    if (!entity || !pending || state.tutorial || !isUnlocked(state, 'problems')) return;
    const next = bottleneckMove(props.projectId, guided, pending);
    if (!next || next.entityId !== entity) return;
    guided = pending;
    setMove(next);
  });
  const rows = createMemo(() => (move() && compare() ? stageRows(props.store.state(), props.projectId) : []));

  // Context と Harness Builder のシート。詳細のシートと同じ場所に出すので、どれか1つだけを開く
  const [contextOpen, setContextOpen] = createSignal(false);
  const context = createMemo(() => (contextOpen() ? contextView(props.store.state(), props.projectId) : null));
  const openContext = () => {
    props.selection.dispatch({ type: 'SelectEntity', entityId: null });
    setHarnessOpen(false);
    setContextOpen(true);
  };
  const [harnessOpen, setHarnessOpen] = createSignal(false);
  const harnessWorker = () => aiWorkers[0]?.id ?? '';
  const harnessOn = () => isUnlocked(props.store.state(), 'harness');
  const harness = createMemo(() =>
    harnessOpen() && harnessOn() ? harnessView(props.store.state(), props.projectId, harnessWorker()) : null,
  );
  const openHarness = () => {
    props.selection.dispatch({ type: 'SelectEntity', entityId: null });
    setContextOpen(false);
    setHarnessOpen(true);
  };
  createEffect(() => {
    if (props.selection.selected() !== null) {
      setContextOpen(false);
      setHarnessOpen(false);
    }
  });

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
    setFresh((s) => new Set([...s].filter((f) => f !== modeFeature(mode))));
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
        if (contextOpen() || harnessOpen()) {
          e.preventDefault();
          setContextOpen(false);
          setHarnessOpen(false);
          return;
        }
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
        onResolve={(p) => {
          if (p.incident) {
            props.store.dispatch({ type: 'ResolveIncident', incident: p.incident.id, workerId: p.incident.workerId });
          }
        }}
        onView={(sheet) => (sheet === 'harness' && harnessOn() ? openHarness() : openContext())}
      />
      <Show when={move()}>
        {(m) => (
          <BottleneckGuide
            move={m()}
            rows={rows()}
            world={props.world?.()}
            compact={form().compact}
            bottom={sheetBottom() + SHEET_OVERLAP + 8}
            compare={compare()}
            onCompare={setCompare}
            onGo={(entityId) => {
              select(entityId);
              focusCamera(entityId);
            }}
            onClose={() => {
              setMove(null);
              setCompare(false);
            }}
          />
        )}
      </Show>
      <NoticeHost notices={notices.list()} compact={form().compact} />
      <Presence when={detail()} enter={false} class="pointer-events-auto">
        {(d) => (
          <DetailSheet
            ref={(el) => {
              sheetEl = el;
            }}
            store={props.store}
            projectId={props.projectId}
            detail={d()}
            layout={form().form.sheet}
            scrollCards={form().form.assignCards === 'scroll'}
            fresh={fresh()}
            bottom={sheetBottom()}
            viewHeight={view().height}
            onClose={close}
            onAssign={assign}
            onHarness={harnessOn() ? openHarness : undefined}
            workflow={(taskId) => workflowTasks(props.store.state(), props.projectId, taskId)}
            onWorkflow={(taskIds) => {
              props.store.dispatch({
                type: 'AssignWorkflow',
                projectId: props.projectId,
                taskIds,
                workerId: harnessWorker(),
              });
              if (!layout().flow.keepDetailAfterAssign) close();
            }}
          />
        )}
      </Presence>
      <Presence when={context()} enter={false} class="pointer-events-auto">
        {(v) => (
          <ContextSheet
            view={v()}
            layout={form().form.sheet}
            bottom={sheetBottom()}
            viewHeight={view().height}
            dispatch={(c) => props.store.dispatch(c)}
            toggleDoc={(docId) => toggleDoc(props.store.state(), props.projectId, v().workerId, docId)}
            onClose={() => setContextOpen(false)}
          />
        )}
      </Presence>
      <Presence when={harness()} enter={false} class="pointer-events-auto">
        {(v) => (
          <HarnessSheet
            view={v()}
            layout={form().form.sheet}
            bottom={sheetBottom()}
            viewHeight={view().height}
            forecast={(command) => harnessForecast(props.store.state(), props.projectId, v().workerId, command)}
            dispatch={(c) => props.store.dispatch(c)}
            onClose={() => setHarnessOpen(false)}
          />
        )}
      </Presence>
      <div class="pointer-events-auto">
        <Dock
          ref={observeDock}
          store={props.store}
          projectId={props.projectId}
          layout={form().form.dock}
          compact={form().compact}
          problemCount={problemsOn() ? problems().length : 0}
          onProblems={() => setDismissed(new Set<string>())}
          onContext={openContext}
          onHarness={harnessOn() ? openHarness : undefined}
          onSettings={props.onSettings}
        />
      </div>
      <TutorialCoach store={props.store} padding={layout().flow.coachPadding} />
    </div>
  );
}
