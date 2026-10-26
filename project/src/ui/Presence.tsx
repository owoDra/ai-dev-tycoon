import { type Accessor, createEffect, createSignal, type JSX, on, Show, untrack } from 'solid-js';
import { enter, exit, pop } from '../fx/motion';

/**
 * 出現と退場のトランジション（Framer Motion の AnimatePresence 相当）。
 * when が値を持つと中身を出して enter し、null / false になると、最後の値のまま exit してから取り除く。
 * 退場中の要素はクリックを素通りさせる（fx/motion.ts の exit）ので、後ろの操作は止まらない。
 * 退場中にまた値が来たら、そのまま出し直す。
 */
export function Presence<T>(props: {
  when: T | null | undefined | false;
  children: (value: Accessor<T>) => JSX.Element;
  from?: 'below' | 'above' | 'none';
  /** 出現のアニメーションを付けるか（中身が自分で出現を演出するときは false） */
  enter?: boolean;
  class?: string;
}) {
  const [shown, setShown] = createSignal<T | null>(props.when || null);
  let el: HTMLDivElement | undefined;
  let leaving = 0;

  createEffect(
    on(
      () => props.when,
      (value) => {
        if (value) {
          leaving++;
          if (el) el.style.pointerEvents = '';
          setShown(() => value);
          return;
        }
        if (untrack(shown) === null) return;
        const ticket = ++leaving;
        const target = el;
        const done = () => {
          if (ticket === leaving) setShown(null);
        };
        const leavingAnimation = target ? exit(target, props.from ?? 'below') : null;
        if (leavingAnimation) void leavingAnimation.then(done);
        else done();
      },
      { defer: true },
    ),
  );

  return (
    <Show when={shown()}>
      {(value) => (
        <div
          ref={(div) => {
            el = div;
            if (props.enter !== false) queueMicrotask(() => enter(div, props.from ?? 'below'));
          }}
          class={props.class}
        >
          {props.children(value as Accessor<T>)}
        </div>
      )}
    </Show>
  );
}

/**
 * 値が変わるたびに中身をぽんと弾ませるラッパー（`use:animate` の代わり）。数字やバッジの強調に使う
 */
export function Animated(props: { trigger: unknown; children: JSX.Element; class?: string }) {
  let el!: HTMLSpanElement;
  createEffect(
    on(
      () => props.trigger,
      () => pop(el),
      { defer: true },
    ),
  );
  return (
    <span ref={el} class={`inline-block ${props.class ?? ''}`}>
      {props.children}
    </span>
  );
}
