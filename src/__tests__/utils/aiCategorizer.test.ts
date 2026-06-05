import { describe, it, expect } from 'vitest';
import { parseAICategorizationResponse } from '../../utils/aiCategorizer';

describe('parseAICategorizationResponse (Fase 5: Gemini fallback robusto)', () => {
  it('parses a clean JSON array of high-confidence suggestions', () => {
    const raw = '[{"i":0,"c":"Alimentación","conf":"high"},{"i":1,"c":"Transporte","conf":"high"}]';
    const result = parseAICategorizationResponse(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ index: 0, category: 'Alimentación' });
    expect(result[0].confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('tolerates markdown fences and surrounding prose', () => {
    const raw = 'Aquí están:\n```json\n[{"i":2,"c":"Salud","conf":"high"}]\n```\nListo.';
    const result = parseAICategorizationResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ index: 2, category: 'Salud' });
  });

  it('returns [] for invalid JSON (does not throw)', () => {
    expect(parseAICategorizationResponse('lo siento, no puedo ayudar')).toEqual([]);
    expect(parseAICategorizationResponse('')).toEqual([]);
    expect(parseAICategorizationResponse('[{bad json')).toEqual([]);
  });

  it('drops low-confidence suggestions', () => {
    const raw = '[{"i":0,"c":"Alimentación","conf":"low"}]';
    expect(parseAICategorizationResponse(raw)).toEqual([]);
  });

  it('drops categories that are not in the official list', () => {
    const raw = '[{"i":0,"c":"Categoria Inventada","conf":"high"}]';
    expect(parseAICategorizationResponse(raw)).toEqual([]);
  });

  it('supports numeric confidence and respects a custom threshold', () => {
    const raw = '[{"i":0,"c":"Transporte","confidence":0.6}]';
    expect(parseAICategorizationResponse(raw)).toEqual([]); // 0.6 < 0.75 por defecto
    expect(parseAICategorizationResponse(raw, 0.5)).toHaveLength(1); // umbral más bajo
  });
});
