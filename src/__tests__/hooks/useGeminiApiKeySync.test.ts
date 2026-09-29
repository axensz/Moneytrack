import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGeminiApiKey } from '../../hooks/useGeminiApiKey';
import { getGeminiApiKey, setGeminiApiKey } from '../../lib/geminiClient';

const firestore = vi.hoisted(() => ({ onSnapshot: vi.fn() }));
vi.mock('../../lib/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('../../lib/firebaseDb', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: firestore.onSnapshot,
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteField: vi.fn(),
}));

type Snapshot = {
  data: () => { geminiApiKey?: string };
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
};

describe('Gemini key synchronization across devices', () => {
  let emit: (snapshot: Snapshot) => void;
  const key = 'synthetic-gemini-key-for-tests';

  beforeEach(() => {
    localStorage.clear();
    setGeminiApiKey('');
    firestore.onSnapshot.mockReset();
    firestore.onSnapshot.mockImplementation((...args: unknown[]) => {
      emit = args.find(arg => typeof arg === 'function') as typeof emit;
      return vi.fn();
    });
  });

  const snapshot = (geminiApiKey?: string, fromCache = false, hasPendingWrites = false): Snapshot => ({
    data: () => geminiApiKey === undefined ? {} : { geminiApiKey },
    metadata: { fromCache, hasPendingWrites },
  });

  it('clears the visible and effective key when another device removes it', () => {
    const { result } = renderHook(() => useGeminiApiKey('user-1'));
    act(() => emit(snapshot(key)));
    expect(result.current.isConfigured).toBe(true);

    act(() => emit(snapshot()));

    expect(result.current.apiKey).toBe('');
    expect(result.current.isConfigured).toBe(false);
    expect(getGeminiApiKey()).toBe('');
  });

  it('keeps a local key through unconfirmed empty snapshots, then accepts server deletion', () => {
    const { result } = renderHook(() => useGeminiApiKey('user-1'));
    act(() => result.current.saveApiKey(key));
    act(() => emit(snapshot(undefined, true)));
    act(() => emit(snapshot(undefined, false, true)));
    expect(result.current.apiKey).toBe(key);
    expect(getGeminiApiKey()).toBe(key);

    // Confirmation may change metadata only, so the subscription must request it.
    expect(firestore.onSnapshot.mock.calls[0][1]).toEqual({ includeMetadataChanges: true });
    act(() => emit(snapshot()));
    expect(result.current.apiKey).toBe('');
    expect(getGeminiApiKey()).toBe('');
  });
});
