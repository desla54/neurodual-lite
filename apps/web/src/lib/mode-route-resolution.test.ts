import { describe, expect, it } from 'bun:test';

import { getModeForRoute } from './mode-metadata';

describe('mode route resolution', () => {
  it('resolves unique dedicated routes back to their mode', () => {
    expect(getModeForRoute('/tower')).toBe('tower');
    expect(getModeForRoute('/gridlock')).toBe('gridlock');
    expect(getModeForRoute('/flanker')).toBe('flanker');
  });

  it('does not resolve ambiguous shared routes', () => {
    expect(getModeForRoute('/nback')).toBeUndefined();
  });
});
