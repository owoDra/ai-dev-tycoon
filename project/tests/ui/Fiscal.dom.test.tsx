import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { balance } from '../../src/content/balance';
import { listedTier } from '../../src/content/companyTiers';
import { valuationOf } from '../../src/core/funds';
import { decodeFiscalCode } from '../../src/core/resultCode';
import type { GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { ja } from '../../src/i18n/ja';
import { CompanyStrip } from '../../src/ui/company/CompanyStrip';
import { DeliveryCards, DeliveryModal } from '../../src/ui/company/DeliveryCard';
import { BankruptScreen } from '../../src/ui/screens/BankruptScreen';
import { FiscalScreen } from '../../src/ui/screens/FiscalScreen';
import { deliveryView, fiscalView } from '../../src/view/fiscal';
import { growCompany } from '../helpers/growth';

const DAY = balance.time.minutesPerDay;
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function mount(view: () => unknown) {
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(view as () => never, root);
  return <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
}

/** 1期を締めた会社（決算の画面と帯で共通に使う） */
const closed = (() => {
  let cached: GameState | undefined;
  return () => {
    cached ??= growCompany('fiscal-ui', balance.fiscal.days + 1).state;
    return cached;
  };
})();

describe('決算の画面', () => {
  it('第1段（利益 / 人日・増益か減益のスタンプ）から始まり、結果コード → 内訳 → 推移の順に開示する', () => {
    vi.useFakeTimers();
    const state = closed();
    const onNext = vi.fn();
    const q = mount(() => <FiscalScreen store={createGameStore(state)} no={1} onNext={onNext} onTitle={() => {}} />);
    expect(q('#fiscal-title')?.textContent).toContain(ja.fiscal.title(1));
    expect(q('[data-stamp]')?.textContent).toMatch(new RegExp(`${ja.fiscal.up}|${ja.fiscal.down}`));
    expect(q('[data-vs-previous]')?.textContent).toBe(ja.fiscal.first);
    expect(q('[data-stage="2"]')).toBeNull();
    vi.runOnlyPendingTimers();
    expect(q('[data-metric="revenue"]')).not.toBeNull();
    expect(q('[data-metric="profit"]')).not.toBeNull();
    const code = q('[data-code]')?.textContent ?? '';
    expect(decodeFiscalCode(code)).toMatchObject({ ok: true, record: { no: 1, seed: state.seed } });
    expect(q('[data-stage="3"]')).toBeNull();
    q<HTMLButtonElement>('[data-more]')?.click();
    expect(q('[data-stage="3"] [data-team-row]')).not.toBeNull();
    expect(q('[data-best]')).not.toBeNull();
    expect(q('[data-fiscal-achievement="firstDelivery"]')).not.toBeNull();
    q<HTMLButtonElement>('[data-advanced]')?.click();
    expect(q('[data-stage="4"]')?.textContent).toContain(ja.fiscal.trend);
    q<HTMLButtonElement>('[data-next]')?.click();
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe('会社の帯', () => {
  it('1行のピルで規模・目標の達成率・資金・決算までの日数をいつも出し、押すと目標の内訳と実績の一覧を開ける', () => {
    const state = closed();
    const q = mount(() => <CompanyStrip store={createGameStore(state)} />);
    expect(q('[data-goal-percent]')?.textContent).toContain(ja.fiscal.goal);
    expect(q('[data-goal]')).toBeNull();
    q<HTMLButtonElement>('[data-strip-toggle]')?.click();
    expect(q('[data-strip-toggle]')?.getAttribute('aria-expanded')).toBe('true');
    expect(q('[data-goal]')?.textContent).toContain(ja.company.next(''));
    expect(q('[data-goal-item="profit"]')).not.toBeNull();
    expect(q('[data-cash]')?.textContent).toContain(ja.funds.cash);
    expect(q('[data-fiscal-days]')?.textContent).toContain(ja.fiscal.period2(2));
    expect(q('[data-achievements]')).toBeNull();
    q<HTMLButtonElement>('[data-open-achievements]')?.click();
    expect(q('[data-achievement="firstDelivery"]')?.dataset.done).toBe('true');
    expect(q('[data-achievement="large"]')?.textContent).toContain(ja.achievements.locked);
  });

  it('内訳から「評価のしくみ」を開くと、品質・納期 → 評判 → 受注額と、利益 ÷ 人日 → 月の利益ペースの流れが出る', () => {
    const q = mount(() => <CompanyStrip store={createGameStore(closed())} />);
    q<HTMLButtonElement>('[data-strip-toggle]')?.click();
    expect(q('[data-guide]')).toBeNull();
    q<HTMLButtonElement>('[data-open-guide]')?.click();
    expect(q('[data-guide-flow="reputation"]')?.textContent).toContain(ja.evaluation.guide.quality);
    expect(q('[data-guide-flow="profit"]')?.textContent).toContain(ja.evaluation.guide.profit);
  });

  it('個人事業のうちは実績を出さない', () => {
    const solo = { ...closed(), tier: 'solo' as const };
    const q = mount(() => <CompanyStrip store={createGameStore(solo)} />);
    q<HTMLButtonElement>('[data-strip-toggle]')?.click();
    expect(q('[data-open-achievements]')).toBeNull();
    expect(q('[data-open-guide]')).not.toBeNull();
  });

  it('時価総額は上場（上場企業の規模）してから帯の内訳に出し、それまでの決算では推定の企業価値と呼ぶ', () => {
    const state = closed();
    expect(state.tier).not.toBe(listedTier);
    const unlisted = mount(() => <CompanyStrip store={createGameStore(state)} />);
    unlisted<HTMLButtonElement>('[data-strip-toggle]')?.click();
    expect(unlisted('[data-valuation]')).toBeNull();
    expect(fiscalView(state)?.listed).toBe(false);
    dispose();
    const listed = { ...state, tier: listedTier };
    const listedQ = mount(() => <CompanyStrip store={createGameStore(listed)} />);
    // ピルは規模・目標・資金の3つだけにし、時価総額は内訳に出す（Phase 41）
    expect(listedQ('[data-strip-toggle] [data-valuation]')).toBeNull();
    listedQ<HTMLButtonElement>('[data-strip-toggle]')?.click();
    expect(listedQ('[data-valuation]')?.textContent).toContain(ja.fiscal.valuation(true));
    expect(listedQ('[data-valuation]')?.textContent).toContain(ja.funds.oku(valuationOf(listed)));
  });

  it('資金がマイナスなら倒産までの日数を警告し、引き抜きの打診には引き留めと見送りのボタンを出す', () => {
    const base = closed();
    const staffId = Object.keys(base.team)[0] ?? '';
    const state: GameState = {
      ...base,
      idleCost: base.idleCost + 10_000_000_000,
      funds: { ...base.funds, shortDays: 3 },
      companyEvents: { ...base.companyEvents, offers: [{ staffId, deadline: base.clock + DAY * 2, leaving: false }] },
    };
    const store = createGameStore(state);
    const dispatched: string[] = [];
    const dispatch = store.dispatch;
    store.dispatch = (c) => {
      dispatched.push(c.type === 'AnswerPoach' ? `${c.type}:${c.retain}` : c.type);
      dispatch(c);
    };
    const q = mount(() => <CompanyStrip store={store} />);
    expect(q('[data-cash-short]')?.textContent).toContain(ja.funds.short(balance.funds.graceDays - 3));
    // 資金がマイナスの間は、目標の内訳を開いたままにする
    expect(q('[data-goal]')).not.toBeNull();
    expect(q(`[data-poach="${staffId}"]`)).not.toBeNull();
    q<HTMLButtonElement>('[data-retain]')?.click();
    expect(dispatched).toEqual(['AnswerPoach:true']);
  });
});

describe('倒産の画面と納品のカード', () => {
  it('倒産したら、時価総額の推移を折れ線で見せ、最高値に印を付ける', () => {
    const base = closed();
    const broke = step(
      { ...base, idleCost: base.idleCost + 10_000_000_000 },
      DAY * (balance.funds.graceDays + 1),
    ).state;
    expect(broke.funds.bankruptAt).not.toBeNull();
    const onRestart = vi.fn();
    const q = mount(() => <BankruptScreen store={createGameStore(broke)} onRestart={onRestart} onTitle={() => {}} />);
    expect(q('#bankrupt-title')?.textContent).toContain(ja.funds.bankruptTitle);
    const chart = q('[data-valuation-chart]');
    expect(chart?.getAttribute('role')).toBe('img');
    expect(chart?.querySelector('[data-peak]')).not.toBeNull();
    expect(q('[data-peak-text]')).not.toBeNull();
    q<HTMLButtonElement>('[data-restart]')?.click();
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it('納品のカードは成果を短く出し、「振り返りを見る」でその案件を開ける', () => {
    const state = growCompany('delivery-ui', 3).state;
    const id = Object.values(state.projects).find((p) => p.completedAt !== null)?.projectId ?? '';
    const card = deliveryView(state, id);
    if (!card) throw new Error('納品した案件がない');
    const onReview = vi.fn();
    const q = mount(() => <DeliveryCards cards={[card]} onReview={onReview} onClose={() => {}} />);
    expect(q(`[data-delivery="${id}"]`)?.textContent).toContain(ja.delivery.title(card.name));
    q<HTMLButtonElement>('[data-review]')?.click();
    expect(onReview).toHaveBeenCalledWith(id);
  });

  it('直轄の納品のモーダルは、利益 / 人日・納期・品質・評判の変化を出し、「振り返りを見る」と「続ける」を置く', () => {
    const state = growCompany('delivery-ui', 3).state;
    const id = Object.values(state.projects).find((p) => p.completedAt !== null)?.projectId ?? '';
    const view = deliveryView(state, id);
    if (!view) throw new Error('納品した案件がない');
    const onReview = vi.fn();
    const onNext = vi.fn();
    const q = mount(() => <DeliveryModal delivery={view} onReview={onReview} onNext={onNext} />);
    const dialog = q('[data-delivery-modal] [role="dialog"]');
    expect(dialog?.textContent).toContain(ja.delivery.title(view.name));
    expect(q('[data-delivery-on-time]')?.textContent).toContain(view.onTime ? ja.delivery.onTime : ja.delivery.late);
    expect(q('[data-delivery-reputation]')?.textContent).toContain(ja.delivery.reputation(view.reputation));
    // 利益の式（売上から費用を引いて利益）と、人日で割る式、評判の理由、次に直す場所
    expect(q('[data-line="revenue"]')).not.toBeNull();
    expect(q('[data-line="profit"]')?.textContent).toContain(ja.score.yen(view.profit));
    expect(q('[data-formula]')?.textContent).toContain('人日');
    expect(q('[data-reputation-why]')).not.toBeNull();
    expect(q('[data-weakest]')).not.toBeNull();
    // 品質が低ければ、色だけでなくアイコンとラベルでも示す
    const low = mount(() => (
      <DeliveryModal delivery={{ ...view, quality: 0.4, qualityGood: false }} onReview={() => {}} onNext={() => {}} />
    ));
    expect(low('[data-delivery-quality="low"]')?.textContent).toContain(ja.delivery.qualityLow);
    expect(document.activeElement?.hasAttribute('data-next')).toBe(true);
    q<HTMLButtonElement>('[data-review]')?.click();
    expect(onReview).toHaveBeenCalledOnce();
    q<HTMLButtonElement>('[data-next]')?.click();
    expect(onNext).toHaveBeenCalledOnce();
  });
});
