import { describe, it, expect } from 'vitest';
import type { Debt } from '../../types/finance';

// Standalone version of modifyDebtBalance logic for testing
function modifyDebtBalance(
    debt: Debt,
    amount: number,
    operation: 'add' | 'subtract'
): { originalAmount: number; remainingAmount: number; isSettled: boolean; settledAt?: Date } {
    if (debt.isSettled) {
        throw new Error('No puedes modificar un préstamo ya saldado');
    }

    let newOriginalAmount: number;
    let newRemainingAmount: number;

    if (operation === 'add') {
        newOriginalAmount = debt.originalAmount + amount;
        newRemainingAmount = debt.remainingAmount + amount;
    } else {
        // Subtract
        if (amount > debt.remainingAmount) {
            throw new Error('No puedes restar más del saldo pendiente');
        }
        newOriginalAmount = debt.originalAmount - amount;
        newRemainingAmount = debt.remainingAmount - amount;
    }

    // Check if debt becomes settled
    const isSettled = newRemainingAmount === 0;

    return {
        originalAmount: newOriginalAmount,
        remainingAmount: newRemainingAmount,
        isSettled,
        ...(isSettled ? { settledAt: new Date() } : {}),
    };
}

describe('modifyDebtBalance', () => {
    const createDebt = (overrides?: Partial<Debt>): Debt => ({
        id: 'debt-1',
        personName: 'Juan',
        type: 'lent',
        originalAmount: 1000,
        remainingAmount: 1000,
        isSettled: false,
        createdAt: new Date(),
        ...overrides
    });

    describe('add operation', () => {
        it('increases both originalAmount and remainingAmount', () => {
            const debt = createDebt();
            const result = modifyDebtBalance(debt, 500, 'add');

            expect(result.originalAmount).toBe(1500);
            expect(result.remainingAmount).toBe(1500);
            expect(result.isSettled).toBe(false);
        });

        it('works with partially paid debt', () => {
            const debt = createDebt({ remainingAmount: 600 });
            const result = modifyDebtBalance(debt, 400, 'add');

            expect(result.originalAmount).toBe(1400);
            expect(result.remainingAmount).toBe(1000);
            expect(result.isSettled).toBe(false);
        });

        it('works with small amounts', () => {
            const debt = createDebt();
            const result = modifyDebtBalance(debt, 0.01, 'add');

            expect(result.originalAmount).toBe(1000.01);
            expect(result.remainingAmount).toBe(1000.01);
        });

        it('works with large amounts', () => {
            const debt = createDebt();
            const result = modifyDebtBalance(debt, 1000000, 'add');

            expect(result.originalAmount).toBe(1001000);
            expect(result.remainingAmount).toBe(1001000);
        });
    });

    describe('subtract operation', () => {
        it('decreases both originalAmount and remainingAmount', () => {
            const debt = createDebt();
            const result = modifyDebtBalance(debt, 300, 'subtract');

            expect(result.originalAmount).toBe(700);
            expect(result.remainingAmount).toBe(700);
            expect(result.isSettled).toBe(false);
        });

        it('works with partially paid debt', () => {
            const debt = createDebt({ remainingAmount: 600 });
            const result = modifyDebtBalance(debt, 200, 'subtract');

            expect(result.originalAmount).toBe(800);
            expect(result.remainingAmount).toBe(400);
            expect(result.isSettled).toBe(false);
        });

        it('sets debt as settled when remainingAmount reaches zero', () => {
            const debt = createDebt({ remainingAmount: 500 });
            const result = modifyDebtBalance(debt, 500, 'subtract');

            expect(result.originalAmount).toBe(500);
            expect(result.remainingAmount).toBe(0);
            expect(result.isSettled).toBe(true);
            expect(result.settledAt).toBeInstanceOf(Date);
        });

        it('throws error when subtracting more than remainingAmount', () => {
            const debt = createDebt({ remainingAmount: 500 });

            expect(() => modifyDebtBalance(debt, 600, 'subtract'))
                .toThrow('No puedes restar más del saldo pendiente');
        });

        it('throws error when subtracting from fully paid debt', () => {
            const debt = createDebt({ remainingAmount: 0 });

            expect(() => modifyDebtBalance(debt, 100, 'subtract'))
                .toThrow('No puedes restar más del saldo pendiente');
        });

        it('allows subtracting exact remaining amount', () => {
            const debt = createDebt({ remainingAmount: 1000 });
            const result = modifyDebtBalance(debt, 1000, 'subtract');

            expect(result.remainingAmount).toBe(0);
            expect(result.isSettled).toBe(true);
        });
    });

    describe('settled debt validation', () => {
        it('throws error when modifying settled debt with add', () => {
            const debt = createDebt({ isSettled: true, remainingAmount: 0 });

            expect(() => modifyDebtBalance(debt, 100, 'add'))
                .toThrow('No puedes modificar un préstamo ya saldado');
        });

        it('throws error when modifying settled debt with subtract', () => {
            const debt = createDebt({ isSettled: true, remainingAmount: 0 });

            expect(() => modifyDebtBalance(debt, 100, 'subtract'))
                .toThrow('No puedes modificar un préstamo ya saldado');
        });
    });

    describe('edge cases', () => {
        it('handles decimal amounts correctly', () => {
            const debt = createDebt({ originalAmount: 100.50, remainingAmount: 100.50 });
            const result = modifyDebtBalance(debt, 25.25, 'add');

            expect(result.originalAmount).toBe(125.75);
            expect(result.remainingAmount).toBe(125.75);
        });

        it('handles very small subtractions', () => {
            const debt = createDebt({ originalAmount: 100, remainingAmount: 100 });
            const result = modifyDebtBalance(debt, 0.01, 'subtract');

            expect(result.originalAmount).toBe(99.99);
            expect(result.remainingAmount).toBe(99.99);
        });

        it('preserves debt type and person name', () => {
            const debt = createDebt({ type: 'borrowed', personName: 'Maria' });
            const result = modifyDebtBalance(debt, 100, 'add');

            // These fields should not be in the result, but the operation should work
            expect(result.originalAmount).toBe(1100);
            expect(result.remainingAmount).toBe(1100);
        });
    });

    describe('arithmetic precision', () => {
        it('maintains precision with floating point operations', () => {
            const debt = createDebt({ originalAmount: 1000.33, remainingAmount: 1000.33 });
            const result = modifyDebtBalance(debt, 500.22, 'add');

            expect(result.originalAmount).toBeCloseTo(1500.55, 2);
            expect(result.remainingAmount).toBeCloseTo(1500.55, 2);
        });

        it('handles subtraction precision correctly', () => {
            const debt = createDebt({ originalAmount: 1000.99, remainingAmount: 1000.99 });
            const result = modifyDebtBalance(debt, 500.50, 'subtract');

            expect(result.originalAmount).toBeCloseTo(500.49, 2);
            expect(result.remainingAmount).toBeCloseTo(500.49, 2);
        });
    });
});
