import { describe, expect, it } from 'vitest';
import {
  extractLearningPattern,
  findLearnedCategory,
  groupImportRowsByPattern,
  upsertImportLearningRule,
} from '../../utils/importLearning';

describe('importLearning', () => {
  it('extracts a merchant-like pattern from noisy bank descriptions', () => {
    expect(extractLearningPattern('PAGO PSE OXXO EDS PORTAL DE NIQ')).toBe('oxxo');
    expect(extractLearningPattern('COMPRA POS SMART FIT 170')).toBe('smart fit');
  });

  it('finds a learned category only when it is still valid', () => {
    const rules = upsertImportLearningRule([], 'OXXO EDS PORTAL DE NIQ', 'Alimentación', new Date('2026-01-01T00:00:00Z'));

    expect(findLearnedCategory('COMPRA POS OXXO MEDELLIN', rules, ['Alimentación', 'Otros'])).toBe('Alimentación');
    expect(findLearnedCategory('COMPRA POS OXXO MEDELLIN', rules, ['Transporte', 'Otros'])).toBeNull();
  });

  it('updates an existing learned rule when the user corrects it again', () => {
    const first = upsertImportLearningRule([], 'OPENAI CHATGPT', 'Servicios', new Date('2026-01-01T00:00:00Z'));
    const second = upsertImportLearningRule(first, 'OPENAI CHATGPT', 'Educación', new Date('2026-01-02T00:00:00Z'));

    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      pattern: 'openai',
      category: 'Educación',
      useCount: 2,
      lastUsedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('groups candidate rows by extracted merchant pattern before AI categorization', () => {
    const groups = groupImportRowsByPattern([
      {
        index: 0,
        row: { description: 'COMPRA POS OXXO POBLADO', amount: 12000, type: 'expense', category: 'Otros' },
      },
      {
        index: 1,
        row: { description: 'PAGO PSE OXXO EDS PORTAL', amount: 18000, type: 'expense', category: 'Otros' },
      },
      {
        index: 2,
        row: { description: 'COMPRA POS SMART FIT', amount: 99000, type: 'expense', category: 'Otros' },
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ pattern: 'oxxo', indexes: [0, 1] });
    expect(groups[1]).toMatchObject({ pattern: 'smart fit', indexes: [2] });
  });

  it('NO aplica un patrón corto a descripciones no relacionadas (#15: match por palabra, no substring)', () => {
    const rules = upsertImportLearningRule([], 'COL', 'Servicios', new Date('2026-01-01T00:00:00Z'));
    // "col" como substring matchearía "colombia"/"escolar"; como palabra, no.
    expect(findLearnedCategory('COLOMBIA TELECOMUNICACIONES', rules)).toBeNull();
    expect(findLearnedCategory('COMPRA ESCOLAR', rules)).toBeNull();
  });

  it('sí aplica cuando el patrón aparece como palabra completa (#15)', () => {
    const rules = upsertImportLearningRule([], 'RAPPI PAGO MENSUAL', 'Alimentación', new Date('2026-01-01T00:00:00Z'));
    expect(findLearnedCategory('PAGO RAPPI DOMICILIO', rules)).toBe('Alimentación');
  });
});
