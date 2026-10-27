import { describe, expect, it } from 'vitest';
import { encodeResultCode, type ResultRecord } from '../../src/core/resultCode';
import { resultRecord } from '../../src/view/result';
import { playConfigured } from '../helpers/configured';
import { playProject, strategies } from '../helpers/strategies';

const SEED = 'PARTY-2026-01';
const P = 'corporateSite';

function codeOf(state: Parameters<typeof resultRecord>[0]): string {
  return encodeResultCode(resultRecord(state, P) as ResultRecord);
}

describe('結果コードの再現性', () => {
  it('同じ seed・同じ Command 列なら、結果コードが一致する', () => {
    const a = playProject(P, strategies.smart(P), SEED);
    const b = playProject(P, strategies.smart(P), SEED);
    expect(codeOf(b.state)).toBe(codeOf(a.state));
  });

  it('同じ seed でも、構成が違えば結果コードが変わる', () => {
    const human = playProject(P, strategies.allHuman(P), SEED);
    const evalAi = playConfigured({ projectId: P, mode: 'aiThenHumanReview', parts: ['evalAcceptance'] }, SEED);
    expect(codeOf(evalAi.state)).not.toBe(codeOf(human.state));
  });

  it('seed が違えば、同じ構成でも結果（事件・成否）が変わりうる', () => {
    const codes = new Set(
      ['PARTY-2026-01', 'PARTY-2026-02', 'PARTY-2026-03', 'PARTY-2026-04'].map((seed) =>
        codeOf(playConfigured({ projectId: P, mode: 'ai' }, seed).state),
      ),
    );
    expect(codes.size).toBeGreaterThan(1);
  });
});
