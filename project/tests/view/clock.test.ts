import { describe, expect, it } from 'vitest';
import { clockView } from '../../src/view/clock';

describe('clockView', () => {
  it.each([
    [0, 1, '00:00'],
    [59, 1, '00:59'],
    [61, 1, '01:01'],
    [1_439, 1, '23:59'],
    [1_440, 2, '00:00'],
    [1_440 * 3 + 9 * 60 + 5.7, 4, '09:05'],
  ])('%s 分 → %s日目 %s', (clock, day, time) => {
    expect(clockView(clock)).toEqual({ day, time });
  });
});
