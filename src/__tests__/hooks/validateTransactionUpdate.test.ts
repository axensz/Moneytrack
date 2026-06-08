import { describe, it, expect } from 'vitest';
import { validateTransactionUpdate } from '../../utils/transactionValidation';

describe('validateTransactionUpdate', () => {
    describe('amount validation', () => {
        it('accepts valid positive number', () => {
            const result = validateTransactionUpdate({ amount: 100 });
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('rejects undefined amount', () => {
            const result = validateTransactionUpdate({ amount: undefined });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'amount',
                message: 'El monto es requerido'
            });
        });

        it('rejects null amount', () => {
            const result = validateTransactionUpdate({ amount: null as any });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'amount',
                message: 'El monto es requerido'
            });
        });

        it('rejects NaN amount', () => {
            const result = validateTransactionUpdate({ amount: NaN });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'amount',
                message: 'El monto debe ser un número válido'
            });
        });

        it('rejects zero amount', () => {
            const result = validateTransactionUpdate({ amount: 0 });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'amount',
                message: 'El monto debe ser mayor a 0'
            });
        });

        it('rejects negative amount', () => {
            const result = validateTransactionUpdate({ amount: -100 });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'amount',
                message: 'El monto debe ser mayor a 0'
            });
        });
    });

    describe('description validation', () => {
        it('accepts valid non-empty string', () => {
            const result = validateTransactionUpdate({ description: 'Test description' });
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('rejects undefined description', () => {
            const result = validateTransactionUpdate({ description: undefined });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'description',
                message: 'La descripción es requerida'
            });
        });

        it('rejects null description', () => {
            const result = validateTransactionUpdate({ description: null as any });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'description',
                message: 'La descripción es requerida'
            });
        });

        it('accepts empty string description', () => {
            const result = validateTransactionUpdate({ description: '' });
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('accepts whitespace-only description', () => {
            const result = validateTransactionUpdate({ description: '   ' });
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe('date validation', () => {
        it('accepts valid Date object', () => {
            const result = validateTransactionUpdate({ date: new Date('2024-01-01') });
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('rejects undefined date', () => {
            const result = validateTransactionUpdate({ date: undefined });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'date',
                message: 'La fecha es requerida'
            });
        });

        it('rejects null date', () => {
            const result = validateTransactionUpdate({ date: null as any });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'date',
                message: 'La fecha es requerida'
            });
        });

        it('rejects invalid Date object', () => {
            const result = validateTransactionUpdate({ date: new Date('invalid') });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'date',
                message: 'La fecha no es válida'
            });
        });

        it('rejects non-Date object', () => {
            const result = validateTransactionUpdate({ date: '2024-01-01' as any });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'date',
                message: 'La fecha debe ser un objeto Date válido'
            });
        });
    });

    describe('category validation', () => {
        it('accepts valid non-empty string', () => {
            const result = validateTransactionUpdate({ category: 'Alimentación' });
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('rejects undefined category', () => {
            const result = validateTransactionUpdate({ category: undefined });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'category',
                message: 'La categoría es requerida'
            });
        });

        it('rejects null category', () => {
            const result = validateTransactionUpdate({ category: null as any });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'category',
                message: 'La categoría es requerida'
            });
        });

        it('rejects empty string category', () => {
            const result = validateTransactionUpdate({ category: '' });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'category',
                message: 'La categoría no puede estar vacía'
            });
        });

        it('rejects whitespace-only category', () => {
            const result = validateTransactionUpdate({ category: '   ' });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual({
                field: 'category',
                message: 'La categoría no puede estar vacía'
            });
        });
    });

    describe('multiple field validation', () => {
        it('collects all errors when multiple fields are invalid', () => {
            const result = validateTransactionUpdate({
                amount: -100,
                description: '',
                date: new Date('invalid'),
                category: ''
            });

            // description:'' ya NO produce error (fix #17), así que solo hay 3 errores
            expect(result.isValid).toBe(false);
            expect(result.errors).toHaveLength(3);
            expect(result.errors.map(e => e.field)).toContain('amount');
            expect(result.errors.map(e => e.field)).not.toContain('description');
            expect(result.errors.map(e => e.field)).toContain('date');
            expect(result.errors.map(e => e.field)).toContain('category');
        });

        it('validates only provided fields', () => {
            const result = validateTransactionUpdate({ amount: 100 });
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('accepts all valid fields', () => {
            const result = validateTransactionUpdate({
                amount: 100,
                description: 'Test',
                date: new Date('2024-01-01'),
                category: 'Alimentación'
            });

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });
});
