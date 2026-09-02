import { describe, expect, it } from 'vitest';
import type { Account } from '../../types/finance';
import type { CreditAuthorityState } from '../../utils/creditAuthority';
import { getAccountBalancePresentation } from '../../components/views/accounts/utils/accountBalancePresentation';

const mockFormatCurrency = (amount: number) => `$ ${amount.toLocaleString('es-CO')}`;

const readyCreditAuthority: CreditAuthorityState = {
  ready: true,
  status: 'ready',
  usedCredit: 0,
};

const unreconciledCreditAuthority: CreditAuthorityState = {
  ready: false,
  status: 'missing',
  usedCredit: null,
};

describe('accountBalancePresentation (The Confident Ledger)', () => {
  describe('Cuentas de Ahorros y Efectivo', () => {
    const savingsAccount: Account = {
      id: 'acc-savings',
      name: 'Ahorros Bancolombia',
      type: 'savings',
      isDefault: false,
      initialBalance: 1_000_000,
    };

    it('saldo positivo se presenta con tono success (verde)', () => {
      const result = getAccountBalancePresentation({
        account: savingsAccount,
        balance: 500_000,
        creditUsed: 0,
        creditAuthority: readyCreditAuthority,
        balanceSettling: false,
        hideBalances: false,
        formatCurrency: mockFormatCurrency,
      });

      expect(result.tone).toBe('success');
      expect(result.toneClass).toBe('text-success');
      expect(result.formattedAmount).toBe('$ 500.000');
      expect(result.isSettling).toBe(false);
    });

    it('saldo en cero exacto se presenta con tono neutral (no verde de éxito)', () => {
      const result = getAccountBalancePresentation({
        account: savingsAccount,
        balance: 0,
        creditUsed: 0,
        creditAuthority: readyCreditAuthority,
        balanceSettling: false,
        hideBalances: false,
        formatCurrency: mockFormatCurrency,
      });

      expect(result.tone).toBe('neutral');
      expect(result.toneClass).toBe('text-foreground');
      expect(result.formattedAmount).toBe('$ 0');
    });

    it('saldo negativo (sobregiro) se presenta con tono destructive (rojo)', () => {
      const result = getAccountBalancePresentation({
        account: savingsAccount,
        balance: -150_000,
        creditUsed: 0,
        creditAuthority: readyCreditAuthority,
        balanceSettling: false,
        hideBalances: false,
        formatCurrency: mockFormatCurrency,
      });

      expect(result.tone).toBe('destructive');
      expect(result.toneClass).toBe('text-destructive');
      expect(result.formattedAmount).toBe('$ -150.000');
      expect(result.accessibleAmountLabel).toContain('sobregiro');
    });

    it('estado settling muestra mensaje de cálculo y tono muted', () => {
      const result = getAccountBalancePresentation({
        account: savingsAccount,
        balance: 500_000,
        creditUsed: 0,
        creditAuthority: readyCreditAuthority,
        balanceSettling: true,
        hideBalances: false,
        formatCurrency: mockFormatCurrency,
      });

      expect(result.isSettling).toBe(true);
      expect(result.tone).toBe('muted');
      expect(result.toneClass).toBe('text-muted-foreground');
      expect(result.formattedAmount).toBe('Calculando…');
    });
  });

  describe('Tarjetas de Crédito', () => {
    const creditAccount: Account = {
      id: 'acc-credit',
      name: 'Tarjeta Visa',
      type: 'credit',
      isDefault: false,
      initialBalance: 0,
      creditLimit: 5_000_000,
    };

    it('tarjeta no conciliada muestra Por conciliar con tono warning', () => {
      const result = getAccountBalancePresentation({
        account: creditAccount,
        balance: 5_000_000,
        creditUsed: 0,
        creditAuthority: unreconciledCreditAuthority,
        balanceSettling: false,
        hideBalances: false,
        formatCurrency: mockFormatCurrency,
      });

      expect(result.isUnreconciled).toBe(true);
      expect(result.tone).toBe('warning');
      expect(result.toneClass).toBe('text-warning');
      expect(result.formattedAmount).toBe('Por conciliar');
      expect(result.primaryLabel).toBe('Disponible');
    });

    it('tarjeta con uso normal (<80%) muestra tono success y barra primary', () => {
      const result = getAccountBalancePresentation({
        account: creditAccount,
        balance: 4_000_000,
        creditUsed: 1_000_000,
        creditAuthority: readyCreditAuthority,
        balanceSettling: false,
        hideBalances: false,
        formatCurrency: mockFormatCurrency,
      });

      expect(result.tone).toBe('success');
      expect(result.toneClass).toBe('text-success');
      expect(result.formattedAmount).toBe('$ 4.000.000');
      expect(result.credit?.usagePercentage).toBe(20);
      expect(result.credit?.progressBarTone).toBe('primary');
      expect(result.credit?.progressBarWidth).toBe('20%');
    });

    it('tarjeta con uso alto (>80%) muestra tono warning y barra warning', () => {
      const result = getAccountBalancePresentation({
        account: creditAccount,
        balance: 500_000,
        creditUsed: 4_500_000,
        creditAuthority: readyCreditAuthority,
        balanceSettling: false,
        hideBalances: false,
        formatCurrency: mockFormatCurrency,
      });

      expect(result.tone).toBe('warning');
      expect(result.toneClass).toBe('text-warning');
      expect(result.credit?.isHighUsage).toBe(true);
      expect(result.credit?.progressBarTone).toBe('warning');
      expect(result.credit?.progressBarWidth).toBe('90%');
    });

    it('tarjeta con cupo agotado ($0 disponible) muestra tono warning, NO verde de éxito', () => {
      const result = getAccountBalancePresentation({
        account: creditAccount,
        balance: 0,
        creditUsed: 5_000_000,
        creditAuthority: readyCreditAuthority,
        balanceSettling: false,
        hideBalances: false,
        formatCurrency: mockFormatCurrency,
      });

      expect(result.tone).toBe('warning');
      expect(result.toneClass).toBe('text-warning');
      expect(result.credit?.isExhausted).toBe(true);
      expect(result.credit?.progressBarTone).toBe('warning');
      expect(result.credit?.progressBarWidth).toBe('100%');
    });

    it('tarjeta en sobrecupo (usado > límite) muestra tono destructive y barra destructive', () => {
      const result = getAccountBalancePresentation({
        account: creditAccount,
        balance: 0,
        creditUsed: 5_500_000,
        creditAuthority: readyCreditAuthority,
        balanceSettling: false,
        hideBalances: false,
        formatCurrency: mockFormatCurrency,
      });

      expect(result.tone).toBe('destructive');
      expect(result.toneClass).toBe('text-destructive');
      expect(result.credit?.isOverLimit).toBe(true);
      expect(result.credit?.progressBarTone).toBe('destructive');
      expect(result.credit?.progressBarWidth).toBe('100%');
      expect(result.accessibleAmountLabel).toContain('Sobrecupo');
    });

    it('tolerancia ante creditLimit indefinido sin generar NaN', () => {
      const cardWithoutLimit: Account = {
        ...creditAccount,
        creditLimit: undefined,
      };

      const result = getAccountBalancePresentation({
        account: cardWithoutLimit,
        balance: 0,
        creditUsed: 0,
        creditAuthority: readyCreditAuthority,
        balanceSettling: false,
        hideBalances: false,
        formatCurrency: mockFormatCurrency,
      });

      expect(result.credit?.limitAmount).toBe(0);
      expect(result.credit?.formattedLimit).toBe('$ 0');
      expect(result.credit?.usagePercentage).toBe(0);
    });
  });

  describe('Modo Privacidad (hideBalances)', () => {
    it('enmascara los importes y fija la barra de progreso en 0%', () => {
      const creditAccount: Account = {
        id: 'acc-credit',
        name: 'Tarjeta Visa',
        type: 'credit',
        isDefault: false,
        initialBalance: 0,
        creditLimit: 5_000_000,
      };

      const result = getAccountBalancePresentation({
        account: creditAccount,
        balance: 1_000_000,
        creditUsed: 4_000_000,
        creditAuthority: readyCreditAuthority,
        balanceSettling: false,
        hideBalances: true,
        formatCurrency: mockFormatCurrency,
      });

      expect(result.formattedAmount).toBe('••••••');
      expect(result.credit?.formattedUsed).toBe('••••••');
      expect(result.credit?.formattedLimit).toBe('••••••');
      expect(result.credit?.progressBarWidth).toBe('0%');
      expect(result.accessibleAmountLabel).toContain('oculto por privacidad');
    });
  });
});
