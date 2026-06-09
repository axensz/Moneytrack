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

  it('redacts sensitive context fields before forwarding to the reporter (S-error-redact)', () => {
    const { reporter, calls } = makeReporter();
    configureErrorReporter(reporter);

    captureError(new Error('boom'), {
      accountId: 'acc-1',            // no sensible → se conserva
      amount: 1_500_000,             // sensible → redacted
      description: 'Pago secreto',   // sensible → redacted
      geminiApiKey: 'AIza-supersecret',
      nested: { declaredIncome: 9_000_000, type: 'expense' },
    });

    const ctx = calls[0].args[1] as Record<string, unknown>;
    expect(ctx.accountId).toBe('acc-1');
    expect(ctx.amount).toBe('[redacted]');
    expect(ctx.description).toBe('[redacted]');
    expect(ctx.geminiApiKey).toBe('[redacted]');
    expect((ctx.nested as Record<string, unknown>).declaredIncome).toBe('[redacted]');
    expect((ctx.nested as Record<string, unknown>).type).toBe('expense');
  });

  it('captureMessage also redacts sensitive context', () => {
    const { reporter, calls } = makeReporter();
    configureErrorReporter(reporter);

    captureMessage('plan guardado', { declaredIncome: 5_000_000, startMonth: '2026-06' });

    const ctx = calls[0].args[1] as Record<string, unknown>;
    expect(ctx.declaredIncome).toBe('[redacted]');
    expect(ctx.startMonth).toBe('2026-06');
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
