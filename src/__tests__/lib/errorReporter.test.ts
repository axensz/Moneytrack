import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  captureError,
  captureMessage,
  configureErrorReporter,
  installGlobalErrorHandlers,
  type ErrorReporter,
} from '../../lib/errorReporter';

// Reset internal reporter state between tests by re-importing via re-configure
function makeReporter() {
  const calls: { type: string; args: unknown[] }[] = [];
  const reporter: ErrorReporter = {
    captureError: (...args) => calls.push({ type: 'error', args }),
    captureMessage: (...args) => calls.push({ type: 'message', args }),
  };
  return { reporter, calls };
}

describe('errorReporter (S8)', () => {
  beforeEach(() => {
    // Reset to noop between tests
    configureErrorReporter({ captureError: () => {}, captureMessage: () => {} });
  });

  it('is a no-op by default (does not throw)', () => {
    expect(() => captureError(new Error('test'))).not.toThrow();
    expect(() => captureMessage('msg')).not.toThrow();
  });

  it('forwards captureError to configured reporter', () => {
    const { reporter, calls } = makeReporter();
    configureErrorReporter(reporter);

    const err = new Error('boom');
    captureError(err, { extra: 'data' });

    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe('error');
    expect(calls[0].args[0]).toBe(err);
    expect(calls[0].args[1]).toEqual({ extra: 'data' });
  });

  it('forwards captureMessage to configured reporter', () => {
    const { reporter, calls } = makeReporter();
    configureErrorReporter(reporter);

    captureMessage('hello', { key: 'val' });

    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe('message');
    expect(calls[0].args[0]).toBe('hello');
  });

  it('swallows errors thrown by the reporter itself', () => {
    configureErrorReporter({
      captureError: () => { throw new Error('reporter crashed'); },
      captureMessage: () => {},
    });
    // Should not propagate the reporter's own error
    expect(() => captureError(new Error('original'))).not.toThrow();
  });

  it('installGlobalErrorHandlers is idempotent', () => {
    // Calling twice should not double-register handlers
    expect(() => {
      installGlobalErrorHandlers();
      installGlobalErrorHandlers();
    }).not.toThrow();
  });
});
