import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const theme = readFileSync(resolve(root, 'app/styles/theme.css'), 'utf8');
const debtCard = readFileSync(resolve(root, 'src/components/views/debts/components/DebtCard.tsx'), 'utf8');
const transactionForm = readFileSync(resolve(root, 'src/components/shared/TransactionForm.tsx'), 'utf8');
const offlineIndicator = readFileSync(resolve(root, 'src/components/pwa/OfflineIndicator.tsx'), 'utf8');

function cssBlock(selector: ':root' | '.dark') {
  const match = theme.match(new RegExp(`\\${selector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`No se encontró ${selector} en theme.css`);
  return match[1];
}

function token(block: string, name: string) {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`No se encontró --${name}`);
  return match[1];
}

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map(value => parseInt(value, 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

describe('contratos cerrados de contraste desktop', () => {
  it.each([
    ['muted-foreground', 'card'],
    ['warning', 'warning-muted'],
    ['success', 'success-muted'],
    ['destructive', 'destructive-muted'],
    ['primary-foreground', 'primary-solid'],
  ])('%s sobre %s cumple AA en claro y oscuro', (foreground, background) => {
    for (const mode of [cssBlock(':root'), cssBlock('.dark')]) {
      expect(contrast(token(mode, foreground), token(mode, background))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('DebtCard usa solo los reemplazos semánticos inventariados', () => {
    expect(debtCard).toContain('text-muted-foreground');
    expect(debtCard.match(/className=\{`btn-type/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(debtCard.match(/'btn-type-inactive'/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(debtCard).toContain("'btn-type-active-success'");
    expect(debtCard).toContain("'btn-type-active-destructive'");
    expect(debtCard).toContain('text-muted-foreground hover:text-foreground');

    expect(debtCard).not.toContain('text-gray-400 dark:text-gray-500');
    expect(debtCard).not.toContain('bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400');
    expect(debtCard).not.toContain('bg-green-500 text-white');
    expect(debtCard).not.toContain('bg-red-500 text-white');
    expect(debtCard).not.toContain('text-gray-400 hover:text-gray-600');
  });

  it('TransactionForm aplica warning y marca solo en las filas aprobadas', () => {
    expect(transactionForm).toContain('text-xs text-warning mt-1');
    expect(transactionForm).toContain("officialTrmError ? 'text-warning'");
    expect(transactionForm).toContain('text-xs text-warning bg-warning-muted p-2 rounded-lg');
    expect(transactionForm).toContain('ml-2 text-warning italic');
    expect(transactionForm).toContain('bg-warning-muted text-warning border border-warning');
    expect(transactionForm).toContain('text-xs font-medium text-warning hover:opacity-80');
    expect(transactionForm).toContain('bg-primary-solid text-primary-foreground');

    expect(transactionForm).not.toContain('text-xs text-amber-600 dark:text-amber-400 mt-1');
    expect(transactionForm).not.toContain("officialTrmError ? 'text-amber-600 dark:text-amber-400'");
    expect(transactionForm).not.toContain('text-xs text-amber-700 dark:text-amber-300 bg-amber-100/50 dark:bg-amber-900/30 p-2 rounded-lg');
    expect(transactionForm).not.toContain('ml-2 text-amber-500 dark:text-amber-500 italic');
    expect(transactionForm).not.toContain('bg-amber-600 text-white hover:bg-amber-700');
    expect(transactionForm).not.toContain('bg-amber-500 text-white shadow-sm');
  });

  it('OfflineIndicator usa el par warning verificado', () => {
    expect(offlineIndicator).toContain('bg-warning-muted text-warning border-b border-warning');
    expect(offlineIndicator).not.toContain('bg-amber-500 text-white');
  });

  it('preserva badges y acciones de DebtCard fuera del inventario', () => {
    expect(debtCard).toContain('bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300');
    expect(debtCard).toContain('bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300');
    expect(debtCard).toContain('text-sky-600 dark:text-sky-400');
    expect(debtCard).toContain('text-purple-600 dark:text-purple-400');
    expect(debtCard).toContain('text-green-600 dark:text-green-400');
    expect(debtCard).toContain('text-amber-600 dark:text-amber-400');
    expect(debtCard).toContain('hover:bg-destructive-muted text-destructive');
  });
});
