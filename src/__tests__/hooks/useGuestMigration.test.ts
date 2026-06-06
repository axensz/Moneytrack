import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock the migration util so the hook is tested in isolation (no Firestore).
vi.mock('../../utils/guestMigration', () => ({
  readGuestData: vi.fn(),
  countGuestData: vi.fn(),
  hasGuestData: vi.fn(),
  migrateGuestData: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { useGuestMigration } from '../../hooks/useGuestMigration';
import {
  readGuestData,
  countGuestData,
  hasGuestData,
  migrateGuestData,
} from '../../utils/guestMigration';

const COUNTS = {
  accounts: 1,
  transactions: 2,
  recurringPayments: 0,
  debts: 0,
  budgets: 0,
  savingsGoals: 0,
  total: 3,
};

describe('useGuestMigration (S1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (readGuestData as ReturnType<typeof vi.fn>).mockReturnValue({});
    (countGuestData as ReturnType<typeof vi.fn>).mockReturnValue(COUNTS);
  });

  it('does not prompt when there is no guest data', () => {
    (hasGuestData as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const { result } = renderHook(() => useGuestMigration('user-1'));
    expect(result.current.showPrompt).toBe(false);
  });

  it('does not prompt when logged out (userId null)', () => {
    (hasGuestData as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const { result } = renderHook(() => useGuestMigration(null));
    expect(result.current.showPrompt).toBe(false);
  });

  it('prompts with counts when guest data is detected on login', () => {
    (hasGuestData as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const { result } = renderHook(() => useGuestMigration('user-1'));
    expect(result.current.showPrompt).toBe(true);
    expect(result.current.counts).toEqual(COUNTS);
  });

  it('detects guest data only once per user', () => {
    (hasGuestData as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const { rerender } = renderHook(({ uid }) => useGuestMigration(uid), {
      initialProps: { uid: 'user-1' as string | null },
    });
    rerender({ uid: 'user-1' });
    rerender({ uid: 'user-1' });
    expect(readGuestData).toHaveBeenCalledTimes(1);
  });

  it('runMigration imports and closes the prompt on success', async () => {
    (hasGuestData as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (migrateGuestData as ReturnType<typeof vi.fn>).mockResolvedValue({
      migrated: true,
      counts: COUNTS,
      writeCount: 3,
    });

    const { result } = renderHook(() => useGuestMigration('user-1'));
    await act(async () => {
      await result.current.runMigration();
    });

    expect(migrateGuestData).toHaveBeenCalledWith('user-1');
    expect(result.current.showPrompt).toBe(false);
    expect(result.current.hasError).toBe(false);
  });

  it('runMigration surfaces an error and keeps the prompt open for retry', async () => {
    (hasGuestData as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (migrateGuestData as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useGuestMigration('user-1'));
    await act(async () => {
      await result.current.runMigration();
    });

    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.showPrompt).toBe(true);
  });

  it('dismiss closes the prompt without migrating', () => {
    (hasGuestData as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const { result } = renderHook(() => useGuestMigration('user-1'));
    expect(result.current.showPrompt).toBe(true);

    act(() => result.current.dismiss());

    expect(result.current.showPrompt).toBe(false);
    expect(migrateGuestData).not.toHaveBeenCalled();
  });
});
