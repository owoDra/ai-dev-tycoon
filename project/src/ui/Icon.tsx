import { Show } from 'solid-js';
import { type IconName, type IconTone, iconSvg, iconTones } from '../assets/icons';

/**
 * SVG アイコン。大きさは文字サイズ（1em）に合わせる。label を渡すと読み上げ対象（role="img"）になり、
 * 渡さなければ装飾として読み上げから外す。状態を伝えるときは色だけに頼らず、ラベルの文字も並べること。
 */
export function Icon(props: { name: IconName; tone?: IconTone; label?: string; class?: string }) {
  const cls = () => (props.class ? `icon ${props.class}` : 'icon');
  const tone = () => props.tone ?? iconTones[props.name];
  return (
    <Show
      when={props.label}
      fallback={<span class={cls()} data-tone={tone()} aria-hidden="true" innerHTML={iconSvg(props.name)} />}
    >
      {(label) => (
        <span class={cls()} data-tone={tone()} role="img" aria-label={label()} innerHTML={iconSvg(props.name)} />
      )}
    </Show>
  );
}
