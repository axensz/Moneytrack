import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useConfirmDiscard } from '../../hooks/useConfirmDiscard';

describe('useConfirmDiscard (S13)', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    confirmSpy = vi.spyOn(window, 'confirm');
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('calls onClose directly when form is not dirty', () => {
    const { result } = renderHook(() => useConfirmDiscard(false));
    const onClose = vi.fn();

    result.current.guardedClose(onClose);

    expect(onClose).toHaveBeenCalledOnce();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('asks for confirmation when form is dirty', () => {
    confirmSpy.mockReturnValue(true);
    const { result } = renderHook(() => useConfirmDiscard(true));
    const onClose = vi.fn();

    result.current.guardedClose(onClose);

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does NOT close when user cancels the confirm dialog', () => {
    confirmSpy.mockReturnValue(false);
    const { result } = renderHook(() => useConfirmDiscard(true));
    const onClose = vi.fn();

    result.current.guardedClose(onClose);

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reacts to isDirty changes between renders', () => {
    const { result, rerender } = renderHook(({ dirty }) => useConfirmDiscard(dirty), {
      initialProps: { dirty: false },
    });

    const onClose = vi.fn();

    // First call: not dirty — no confirm needed
    result.current.guardedClose(onClose);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    // Re-render with dirty = true
    confirmSpy.mockReturnValue(true);
    rerender({ dirty: true });
    result.current.guardedClose(onClose);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
