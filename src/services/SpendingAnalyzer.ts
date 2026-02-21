/**
 * SpendingAnalyzer - Detects unusual spending patterns
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 12.2, 14.3, 14.5
 */

import { logger } from '../utils/logger';
import { SPECIAL_CATEGORIES } from '../config/constants';
import type { Transaction, NotificationPreferences } from '../types/finance';

interface SpendingAnalyzerDeps {
    createNotification: (notification: any) => Promise<void>;
    preferences: NotificationPreferences;
    transactions: Transaction[];
}

interface CategoryAverageCache {
    average: number;
    timestamp: number;
    transactionCount: number;
}

export class SpendingAnalyzer {
    private deps: SpendingAnalyzerDeps;
    private categoryAverageCache: Map<string, CategoryAverageCache> = new Map();
    private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    private readonly LOOKBACK_DAYS = 90; // 3 months
    private readonly MIN_TRANSACTIONS = 3;

    constructor(deps: SpendingAnalyzerDeps) {
        this.deps = deps;
    }

    /**
     * Evaluate if a transaction represents unusual spending
     * Called when a transaction is added
     */
    async evaluateUnusualSpending(transaction: Transaction): Promise<void> {
        try {
            // Only evaluate expense transactions
            if (transaction.type !== 'expense') {
                return;
            }

            // Only evaluate paid transactions
            if (!transaction.paid) {
                return;
            }

            // Skip special categories
            if (SPECIAL_CATEGORIES.adjustmentCategories.includes(transaction.category)) {
                return;
            }

            // Check if category has minimum history
            if (!this.hasMinimumHistory(transaction.category)) {
                logger.info('Category has insufficient history for unusual spending detection', {
                    category: transaction.category,
                });
                return;
            }

            // Calculate category average
            const average = this.calculateCategoryAverage(transaction.category, this.LOOKBACK_DAYS);

            // Check if transaction exceeds threshold
            const threshold = this.deps.preferences.thresholds.unusualSpending;
            const thresholdAmount = average * (threshold / 100);

            if (transaction.amount > thresholdAmount) {
                await this.deps.createNotification({
                    type: 'unusual_spending',
                    title: `Gasto inusual: ${transaction.category}`,
                    message: `Gasto de ${this.formatCurrency(transaction.amount)} excede el promedio de ${this.formatCurrency(average)} en ${Math.round((transaction.amount / average) * 100)}%`,
                    severity: 'warning',
                    isRead: false,
                    actionUrl: `/transactions`,
                    metadata: {
                        transactionId: transaction.id,
                        categoryName: transaction.category,
                        amount: transaction.amount,
                        threshold: thresholdAmount,
                    },
                });
            }
        } catch (error) {
            logger.error('Spending analyzer evaluation failed', { transaction, error });
        }
    }

    /**
     * Calculate average spending for a category over the specified number of days
     * Uses caching to avoid redundant calculations
     */
    calculateCategoryAverage(category: string, days: number): number {
        // Check cache
        const cached = this.categoryAverageCache.get(category);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
            return cached.average;
        }

        // Calculate cutoff date
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        // Get relevant transactions
        const relevantTransactions = this.deps.transactions.filter((t) => {
            const tDate = new Date(t.date);
            return (
                t.type === 'expense' &&
                t.paid &&
                t.category === category &&
                tDate >= cutoffDate &&
                !SPECIAL_CATEGORIES.adjustmentCategories.includes(t.category)
            );
        });

        if (relevantTransactions.length === 0) {
            return 0;
        }

        // Calculate average
        const total = relevantTransactions.reduce((sum, t) => sum + t.amount, 0);
        const average = total / relevantTransactions.length;

        // Update cache
        this.categoryAverageCache.set(category, {
            average,
            timestamp: Date.now(),
            transactionCount: relevantTransactions.length,
        });

        return average;
    }

    /**
     * Check if a category has minimum transaction history for analysis
     */
    hasMinimumHistory(category: string): boolean {
        // Check cache first
        const cached = this.categoryAverageCache.get(category);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
            return cached.transactionCount >= this.MIN_TRANSACTIONS;
        }

        // Calculate cutoff date
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.LOOKBACK_DAYS);

        // Count relevant transactions
        const count = this.deps.transactions.filter((t) => {
            const tDate = new Date(t.date);
            return (
                t.type === 'expense' &&
                t.paid &&
                t.category === category &&
                tDate >= cutoffDate &&
                !SPECIAL_CATEGORIES.adjustmentCategories.includes(t.category)
            );
        }).length;

        return count >= this.MIN_TRANSACTIONS;
    }

    /**
     * Format currency for display
     */
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    }

    /**
     * Clear category average cache
     */
    clearCache(): void {
        this.categoryAverageCache.clear();
    }

    /**
     * Clean up old cache entries
     */
    cleanupCache(): void {
        const now = Date.now();
        for (const [key, value] of this.categoryAverageCache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL_MS * 2) {
                this.categoryAverageCache.delete(key);
            }
        }
    }
}
