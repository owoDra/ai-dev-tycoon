import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import type { GameStore } from '../../app/store';
import { audio } from '../../audio/index';
import { getCompanyTier } from '../../content/companyTiers';
import { findWorker, getHarnessPart, getHuman, getModel, getProject, getTask } from '../../content/index';
import {
  type Rect,
  type ScreenRegions,
  screenRegions,
  sheetHeightIn,
  type UiLayout,
  uiLayout,
} from '../../content/look/layout';
import { getSeat } from '../../content/seats';
import { eventSfx } from '../../content/sfx';
import type { AssignModeId, FeatureId } from '../../content/types';
import { modeFeature, unlockDefs } from '../../content/unlocks';
import type { BottleneckRef } from '../../core/bottleneck';
import { tierOf } from '../../core/company';
import { getIncidentDef } from '../../core/incidents';
import { defaultWorkflowName, findWorkflow, workflowFromWorker } from '../../core/library';
import { teamName } from '../../core/teams';
import { isUnlocked } from '../../core/unlocks';
import { ja } from '../../i18n/ja';
import { type Advice, adviseProblems } from '../../view/advice';
import { deliveredProjects, projectTabs } from '../../view/board';
import { type BottleneckMove, bottleneckMove, stageRows } from '../../view/bottleneck';
import { contextView, toggleDoc } from '../../view/context';
import { detailView } from '../../view/detail';
import { harnessForecast, harnessView } from '../../view/harness';
import { defaultSaveMode, importPreview, libraryView, recommendWorkflows, saveModes } from '../../view/library';
import { defaultWorkerFor, projectAgent, workflowTasks } from '../../view/project';
import { teamView, usageWarning } from '../../view/team';
import { promotionNotes, teamsView } from '../../view/teams';
import type { WorldViewModel } from '../../view/world';
import type { World } from '../../world/index';
import { fitColumn } from '../fitColumn';
import { Icon } from '../Icon';
import { keyAction, nextIsland } from '../keyboard';
import { createNotices } from '../notices';
import { Presence } from '../Presence';
import type { Selection } from '../selection';
import { BoardSheet } from './BoardSheet';
import { BottleneckGuide } from './BottleneckGuide';
import { ContextSheet } from './ContextSheet';
import { DetailSheet } from './DetailSheet';
import { Dock } from './Dock';
import { HarnessSheet } from './HarnessSheet';
import { IslandLabels } from './IslandLabels';
import { LibrarySheet } from './LibrarySheet';
import { NoticeHost } from './NoticeHost';
import { PlayControls } from './PlayControls';
import { ProblemToasts } from './ProblemToasts';
import { SaveWorkflowForm } from './SaveWorkflowForm';
import { TeamSheet } from './TeamSheet';
import { TutorialCoach } from './TutorialCoach';

/** シートの縁をドックの縁に重ねる量（px）。太い輪郭を1本に見せる */
const SHEET_OVERLAP = 3;

/** 領域の矩形を、絶対配置の style にする */
export const rectStyle = (r: Rect): JSX.CSSProperties => ({
  left: `${r.x}px`,
  top: `${r.y}px`,
  width: `${r.width}px`,
  height: `${r.height}px`,
});

/**
 * プレイ画面の UI（3D ワールドの上に重ねる）。D3「ゲームのドック」の構成で、画面を重ならない領域（content/look/layout.ts の screenRegions）に分け、
 * 上の帯（会社の帯と操作の列）・お知らせの列（次に対応すべき問題・お知らせ・納品と用語のカード）・下部のドック（HUD）・下から出るシート（詳細と担当変更）・島のラベルを置く。
 * state は読むだけで、変更は store.dispatch（Command）で行う。選択は UI の state（Selection）。
 * チュートリアル中はコーチマークを重ね、「次に対応すべき問題」は解放されるまで出さない。
 * 案件を開いていない（projectId が null）ときはホーム：3D は会社のオフィスで、ドックは引き合いの入口と会社の状態だけを出す。
 * 案件ボードは、ホームでもプレイ中でもほかのシートと同じ場所に開く。
 */
