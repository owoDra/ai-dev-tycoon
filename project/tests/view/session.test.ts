import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import { catchUp } from '../../src/core/away';
import { openInquiries } from '../../src/core/board';
import { tierOf } from '../../src/core/company';
import { scoreCompany } from '../../src/core/scoring';
import { step } from '../../src/core/step';
import { activeProjectViews, daySummary, nextSteps, recapView } from '../../src/view/session';
import { campaignInProgress, SESSION_PROJECT } from '../helpers/session';

const DAY = balance.time.minutesPerDay;

describe('区切りとあらすじの ViewModel（view/session.ts）', () => {
  it('次にやること：担当が決まっていない仕事があれば知らせ、なければ見守る', () => {
    expect(nextSteps(campaignInProgress('n', 2))).toEqual([{ kind: 'assign', count: 2 }]);
    expect(nextSteps(campaignInProgress('n', 0))).toEqual([{ kind: 'watch' }]);
  });

  it('進行中の案件の進み具合と、納期までの残り日数', () => {
    const s = campaignInProgress();
    const def = getProject(SESSION_PROJECT);
    expect(activeProjectViews(s)).toEqual([
      { projectId: SESSION_PROJECT, name: def.name, done: 0, total: def.tasks.length, daysLeft: def.deadlineDays },
    ]);
    // 担当を決めていない仕事が残っていれば納品できず、納期を過ぎると負の日数になる
    const late = step(campaignInProgress('late', 1), DAY * (def.deadlineDays + 1)).state;
    expect(activeProjectViews(late)[0]?.daysLeft).toBeCloseTo(-1);
  });

  it('営業日の成果：その日に完了した仕事・納品・利益と人間の稼働の増減', () => {
    const start = campaignInProgress('day');
    const end = step(start, DAY).state;
    const summary = daySummary(start, end);
    const done = Object.values(end.projects[SESSION_PROJECT]?.tasks ?? {}).filter((t) => t.status === 'done').length;
    expect(summary.day).toBe(1);
    expect(summary.tasksDone).toBe(done);
    expect(summary.profit).toBeCloseTo(scoreCompany(end).profit - scoreCompany(start).profit);
    expect(summary.humanMinutes).toBeCloseTo(scoreCompany(end).humanMinutes - scoreCompany(start).humanMinutes);
    // 次の日は、その日に完了した分だけを数える
    const next = step(end, DAY).state;
    const doneNext = Object.values(next.projects[SESSION_PROJECT]?.tasks ?? {}).filter((t) => t.status === 'done');
    expect(daySummary(end, next).tasksDone).toBe(doneNext.length - done);
    expect(daySummary(end, next).day).toBe(2);
  });

  it('納品した日は、その案件を成果に出し、次にやることに見積を出していない引き合いを出す', () => {
    let s = campaignInProgress('deliver');
    let prev = s;
    for (let day = 0; day < 6 && s.projects[SESSION_PROJECT]?.completedAt === null; day++) {
      prev = s;
      s = step(s, DAY).state;
    }
    expect(s.projects[SESSION_PROJECT]?.completedAt).not.toBeNull();
    const summary = daySummary(prev, s);
    expect(summary.delivered).toEqual([getProject(SESSION_PROJECT).name]);
    expect(summary.active).toEqual([]);
    // 引き合いは営業日ごとに届き、見積を出さなければ締切まで残る
    const open = openInquiries(s).length;
    expect(open).toBeGreaterThanOrEqual(tierOf(s).inquiries);
    expect(summary.next).toContainEqual({ kind: 'offer', count: open });
  });

  it('あらすじ：閉じていた間に進んだ時間と完了した仕事を、閉じていた間の進行の events から数える', () => {
    const before = campaignInProgress('recap', 1);
    const { state: after, events } = catchUp(before, 24 * 60 * 60);
    const recap = recapView(before, after, events);
    expect(recap.awayMinutes).toBe(DAY);
    expect(recap.tasksDone).toBe(events.filter((e) => e.type === 'TaskCompleted').length);
    expect(recap.tasksDone).toBeGreaterThan(0);
    expect(recap.next[0]).toEqual({ kind: 'assign', count: 1 });
    expect(recap.active.map((p) => p.projectId)).toEqual([SESSION_PROJECT]);
    // 閉じていた間に進めなければ、進み具合と次にやることだけ
    expect(recapView(before, before, [])).toMatchObject({ awayMinutes: 0, tasksDone: 0, delivered: [] });
  });

  it('事件が起きていれば、次にやることの先頭に出す', () => {
    const s = campaignInProgress('incident');
    const withIncident = {
      ...s,
      incidents: [
        { id: 'contextOverflow' as const, workerId: 'agent', projectId: SESSION_PROJECT, taskId: 'x', since: 0 },
      ],
    };
    expect(nextSteps(withIncident)[0]).toEqual({ kind: 'incident', count: 1 });
  });
});
