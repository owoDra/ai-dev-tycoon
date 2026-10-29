import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { Caption } from '../components/Caption';
import { Icon, type IconName } from '../components/Icon';
import { pop } from '../components/pop';
import { Shot } from '../components/Shot';
import { color } from '../theme';

const parts: readonly [IconName, string][] = [
  ['skill', 'Skill'],
  ['hook', 'Hook'],
  ['eval', 'Eval'],
  ['subagent', 'Subagent'],
  ['tool', 'MCP'],
  ['permission', '権限'],
];

/** Harness Builder：Claude Code と同じ部品で AI の「仕組み」を組み、ミスを途中で止める */
export const Harness = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Shot
        name="harness-empty"
        fadeTo="harness"
        from={{ x: 0.5, y: 0.62, zoom: 1.15 }}
        to={{ x: 0.5, y: 0.8, zoom: 1.6 }}
      />
      <Caption label="AI の仕組み" sub="Claude Code と同じ部品で、AIのミスを途中で止める">
        AIに<span style={{ color: color.primary }}>「仕組み」</span>を付けて強くする
      </Caption>
      <Sequence from={30}>
        <div
          style={{
            position: 'absolute',
            right: 70,
            top: 72,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, auto)',
            gap: 16,
          }}
        >
          {parts.map(([icon, label], i) => {
            const p = pop(frame - 30, i * 5);
            return (
              <div
                key={label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  width: 150,
                  padding: '14px 0 10px',
                  background: color.surface,
                  border: `5px solid ${color.ink}`,
                  borderRadius: 24,
                  boxShadow: `0 7px 0 ${color.ink}`,
                  fontSize: 28,
                  fontWeight: 900,
                  transform: `scale(${p.scale})`,
                  opacity: p.opacity,
                }}
              >
                <Icon name={icon} size={64} />
                {label}
              </div>
            );
          })}
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
