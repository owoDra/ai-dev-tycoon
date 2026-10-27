import { describe, expect, it } from 'vitest';
import { content, getProject } from '../../src/content/index';
import { tutorialScript } from '../../src/content/tutorial';
import type { AssignModeId } from '../../src/content/types';
import { allFeatures } from '../../src/content/unlocks';
import { type Command, reduce } from '../../src/core/commands';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { currentTutorialStep, isAllowed, resolveSay } from '../../src/core/tutorial';

const P = tutorialScript.projectId;
const assign = (taskId: string, mode: AssignModeId): Command => ({
  type: 'AssignTask',
  projectId: P,
  taskId,
  mode,
  workerId: mode === 'human' ? 'sato' : 'agent',
});
const PLAN: Readonly<Record<string, Command>> = {
  choose: assign('wireframe', 'ai'),
  next: assign('coding', 'ai'),
  miss: assign('form', 'aiThenHumanReview'),
  tryEval: assign('responsive', 'aiThenEval'),
};

function start(): GameState {
  return reduce(createInitialState(tutorialScript.seed, { tutorial: true }), { type: 'StartProject', projectId: P })
    .state;
}

/** 想定どおりに進めながら、到達したステップごとの state を集める */
function visitSteps(): Map<string, GameState> {
  const seen = new Map<string, GameState>();
  let s = start();
  for (let guard = 0; s.tutorial && guard < 2000; guard++) {
    const id = currentTutorialStep(s)?.id ?? '';
    if (!seen.has(id)) seen.set(id, s);
    const planned = PLAN[id];
    if (planned && s.projects[P]?.tasks[(planned as { taskId: string }).taskId]?.assignment === null) {
      s = reduce(s, planned).state;
      continue;
    }
    s = step(s, 1).state;
  }
  return seen;
}

/** その state で試す担当の決定（全 Task × 全モード） */
function allAssigns(): Command[] {
  return getProject(P).tasks.flatMap((t) => content.assignModes.map((m) => assign(t.id, m.id)));
}

describe('チュートリアルの台本：許可されていない操作は拒否される', () => {
  const visited = visitSteps();

  it('全ステップに到達する', () => {
    expect([...visited.keys()]).toEqual(tutorialScript.steps.map((s) => s.id));
  });

  for (const def of tutorialScript.steps) {
    it(`ステップ「${def.id}」：allow の担当だけが受け付けられ、ほかの担当の決定は状態を変えない`, () => {
      const s = visited.get(def.id);
      if (!s) throw new Error(`${def.id} に到達していない`);
      for (const command of allAssigns()) {
        if (command.type !== 'AssignTask') continue;
        const permitted = def.allow.some((a) => a.taskId === command.taskId && a.modes.includes(command.mode));
        const r = reduce(s, command);
        expect(isAllowed(s, command), `${command.taskId}/${command.mode}`).toBe(permitted);
        if (permitted) {
          expect(r.state.projects[P]?.tasks[command.taskId]?.assignment?.mode).toBe(command.mode);
        } else {
          expect(r.state, `${command.taskId}/${command.mode}`).toBe(s);
          expect(r.events).toEqual([]);
        }
      }
    });
  }

  it('時間の操作（速度・一時停止）はどのステップでも受け付ける', () => {
    for (const s of visited.values()) {
      expect(reduce(s, { type: 'SetSpeed', speed: 3 }).state.speed).toBe(3);
      expect(reduce(s, { type: 'TogglePause' }).state.paused).toBe(true);
    }
  });

  it('チュートリアル中は、チュートリアル外の案件の担当の決定を拒否する', () => {
    const s = reduce(start(), { type: 'StartProject', projectId: 'ecRenewal' }).state;
    const other: Command = {
      type: 'AssignTask',
      projectId: 'ecRenewal',
      taskId: 'hearing',
      mode: 'human',
      workerId: 'sato',
    };
    expect(reduce(s, other).state).toBe(s);
  });

  it('最初のステップでは「人間」と「AI」の2つだけを選べ、文言は「この作業を誰に任せる？」', () => {
    const s = start();
    const def = currentTutorialStep(s);
    expect(def?.allow).toEqual([{ type: 'AssignTask', taskId: 'wireframe', modes: ['human', 'ai'] }]);
    expect(resolveSay(s, def?.say ?? 'choose')).toBe('choose');
    expect(s.unlocked).toEqual(['mode:human', 'mode:ai']);
  });

  it('文言は選んだ担当に合わせて切り替わる（人間を選んだら「時間がかかる」）', () => {
    const human = reduce(start(), assign('wireframe', 'human')).state;
    const ai = reduce(start(), assign('wireframe', 'ai')).state;
    const say = currentTutorialStep(human)?.say ?? 'choose';
    expect(currentTutorialStep(human)?.id).toBe('firstWork');
    expect(resolveSay(human, say)).toBe('humanWorking');
    expect(resolveSay(ai, say)).toBe('aiWorking');
  });

  it('スキップすると残りの機能がすべて解放され、どの担当も選べるようになる', () => {
    const r = reduce(start(), { type: 'SkipTutorial' });
    expect(r.state.tutorial).toBeNull();
    expect(r.state.unlocked).toEqual(allFeatures);
    expect(r.events).toContainEqual({ type: 'TutorialEnded', skipped: true });
    expect(r.events.filter((e) => e.type === 'FeatureUnlocked')).toHaveLength(allFeatures.length - 2);
    const s = reduce(r.state, assign('wireframe', 'agentWorkflow')).state;
    expect(s.projects[P]?.tasks.wireframe?.assignment?.mode).toBe('agentWorkflow');
  });

  it('チュートリアル外では未解放のモードの担当を拒否する（解放済みなら受け付ける）', () => {
    const base = reduce(createInitialState('free'), { type: 'StartProject', projectId: 'ecRenewal' }).state;
    const command: Command = {
      type: 'AssignTask',
      projectId: 'ecRenewal',
      taskId: 'hearing',
      mode: 'aiThenEval',
      workerId: 'agent',
    };
    expect(reduce(base, command).state.projects.ecRenewal?.tasks.hearing?.assignment?.mode).toBe('aiThenEval');
    const locked = { ...base, unlocked: base.unlocked.filter((f) => f !== 'mode:aiThenEval') };
    expect(reduce(locked, command).state).toBe(locked);
  });
});
