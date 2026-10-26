import { createSignal, For, type JSX, Match, Show, Switch } from 'solid-js';
import { type TextureId, textureAssets } from '../../assets/catalog';
import { type IconTone, iconNames } from '../../assets/icons';
import { textureSrcset, textureUrl } from '../../assets/registry';
import { visual } from '../../content/look/visual';
import { ja } from '../../i18n/ja';
import { contrastRatio } from '../../styles/color';
import { colorScales, rootTokens, SCALE_STEPS, textScale, tokenContrastPairs } from '../../styles/tokens';
import { Icon } from '../../ui/Icon';
import { DeskViewer } from './DeskViewer';
import { ModelGallery } from './ModelGallery';

const t = ja.styleguide;

/**
 * スタイルガイド（開発用）。トークン・アイコン・WebP・デスクモデルを一覧する。
 * Tailwind のユーティリティはトークン（styles/tokens.css）の名前で書く。
 */
export function Styleguide() {
  return (
    <main class="min-h-screen bg-bg px-4 py-8 font-sans text-base text-ink sm:px-8">
      <div class="mx-auto flex max-w-6xl flex-col gap-10">
        <header class="flex flex-col gap-2">
          <h1 class="text-3xl font-heading tracking-heading">{t.title}</h1>
          <p class="text-ink-muted">{t.lead}</p>
        </header>
        <Colors />
        <Contrast />
        <TypeScale />
        <RadiusAndShadow />
        <Spacing />
        <Motion />
        <Icons />
        <Textures />
        <Model />
        <Characters />
      </div>
    </main>
  );
}

function Section(props: { title: string; children: JSX.Element }) {
  return (
    <section class="flex flex-col gap-4">
      <h2 class="text-2xl font-heading tracking-heading">{props.title}</h2>
      {props.children}
    </section>
  );
}

function Card(props: { class?: string; children: JSX.Element }) {
  return (
    <div class={`rounded-lg border-3 border-outline bg-surface p-4 shadow-pop ${props.class ?? ''}`}>
      {props.children}
    </div>
  );
}

