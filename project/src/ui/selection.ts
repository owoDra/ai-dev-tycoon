import { type Accessor, createSignal } from 'solid-js';
import type { SelectEntity } from '../world/picking';

export interface Selection {
  readonly selected: Accessor<string | null>;
  dispatch(command: SelectEntity): void;
}

/** ワールドで選択しているもの。UI 側の state で、core の GameState には入れない */
export function createSelection(): Selection {
  const [selected, setSelected] = createSignal<string | null>(null);
  return {
    selected,
    dispatch(command) {
      setSelected(command.entityId);
    },
  };
}
