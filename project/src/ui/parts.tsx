import type { JSX } from 'solid-js';
import type { IconName } from '../assets/icons';
import type { AssignModeId } from '../content/types';
import { ja } from '../i18n/ja';
import type { TaskStatusView } from '../view/project';
import type { EntityKind } from '../view/world';
import { Icon } from './Icon';

/** 共通の見た目（D1 キャンディポップ：太い輪郭と押し込める影） */
export const panel = 'rounded-lg border-[3px] border-line bg-surface text-ink shadow-pop';
/** 主要な操作（44px 以上） */
export const primaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border-[3px] border-line bg-accent-400 px-4 font-heading text-on-accent shadow-pop transition-transform active:translate-y-1 active:shadow-none';
export const ghostButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border-[3px] border-line bg-surface px-3 font-bold text-ink hover:bg-sunken';
/** 補助の操作（24px 以上） */
export const smallButton = 'inline-flex min-h-6 items-center px-1 text-xs font-bold text-ink-muted underline';

export const modeIcon: Record<AssignModeId, IconName> = {
  human: 'human',
  ai: 'ai',
  aiThenHumanReview: 'review',
  aiThenEval: 'eval',
  humanThenAi: 'handoff',
  agentWorkflow: 'workflow',
};

export const kindIcon: Record<EntityKind, IconName> = {
  island: 'workflow',
  human: 'human',
  agent: 'ai',
  packet: 'project',
};

/** 状態を色だけでなく形でも示す小さなアイコン（ラベルの文字と並べて使う） */
export function StatusIcon(props: { status: TaskStatusView; class?: string }) {
  const shapes: Record<TaskStatusView, () => JSX.Element> = {
    unassigned: () => <circle cx="8" cy="8" r="5" class="fill-none stroke-ink-muted" stroke-width="2" />,
    waiting: () => <circle cx="8" cy="8" r="5" class="fill-ink-muted" />,
    queued: () => <path d="M3 4h10M3 8h10M3 12h10" class="stroke-warning-600" stroke-width="2" />,
    running: () => <path d="M4 2.5v11l9-5.5z" class="fill-primary-500" />,
    done: () => <path d="M3 8.5l3 3 7-7" class="fill-none stroke-success-600" stroke-width="2.5" />,
    defect: () => (
      <path d="M8 2l6.5 12h-13zM8 6.5v3.5M8 11.5v1" class="fill-none stroke-danger-600" stroke-width="1.8" />
    ),
  };
  return (
    <svg viewBox="0 0 16 16" class={`size-4 shrink-0 ${props.class ?? ''}`} aria-hidden="true">
      {shapes[props.status]()}
    </svg>
  );
}

export function PlayPauseIcon(props: { paused: boolean }) {
  return (
    <svg viewBox="0 0 16 16" class="size-4 fill-current" aria-hidden="true">
      <path d={props.paused ? 'M4 2.5v11l9-5.5z' : 'M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z'} />
    </svg>
  );
}

/** 設定（歯車）。アイコンセットにない UI 専用の記号なので、ここで描く */
export function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" class="size-6" aria-hidden="true">
      <path
        d="M12 2.5l1.6 2.3 2.7-.8.6 2.8 2.8.6-.8 2.7 2.3 1.6-2.3 1.6.8 2.7-2.8.6-.6 2.8-2.7-.8L12 21.5l-1.6-2.3-2.7.8-.6-2.8-2.8-.6.8-2.7L2.5 12l2.3-1.6-.8-2.7 2.8-.6.6-2.8 2.7.8z"
        class="fill-surface stroke-line"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <circle cx="12" cy="12" r="3.4" class="fill-accent-400 stroke-line" stroke-width="2" />
    </svg>
  );
}

/** 設定を開くボタン（44px 四方） */
export const iconButton =
  'flex size-11 items-center justify-center rounded-md border-[3px] border-line bg-surface shadow-pop transition-transform active:translate-y-1 active:shadow-none';

/** 0〜1 の割合を示す棒。棒は見た目だけで、読み上げには label を文字で渡す */
export function Meter(props: { ratio: number; label: string; color: string; class?: string }) {
  return (
    <>
      <span
        class={`relative block h-2.5 overflow-hidden rounded-full border-2 border-line bg-sunken ${props.class ?? 'w-20'}`}
        aria-hidden="true"
      >
        <span
          class={`absolute inset-y-0 left-0 ${props.color} transition-[width]`}
          style={{ width: `${Math.round(props.ratio * 100)}%` }}
        />
      </span>
      <span class="sr-only">{props.label}</span>
    </>
  );
}

/**
 * 解放したがまだ開いていない・使っていない機能の印（「NEW」）。色だけに頼らず、アイコンとラベルで示す。
 * 置き場所（ボタンの角など）は class で渡す
 */
export function NewBadge(props: { class?: string }) {
  return (
    <span
      data-new-badge
      class={`pointer-events-none flex items-center gap-0.5 rounded-full border-2 border-line bg-danger-500 px-1 font-heading text-[10px] leading-none text-ink ${props.class ?? ''}`}
    >
      <Icon name="sparkle" tone="mono" class="text-[10px]" />
      {ja.unlocks.badge}
    </span>
  );
}