function Colors() {
  const scales = colorScales(visual);
  const semantic = [
    'bg',
    'surface',
    'sunken',
    'line',
    'ink',
    'ink-muted',
    'success-soft',
    'warning-soft',
    'danger-soft',
  ];
  return (
    <>
      <Section title={t.sections.colors}>
        <Card class="flex flex-col gap-2 overflow-x-auto">
          <For each={Object.entries(scales)}>
            {([name, scale]) => (
              <div class="grid min-w-160 grid-cols-[6rem_repeat(10,1fr)] items-center gap-1">
                <span class="font-heading">{name}</span>
                <For each={SCALE_STEPS}>
                  {(step) => (
                    <div class="flex flex-col items-center gap-0.5">
                      <div
                        class="h-10 w-full rounded-sm border-2 border-outline"
                        style={{ background: `var(--color-${name}-${step})` }}
                        title={scale[step]}
                      />
                      <span class="text-sm text-ink-muted">{step}</span>
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </Card>
      </Section>
      <Section title={t.sections.semantic}>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <For each={semantic}>
            {(name) => (
              <div class="flex items-center gap-2 rounded-md border-3 border-outline bg-surface p-2">
                <div class="size-9 rounded-sm border-2 border-outline" style={{ background: `var(--color-${name})` }} />
                <code class="text-sm">{name}</code>
              </div>
            )}
          </For>
        </div>
      </Section>
    </>
  );
}

function Contrast() {
  return (
    <Section title={t.sections.contrast}>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <For each={Object.entries(tokenContrastPairs(visual))}>
          {([name, pair]) => {
            const ratio = contrastRatio(pair.fg, pair.bg);
            const ok = ratio >= pair.min;
            return (
              <div
                class="flex items-center justify-between gap-2 rounded-md border-3 border-outline px-3 py-2"
                style={{ background: pair.bg, color: pair.fg }}
              >
                <span class="font-heading">{name}</span>
                <span class="flex items-center gap-1 text-sm">
                  <Icon name={ok ? 'success' : 'failure'} tone="mono" />
                  {ratio.toFixed(2)}:1 {ok ? t.pass : t.fail}
                </span>
              </div>
            );
          }}
        </For>
      </div>
    </Section>
  );
}

function TypeScale() {
  return (
    <Section title={t.sections.type}>
      <Card class="flex flex-col gap-3">
        <For each={Object.entries(textScale(visual)).reverse()}>
          {([name, px]) => (
            <div class="flex items-baseline gap-4">
              <code class="w-24 shrink-0 text-sm text-ink-muted">
                {name} {px}px
              </code>
              <span class="truncate font-heading tracking-heading" style={{ 'font-size': `var(--text-${name})` }}>
                {t.typeSample}
              </span>
            </div>
          )}
        </For>
      </Card>
    </Section>
  );
}

function RadiusAndShadow() {
  const items = [
    ['rounded-sm shadow-pop', 'radius-sm / shadow-pop'],
    ['rounded-md shadow-pop', 'radius-md / shadow-pop'],
    ['rounded-lg shadow-raised', 'radius-lg / shadow-raised'],
    ['rounded-xl shadow-soft border-transparent', 'radius-xl / shadow-soft'],
  ] as const;
  return (
    <Section title={t.sections.radius}>
      <div class="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <For each={items}>
          {([cls, label]) => (
            <div class={`flex h-28 items-end border-3 border-outline bg-surface p-3 ${cls}`}>
              <code class="text-sm">{label}</code>
            </div>
          )}
        </For>
      </div>
    </Section>
  );
}

function Spacing() {
  const steps = [1, 2, 3, 4, 6, 8, 12, 16];
  return (
    <Section title={t.sections.spacing}>
      <Card class="flex flex-col gap-2">
        <For each={steps}>
          {(n) => (
            <div class="flex items-center gap-3">
              <code class="w-28 text-sm text-ink-muted">
                {n} = {n * visual.shape.spaceUnit}px
              </code>
              <div class="h-4 rounded-sm bg-primary-400" style={{ width: `calc(var(--spacing) * ${n})` }} />
            </div>
          )}
        </For>
      </Card>
    </Section>
  );
}

function Motion() {
  const [played, setPlayed] = createSignal(false);
  const durations = Object.entries(rootTokens(visual)).filter(([k]) => k.startsWith('--duration'));
  const easings = ['--ease-pop', '--ease-out', '--ease-in-out'];
  return (
    <Section title={t.sections.motion}>
      <Card class="flex flex-col gap-3">
        <button
          type="button"
          class="flex w-fit items-center gap-2 rounded-md border-3 border-outline bg-primary-500 px-4 py-2 font-heading text-on-primary shadow-pop active:translate-y-1 active:shadow-none"
          onClick={() => setPlayed((v) => !v)}
        >
          <Icon name="automation" tone="mono" />
          {t.play}
        </button>
        <For each={easings}>
          {(ease) => (
            <div class="flex items-center gap-3">
              <code class="w-28 text-sm text-ink-muted">{ease.slice(2)}</code>
              <div class="relative h-8 flex-1 rounded-sm bg-sunken">
                <div
                  class="absolute top-1 size-6 rounded-full border-3 border-outline bg-accent-500 motion-reduce:transition-none"
                  style={{
                    left: played() ? 'calc(100% - 1.75rem)' : '0.25rem',
                    transition: `left var(--duration-pop) var(${ease})`,
                  }}
                />
              </div>
            </div>
          )}
        </For>
        <div class="flex flex-wrap gap-3 text-sm text-ink-muted">
          <For each={durations}>
            {([k, v]) => (
              <code>
                {k.slice(2)}: {v}
              </code>
            )}
          </For>
        </div>
      </Card>
    </Section>
  );
}

function Icons() {
  const tones: IconTone[] = ['primary', 'accent', 'success', 'warning', 'danger', 'neutral'];
  return (
    <Section title={`${t.sections.icons}（${iconNames.length}）`}>
      <div class="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
        <For each={iconNames}>
          {(name) => (
            <div class="flex flex-col items-center gap-2 rounded-md border-3 border-outline bg-surface p-3">
              <Icon name={name} class="text-5xl" />
              <span class="flex items-center gap-1 text-sm">
                <Icon name={name} tone="mono" />
                {ja.icons[name]}
              </span>
              <code class="text-sm text-ink-muted">{name}</code>
            </div>
          )}
        </For>
      </div>
      <h3 class="text-xl font-heading">{t.sections.iconTones}</h3>
      <Card class="flex flex-wrap items-center gap-4">
        <For each={tones}>{(tone) => <Icon name="ai" tone={tone} class="text-4xl" />}</For>
        <span class="flex items-center gap-2 rounded-md border-3 border-outline bg-primary-500 px-3 py-1 font-heading text-on-primary">
          <Icon name="release" tone="mono" class="text-2xl" />
          {t.mono}
        </span>
        <span class="flex items-center gap-2 text-sm">
          <Icon name="warning" class="text-base" /> 16px
        </span>
      </Card>
    </Section>
  );
}

function Textures() {
  const ids = Object.keys(textureAssets) as TextureId[];
  return (
    <Section title={t.sections.textures}>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <For each={ids}>
          {(id) => {
            const asset = textureAssets[id];
            const tiled = asset.repeat;
            return (
              <Card class="flex flex-col gap-2">
                {tiled ? (
                  <div
                    class="h-48 rounded-md border-2 border-outline"
                    style={{ 'background-image': `url(${textureUrl(id)})`, 'background-size': '128px' }}
                  />
                ) : (
                  <img
                    src={textureUrl(id)}
                    srcset={textureSrcset(id)}
                    alt={t.textures[id]}
                    class="h-48 w-full rounded-md border-2 border-outline bg-sunken object-contain"
                    style={{ 'image-rendering': asset.nearest ? 'pixelated' : 'auto' }}
                  />
                )}
                <span class="font-heading">{t.textures[id]}</span>
                <code class="text-sm text-ink-muted">
                  {id} ({asset.scales.map((s) => `${s}x`).join(' / ')})
                </code>
              </Card>
            );
          }}
        </For>
      </div>
    </Section>
  );
}

function Model() {
  const [status, setStatus] = createSignal<'loading' | 'ready' | 'error'>('loading');
  return (
    <Section title={t.sections.model}>
      <Card class="flex flex-col gap-2">
        <DeskViewer label={t.sections.model} onStatus={setStatus} />
        <p class="flex items-center gap-2 text-sm" data-model-status={status()}>
          <Switch>
            <Match when={status() === 'loading'}>
              <Icon name="clock" /> {t.modelLoading}
            </Match>
            <Match when={status() === 'ready'}>
              <Icon name="success" /> desk.glb
            </Match>
            <Match when={status() === 'error'}>
              <Icon name="failure" /> {t.modelError}
            </Match>
          </Switch>
        </p>
      </Card>
    </Section>
  );
}

function Characters() {
  const [status, setStatus] = createSignal<'loading' | 'ready' | 'error'>('loading');
  return (
    <Section title={t.sections.characters}>
      <Card class="flex flex-col gap-2" data-model-status={status()}>
        <ModelGallery label={t.sections.characters} onStatus={setStatus} />
        <Show when={status() === 'error'}>
          <p class="flex items-center gap-2 text-sm">
            <Icon name="failure" /> {t.modelError}
          </p>
        </Show>
      </Card>
    </Section>
  );
}