export function PlayScreen(props: {
  store: GameStore;
  /** 開いている案件。null ならホーム */
  projectId: string | null;
  selection: Selection;
  vm: Accessor<WorldViewModel | undefined>;
  world?: Accessor<World | undefined>;
  layout?: UiLayout;
  /** 画面の領域（App がセーフエリアの内側の大きさから求める）。渡さなければウィンドウの大きさから求める */
  regions?: Accessor<ScreenRegions>;
  /** 上の帯の左に出すもの（会社の帯） */
  strip?: JSX.Element;
  /** お知らせの列の後ろに積むもの（納品と用語のカード） */
  notices?: JSX.Element;
  onSettings?: () => void;
  /** 別の案件のタブへ切り替える（複数案件の同時進行） */
  onSwitch?: (projectId: string) => void;
  /** ホームへ戻る（ドックのタブの「オフィス」） */
  onHome?: () => void;
}) {
  /** 開いている案件の id。案件の島や Task にかかわる表示は、案件を開いているときだけ作るので、そこでは必ず案件の id になる */
  const pid = () => props.projectId ?? '';
  const inProject = () => props.projectId !== null;
  const layout = () => props.layout ?? uiLayout;
  const [windowSize, setWindowSize] = createSignal({ width: window.innerWidth, height: window.innerHeight });
  const onResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
  window.addEventListener('resize', onResize);
  onCleanup(() => window.removeEventListener('resize', onResize));
  const regions = createMemo(() => props.regions?.() ?? screenRegions(layout(), windowSize()));
  const view = () => {
    const r = regions();
    return { width: r.top.width + 2 * r.top.x, height: r.dock.y + r.dock.height + r.form.dock.bottom };
  };
  const form = createMemo(() => ({ compact: regions().shape === 'phone', form: regions().form }));

  const [dockHeight, setDockHeight] = createSignal(0);
  const observeDock = (el: HTMLElement) => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setDockHeight(el.offsetHeight));
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  };
  const sheetBottom = () => dockHeight() + form().form.dock.bottom - SHEET_OVERLAP;
  const sheetHeight = () => sheetHeightIn(regions(), view().height);

  // 問題は中身が同じなら同じ配列を返し、トーストを毎フレーム作り直さない
  const problems = createMemo(() => (inProject() ? adviseProblems(props.store.state(), pid()) : []), [], {
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
              : e.change === 'preset'
                ? ja.notices.presetApplied(ja.harness.presets[e.id as keyof typeof ja.harness.presets].label)
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
        if (e.type === 'WorkflowSaved') {
          const name = findWorkflow(props.store.state(), e.workflowId)?.name ?? '';
          notices.push({ text: ja.library.savedNotice(name), icon: 'workflow', tone: 'success' });
        }
        if (e.type === 'LibraryWorkflowApplied') {
          const name = findWorkflow(props.store.state(), e.workflowId)?.name ?? '';
          notices.push({ text: ja.library.appliedNotice(name), icon: 'workflow', tone: 'success' });
          if (e.skipped.length > 0) {
            notices.push({ text: ja.library.skippedNotice(e.skipped.length), icon: 'warning', tone: 'danger' });
          }
          setLibraryOpen(false);
        }
        if (e.type === 'WorkflowAssigned' && e.projectId === props.projectId) {
          notices.push({ text: ja.notices.workflow(e.taskIds.length), icon: 'workflow', tone: 'success' });
        }
        if (e.type === 'SeatChanged') {
          notices.push({ text: ja.team.changed(getSeat(e.seat).name), icon: 'success', tone: 'success' });
        }
        if (e.type === 'StaffJoined') {
          notices.push({ text: ja.team.joined(getHuman(e.staffId).name), icon: 'human', tone: 'success' });
        }
        if (e.type === 'StaffReleased') {
          notices.push({ text: ja.team.released(getHuman(e.staffId).name), icon: 'human', tone: 'neutral' });
        }
        if (e.type === 'CompanyPromoted') {
          const state = props.store.state();
          const notes = promotionNotes(state, e.from);
          notices.push({ text: ja.company.promoted(getCompanyTier(e.tier).name), icon: 'trophy', tone: 'success' });
          for (const note of notes)
            notices.push({ text: `${ja.unlocks.badge} ${note}`, icon: 'success', tone: 'success' });
        }
        if (e.type === 'CompanyRanked') {
          notices.push({
            text: ja.company.rankedUp(tierOf(props.store.state()).name),
            icon: 'trophy',
            tone: 'success',
          });
        }
        if (e.type === 'AchievementUnlocked') {
          const name = ja.achievements.defs[e.id]?.name ?? e.id;
          notices.push({ text: ja.achievements.unlocked(name), icon: 'trophy', tone: 'success' });
        }
        if (e.type === 'FiscalClosed') {
          notices.push({ text: ja.fiscal.closedNotice(e.no), icon: 'money', tone: 'neutral' });
        }
        if (e.type === 'CashShort') {
          notices.push({ text: ja.funds.shortNotice(e.daysLeft), icon: 'warning', tone: 'danger' });
        }
        if (e.type === 'OutageOccurred') {
          const text = ja.companyEvents.outage(getProject(e.projectId).name, ja.score.yen(e.cost));
          notices.push({ text, icon: 'failure', tone: 'danger' });
        }
        if (e.type === 'PoachOffered') {
          notices.push({
            text: ja.companyEvents.poachOffered(getHuman(e.staffId).name),
            icon: 'human',
            tone: 'warning',
          });
        }
        if (e.type === 'PoachAnswered') {
          const name = getHuman(e.staffId).name;
          const text = e.retained ? ja.companyEvents.retained(name) : ja.companyEvents.leaving(name);
          notices.push({ text, icon: 'human', tone: 'neutral' });
        }
        if (e.type === 'StaffPoached') {
          notices.push({ text: ja.companyEvents.poached(getHuman(e.staffId).name), icon: 'human', tone: 'danger' });
        }
        if (e.type === 'PriceWarChanged') {
          const text = e.active ? ja.companyEvents.priceWarOn : ja.companyEvents.priceWarOff;
          notices.push({ text, icon: e.active ? 'failure' : 'success', tone: e.active ? 'warning' : 'neutral' });
        }
        if (e.type === 'TeamCreated') {
          notices.push({
            text: ja.teams.created(teamName(props.store.state(), e.teamId)),
            icon: 'human',
            tone: 'success',
          });
        }
        if (e.type === 'AiWorkerAdded') {
          notices.push({ text: ja.teams.agentAdded(findWorker(e.workerId)?.name ?? ''), icon: 'ai', tone: 'success' });
        }
        if (e.type === 'ManagerAssigned') {
          const name = teamName(props.store.state(), e.teamId);
          const text =
            e.manager === null
              ? ja.teams.managerRemoved(name)
              : ja.teams.managerSet(name, e.manager === 'ai' ? ja.teams.aiPm : ja.teams.humanPm);
          notices.push({ text, icon: e.manager === 'ai' ? 'ai' : 'human', tone: 'neutral' });
        }
        if (e.type === 'InquiriesPosted' && e.projectIds.length > 0) {
          notices.push({ text: ja.board.posted(e.projectIds.length), icon: 'project', tone: 'neutral' });
        }
        if (e.type === 'BidWon') {
          notices.push({ text: ja.board.won(getProject(e.projectId).name), icon: 'trophy', tone: 'success' });
        }
        if (e.type === 'BidLost') {
          notices.push({ text: ja.board.lost(getProject(e.projectId).name), icon: 'failure', tone: 'neutral' });
        }
        if (e.type === 'InquiryPassed') {
          notices.push({ text: ja.board.passed(getProject(e.projectId).name), icon: 'clock', tone: 'neutral' });
        }
        if (e.type === 'ProjectCompleted' && e.projectId !== props.projectId) {
          notices.push({ text: ja.board.delivered(getProject(e.projectId).name), icon: 'success', tone: 'success' });
        }
        if (e.type === 'ReputationChanged') {
          const up = e.delta >= 0;
          notices.push({
            text: ja.board.reputationChanged(e.delta),
            icon: up ? 'success' : 'warning',
            tone: up ? 'success' : 'warning',
          });
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
    if (!entity || !pending || !inProject() || state.tutorial || !isUnlocked(state, 'problems')) return;
    const next = bottleneckMove(pid(), guided, pending);
    if (!next || next.entityId !== entity) return;
    guided = pending;
    setMove(next);
  });
  const rows = createMemo(() => (move() && compare() && inProject() ? stageRows(props.store.state(), pid()) : []));

  // Context と Harness Builder のシート。詳細のシートと同じ場所に出すので、どれか1つだけを開く
  const [contextOpen, setContextOpen] = createSignal(false);
  const context = createMemo(() => (contextOpen() && inProject() ? contextView(props.store.state(), pid()) : null));
  /** 開いているシートをすべて閉じる（シートは1つだけ開く） */
  const closeSheets = () => {
    setContextOpen(false);
    setHarnessOpen(false);
    setTeamOpen(false);
    setLibraryOpen(false);
    setBoardOpen(false);
  };
  const openContext = () => {
    props.selection.dispatch({ type: 'SelectEntity', entityId: null });
    closeSheets();
    setContextOpen(true);
  };
  // Workflow Library（企画書25章）。Task の詳細から開くと、その Task に適用できる
  const [libraryOpen, setLibraryOpen] = createSignal(false);
  const [libraryTask, setLibraryTask] = createSignal<string | null>(null);
  const libraryTarget = () => {
    const taskId = libraryTask();
    return taskId && inProject() ? { projectId: pid(), taskId, workerId: harnessWorker() } : null;
  };
  const library = createMemo(() =>
    libraryOpen() && harnessOn() && inProject() ? libraryView(props.store.state(), libraryTarget()) : null,
  );
  const openLibrary = (taskId: string | null) => {
    props.selection.dispatch({ type: 'SelectEntity', entityId: null });
    closeSheets();
    setLibraryTask(taskId);
    setLibraryOpen(true);
  };
  const [harnessOpen, setHarnessOpen] = createSignal(false);
  // 社員と Seat の画面（企画書6章）
  const [teamOpen, setTeamOpen] = createSignal(false);
  const teamOn = () => isUnlocked(props.store.state(), 'team') || isUnlocked(props.store.state(), 'hire');
  const team = createMemo(() => (teamOpen() ? teamView(props.store.state()) : null));
  const teams = createMemo(() => (teamOpen() && props.store.state().board ? teamsView(props.store.state()) : null));
  const delivered = createMemo(() =>
    teamOpen() && props.store.state().board ? deliveredProjects(props.store.state()) : null,
  );
  const openTeam = () => {
    props.selection.dispatch({ type: 'SelectEntity', entityId: null });
    closeSheets();
    setTeamOpen(true);
  };
  // 案件ボード（ホームとプレイの上に開くシート）。チュートリアルの間は開かない
  const [boardOpen, setBoardOpen] = createSignal(false);
  const boardOn = () => props.store.state().board !== null && props.store.state().tutorial === null;
  const openBoard = () => {
    props.selection.dispatch({ type: 'SelectEntity', entityId: null });
    closeSheets();
    setBoardOpen(true);
  };
  const tabs = createMemo(() => projectTabs(props.store.state(), props.projectId), undefined, {
    equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  const harnessWorker = () => projectAgent(props.store.state(), pid());
  // Harness Builder は案件の AI Worker を組むので、案件を開いているときだけ
  const harnessOn = () => isUnlocked(props.store.state(), 'harness') && inProject();
  const harness = createMemo(() =>
    harnessOpen() && harnessOn() ? harnessView(props.store.state(), pid(), harnessWorker()) : null,
  );
  const openHarness = () => {
    props.selection.dispatch({ type: 'SelectEntity', entityId: null });
    closeSheets();
    setHarnessOpen(true);
  };
  createEffect(() => {
    if (props.selection.selected() !== null) closeSheets();
  });

  const selected = () => props.selection.selected();
  const detail = createMemo(() => {
    const id = selected();
    const vm = props.vm();
    return id && vm && inProject() ? detailView(props.store.state(), pid(), vm, id) : null;
  });

  let sheetEl: HTMLElement | undefined;
  let root!: HTMLDivElement;
  /** 矢印キーで移る起点。担当を決めてシートが閉じても、続けて隣の島へ進めるように最後に選んだ島を覚えておく */
  let lastIsland: string | null = null;
  const select = (entityId: string | null) => {
    if (entityId?.startsWith('island:')) lastIsland = entityId;
    props.selection.dispatch({ type: 'SelectEntity', entityId });
  };
  /**
   * 3D の世界の領域のうち、シートに隠れない範囲の中心へカメラを寄せる。
   * カメラは世界の領域の中心を基準にする（world/camera.ts の setFrame）ので、そこからのずれを渡す
   */
  const focusCamera = (entityId: string) => {
    const w = regions().world;
    const sheetTop = sheetBottom() > 0 ? view().height - sheetBottom() - sheetHeight() : w.y + w.height;
    const visibleBottom = Math.max(w.y, Math.min(w.y + w.height, sheetTop));
    const offsetY = (w.y + visibleBottom) / 2 - (w.y + w.height / 2);
    props.world?.()?.focus(entityId, { x: 0, y: offsetY }, layout().flow.focusZoom);
  };

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
      projectId: pid(),
      taskId,
      mode,
      workerId: defaultWorkerFor(mode, props.store.state(), pid()),
    });
    notices.push({ text: ja.assign.assigned(getTask(pid(), taskId).name, ja.modes[mode]), icon: 'success' });
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
        if (contextOpen() || harnessOpen() || teamOpen() || libraryOpen() || boardOpen()) {
          e.preventDefault();
          closeSheets();
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

  /** Harness Builder と Workflow Library を行き来するタブ（どちらのシートにも上端に出す） */
  const aiTabs = (current: 'harness' | 'library') => (
    <div role="tablist" aria-label={ja.library.tabs} class="flex gap-1.5" data-ai-tabs>
      <For each={['harness', 'library'] as const}>
        {(id) => (
          <button
            type="button"
            role="tab"
            aria-selected={current === id}
            data-ai-tab={id}
            class={`flex h-9 items-center gap-1.5 rounded-md border-[3px] border-line px-2 text-sm font-bold ${
              current === id ? 'bg-accent-200' : 'bg-sunken'
            }`}
            onClick={() => (id === 'harness' ? openHarness() : openLibrary(null))}
          >
            <Icon name={id === 'harness' ? 'ai' : 'workflow'} />
            {id === 'harness' ? ja.harness.title : ja.library.title}
          </button>
        )}
      </For>
    </div>
  );

  /** 日付と時刻・速度・メニュー（上の帯の右。スマホでは時計と速度だけを右上に、メニューをドックに。layout の controls） */
  const controls = (part: 'all' | 'clock' | 'menu') => (
    <PlayControls
      store={props.store}
      compact={form().form.controls !== 'labeled'}
      part={part}
      onBoard={boardOn() ? openBoard : undefined}
      onTeam={teamOn() ? openTeam : undefined}
      teamWarning={usageWarning(props.store.state())}
      onHarness={harnessOn() ? openHarness : undefined}
      onSettings={props.onSettings}
    />
  );

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
      <div
        class="pointer-events-none absolute z-30 flex items-start justify-between gap-2"
        style={rectStyle(regions().top)}
        data-region="top"
      >
        <div class="flex min-w-0 flex-1">{props.strip}</div>
        <div class="pointer-events-auto shrink-0">{controls(form().form.controls === 'dock' ? 'clock' : 'all')}</div>
      </div>
      {/* お知らせの列：大事な順（問題 → 納品 → 用語 → 短いお知らせ）に並べ、入りきらない分は出さない（ui/fitColumn.ts） */}
      <div
        ref={fitColumn}
        class="pointer-events-none absolute z-20 flex flex-col items-end gap-2 overflow-hidden"
        style={rectStyle(regions().notices)}
        data-region="notices"
      >
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
        <NoticeHost notices={notices.list()} />
        {props.notices}
      </div>
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
            top={regions().world.y + 8}
          />
        )}
      </Show>
      <Presence when={detail()} enter={false} class="pointer-events-auto">
        {(d) => (
          <DetailSheet
            ref={(el) => {
              sheetEl = el;
            }}
            store={props.store}
            projectId={pid()}
            detail={d()}
            layout={form().form.sheet}
            scrollCards={form().form.assignCards === 'scroll'}
            fresh={fresh()}
            bottom={sheetBottom()}
            viewHeight={view().height}
            maxHeight={regions().sheet.height}
            onClose={close}
            onAssign={assign}
            onHarness={harnessOn() ? openHarness : undefined}
            onLibrary={harnessOn() ? (taskId) => openLibrary(taskId) : undefined}
            picks={(taskId) =>
              recommendWorkflows(
                props.store.state(),
                { projectId: pid(), taskId, workerId: harnessWorker() },
                layout().flow.workflowPicks,
              )
            }
            onApplyWorkflow={(command) => {
              props.store.dispatch(command);
              if (!layout().flow.keepDetailAfterAssign) close();
            }}
            workflow={(taskId) => workflowTasks(props.store.state(), pid(), taskId)}
            onWorkflow={(taskIds) => {
              props.store.dispatch({
                type: 'AssignWorkflow',
                projectId: pid(),
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
            maxHeight={regions().sheet.height}
            dispatch={(c) => props.store.dispatch(c)}
            toggleDoc={(docId) => toggleDoc(props.store.state(), pid(), v().workerId, docId)}
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
            maxHeight={regions().sheet.height}
            forecast={(command) => harnessForecast(props.store.state(), pid(), v().workerId, command)}
            dispatch={(c) => props.store.dispatch(c)}
            onClose={() => setHarnessOpen(false)}
            tabs={aiTabs('harness')}
            footer={
              <SaveWorkflowForm
                modes={saveModes(props.store.state())}
                defaultMode={defaultSaveMode(props.store.state(), pid(), v().workerId)}
                defaultName={defaultWorkflowName(props.store.state())}
                onSave={(name, mode) =>
                  props.store.dispatch({
                    type: 'SaveLibraryWorkflow',
                    workflow: workflowFromWorker(props.store.state(), v().workerId, mode, name),
                  })
                }
              />
            }
          />
        )}
      </Presence>
      <Presence when={library()} enter={false} class="pointer-events-auto">
        {(v) => (
          <LibrarySheet
            view={v()}
            target={libraryTask() ? getTask(pid(), libraryTask() ?? '').name : null}
            layout={form().form.sheet}
            bottom={sheetBottom()}
            viewHeight={view().height}
            maxHeight={regions().sheet.height}
            forecast={(command) => harnessForecast(props.store.state(), pid(), harnessWorker(), command)}
            readCode={(code) => importPreview(props.store.state(), code)}
            dispatch={(c) => props.store.dispatch(c)}
            onClose={() => setLibraryOpen(false)}
            tabs={aiTabs('library')}
          />
        )}
      </Presence>
      <Presence when={team()} enter={false} class="pointer-events-auto">
        {(v) => (
          <TeamSheet
            view={v()}
            teams={teams()}
            delivered={delivered()}
            layout={form().form.sheet}
            bottom={sheetBottom()}
            viewHeight={view().height}
            maxHeight={regions().sheet.height}
            dispatch={(c) => props.store.dispatch(c)}
            onClose={() => setTeamOpen(false)}
          />
        )}
      </Presence>
      <Presence when={boardOpen() && boardOn()} enter={false} class="pointer-events-auto">
        {() => (
          <BoardSheet
            store={props.store}
            layout={form().form.sheet}
            bottom={sheetBottom()}
            viewHeight={view().height}
            maxHeight={regions().sheet.height}
            onClose={() => setBoardOpen(false)}
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
          tabs={props.onSwitch ? tabs() : undefined}
          onSwitch={props.onSwitch}
          onBoard={boardOn() ? openBoard : undefined}
          onHome={props.onHome}
          controls={form().form.controls === 'dock' ? controls('menu') : undefined}
        />
      </div>
      <TutorialCoach store={props.store} padding={layout().flow.coachPadding} />
    </div>
  );
}
