import { describe, it, expect, vi } from 'vitest';
import { withTimeout, TimeoutError } from '../../utils/withTimeout';

describe('withTimeout', () => {
  it('resolves when the promise settles before the timeout', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it('propagates the original rejection', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });

  it('rejects with TimeoutError when the promise never settles', async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<number>(() => {});
      const p = withTimeout(never, 100, 'test');
      const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
      await vi.advanceTimersByTimeAsync(100);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
