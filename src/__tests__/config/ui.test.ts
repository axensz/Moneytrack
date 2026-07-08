import { describe, expect, it } from 'vitest';
import {
  ACTION_ICONS,
  NAV_TABS,
  SECTION_LABELS,
  UI_TEXT,
  VIEW_SHORTCUTS,
  navTabLabel,
  sectionTitle,
} from '../../config/ui';

describe('UI configuration', () => {
  it('keeps navigation labels tied to the section registry', () => {
    for (const tab of NAV_TABS) {
      expect(tab.label).toBe(SECTION_LABELS[tab.key].nav);
      expect(navTabLabel(tab.key)).toBe(SECTION_LABELS[tab.key].nav);
      expect(sectionTitle(tab.key)).toBe(SECTION_LABELS[tab.key].title);
    }
  });

  it('keeps view shortcuts in the accepted keyboard order', () => {
    expect(VIEW_SHORTCUTS.map(({ key, view, description }) => [key, view, description])).toEqual([
      ['1', 'transactions', 'Ir a Transacciones'],
      ['2', 'accounts', 'Ir a Cuentas'],
      ['3', 'recurring', 'Ir a Pagos periódicos'],
      ['4', 'debts', 'Ir a Préstamos y deudas'],
      ['5', 'budgets', 'Ir a Presupuestos'],
      ['6', 'goals', 'Ir a Metas de ahorro'],
      ['7', 'stats', 'Ir a Estadísticas'],
      ['8', 'financial-plan', 'Ir a Plan financiero'],
    ]);
  });

  it('defines common labels and icons for repeated actions', () => {
    expect(UI_TEXT.actions.cancel).toBe('Cancelar');
    expect(UI_TEXT.actions.delete).toBe('Eliminar');
    expect(UI_TEXT.titles.newTransaction).toBe('Nueva transacción');
    expect(ACTION_ICONS.new).toBeDefined();
    expect(ACTION_ICONS.edit).toBeDefined();
    expect(ACTION_ICONS.delete).toBeDefined();
  });
});
