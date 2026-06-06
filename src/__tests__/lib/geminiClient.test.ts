import { describe, it, expect, beforeEach } from 'vitest';
import {
  setGeminiApiKey,
  getGeminiApiKey,
  isGeminiKeyConfigured,
  getGeminiClient,
} from '../../lib/geminiClient';

const LONG_KEY = 'AIzaSyAOFAKEKEY1234567890abcdefABCDEF';

describe('geminiClient (BYOK)', () => {
  beforeEach(() => {
    setGeminiApiKey(''); // resetear entre tests
  });

  it('returns empty when no key set and no env fallback (test env)', () => {
    expect(getGeminiApiKey()).toBe('');
    expect(isGeminiKeyConfigured()).toBe(false);
  });

  it('stores and trims the user key', () => {
    setGeminiApiKey(`  ${LONG_KEY}  `);
    expect(getGeminiApiKey()).toBe(LONG_KEY);
    expect(isGeminiKeyConfigured()).toBe(true);
  });

  it('treats short/empty keys as not configured', () => {
    setGeminiApiKey('short');
    expect(isGeminiKeyConfigured()).toBe(false);
    setGeminiApiKey(null);
    expect(isGeminiKeyConfigured()).toBe(false);
  });

  it('throws from getGeminiClient when no key is configured', () => {
    expect(() => getGeminiClient()).toThrow(/API key/i);
  });

  it('returns a client and caches it for the same key', () => {
    setGeminiApiKey(LONG_KEY);
    const a = getGeminiClient();
    const b = getGeminiClient();
    expect(a).toBe(b); // mismo cliente cacheado
  });

  it('recreates the client when the key changes', () => {
    setGeminiApiKey(LONG_KEY);
    const a = getGeminiClient();
    setGeminiApiKey(`${LONG_KEY}-different`);
    const b = getGeminiClient();
    expect(a).not.toBe(b);
  });
});
