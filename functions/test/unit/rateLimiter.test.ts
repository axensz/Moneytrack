import { describe, it, expect } from 'vitest';
import { defaultBudgetResolver } from '../../src/notifications/rateLimiter.js';

describe('defaultBudgetResolver', () => {
  it('applies 10/hour for register per user', () => {
    expect(defaultBudgetResolver('register:u1')).toEqual({ limit: 10, windowMs: 3_600_000 });
  });
  it('applies 5/hour for register per device', () => {
    expect(defaultBudgetResolver('register-device:dev-a')).toEqual({ limit: 5, windowMs: 3_600_000 });
  });
  it('applies 1/minute for test per device', () => {
    expect(defaultBudgetResolver('test:dev-a')).toEqual({ limit: 1, windowMs: 60_000 });
  });
  it('falls back to a conservative default', () => {
    expect(defaultBudgetResolver('other:x')).toEqual({ limit: 30, windowMs: 3_600_000 });
  });
});

import { buildBudgetEventTag } from '../../src/notifications/tags.js';

describe('buildBudgetEventTag', () => {
  it('is deterministic per (event, device) and short', () => {
    const a = buildBudgetEventTag('recurring:rent:2026-08', 'dev-a');
    expect(a).toBe(buildBudgetEventTag('recurring:rent:2026-08', 'dev-a'));
    expect(a).toMatch(/^mt-[0-9a-f]{24}$/);
  });
  it('differs across devices and events', () => {
    expect(buildBudgetEventTag('e1', 'dev-a')).not.toBe(buildBudgetEventTag('e1', 'dev-b'));
    expect(buildBudgetEventTag('e1', 'dev-a')).not.toBe(buildBudgetEventTag('e2', 'dev-a'));
  });
});
