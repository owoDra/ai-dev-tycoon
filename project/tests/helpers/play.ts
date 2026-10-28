import type { GameStore } from '../../src/app/store';

/**
 * プレイヤーが「次の日へ」を押して、ゲームループが minutes だけ進めたことにする（進めている日がなければ押してから進める）。
 * 日の終わりを越える分は、その日の終わりで止まる
 */
export function playFor(store: GameStore, minutes: number): void {
  if (!store.run()) store.play(false);
  store.advance(minutes);
}
