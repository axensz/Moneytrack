import { describe, it, expect, beforeEach } from 'vitest';
import {
  setGeminiApiKey,
  getGeminiApiKey,
  isGeminiKeyConfigured,
  isAiEnabled,
  getGeminiClient,
} from '../../lib/geminiClient';
import { setAiConsent, hasAiConsent } from '../../lib/aiConsent';

const LONG_KEY = 'AIzaSyAOFAKEKEY1234567890abcdefABCDEF';

describe('geminiClient (BYOK)', () => {
  beforeEach(() => {
    setGeminiApiKey(''); // resetear entre tests
    setAiConsent(false); // consentimiento off por defecto (S4)
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
    setAiConsent(true);
    expect(() => getGeminiClient()).toThrow(/API key/i);
  });

  it('returns a client and caches it for the same key', () => {
    setGeminiApiKey(LONG_KEY);
    setAiConsent(true);
    const a = getGeminiClient();
    const b = getGeminiClient();
    expect(a).toBe(b); // mismo cliente cacheado
  });

  it('recreates the client when the key changes', () => {
    setGeminiApiKey(LONG_KEY);
    setAiConsent(true);
    const a = getGeminiClient();
    setGeminiApiKey(`${LONG_KEY}-different`);
    const b = getGeminiClient();
    expect(a).not.toBe(b);
  });
});

describe('consent gate (S4)', () => {
  beforeEach(() => {
    setGeminiApiKey('');
    setAiConsent(false);
  });

  it('hasAiConsent is false by default', () => {
    expect(hasAiConsent()).toBe(false);
  });

  it('isAiEnabled requires BOTH a key and consent', () => {
    expect(isAiEnabled()).toBe(false);

    setGeminiApiKey(LONG_KEY);
    expect(isAiEnabled()).toBe(false); // key pero sin consentimiento

    setAiConsent(true);
    expect(isAiEnabled()).toBe(true); // key + consentimiento

    setGeminiApiKey('');
    expect(isAiEnabled()).toBe(false); // consentimiento pero sin key
  });

  it('getGeminiClient throws (no data leaves) when key is set but consent is off', () => {
    setGeminiApiKey(LONG_KEY);
    setAiConsent(false);
    expect(() => getGeminiClient()).toThrow(/autoriza/i);
  });

  it('getGeminiClient succeeds once consent is granted', () => {
    setGeminiApiKey(LONG_KEY);
    setAiConsent(true);
    expect(() => getGeminiClient()).not.toThrow();
  });
});
