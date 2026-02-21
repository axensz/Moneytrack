/**
 * BudgetMonitor - Monitors budget utilization and generates alerts
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 14.1, 14.5
 */

import { logger } from '../utils/logger';
import { SPECIAL_CATEGORIES } from '../config/constants';
import type { Transaction, Budget, NotificationPreferences } from '../types/finance';

export interface BudgetUtilization {
    budgetId: string;
    category: string;
    limit: number;
    spent: number;
    percentage: number;
}

interface BudgetMonitorDeps {
    createNotification: (notification: any) => Promise<void>;
    preferences: NotificationPreferences;
    budgets: Budget[];
    transactions: Transaction[];
}

export class BudgetMonitor {
    private deps: BudgetMonitorDeps;
    private utilizationCache: Map<string, { utilization: BudgetUtilization; timestamp: number }> = new Map();
    private readonly CACHE_TTL_MS = 30000; // 30 seconds

    constructor(deps: BudgetMonitorDeps) {
        this.deps = deps;
    }

    /**
     * Evaluate budget alerts for a transaction
     * Called when a transaction is added or modified
     */
    async evaluateBudgetAlerts(transaction: Transaction): Promise<void> {
        try {
            // Only evaluate for expense transactions
            if (transaction.type !== 'expense') {
                return;
            }

            // Skip special categories
            if (SPECIAL_CATEGORIES.adjustmentCategories.includes(transaction.category)) {
                return;
            }

            // Find all active budgets matching this transaction's category
            const matchingBudgets = this.deps.budgets.filter(
                (b) => b.isActive && b.category === transaction.category
            );

            if (matchingBudgets.length === 0) {
                return;
            }

            // Evaluate each matching budget
            for (const budget of matchingBudgets) {
                if (!budget.id) continue;

                const utilization = this.calculateBudgetUtilization(budget.id);
                await this.checkThresholds(utilization);
            }
        } catch (error) {
            logger.error('Budget monitor evaluation failed', { transaction, error });
        }
    }

    /**
     * Calculate budget utilization for a specific budget
     * Uses caching to avoid redundant calculations
     */
    calculateBudgetUtilization(budgetId: string): BudgetUtilization {
        // Check cache
        const cached = this.utilizationCache.get(budgetId);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
            return cached.utilization;
        }

        // Find the budget
        const budget = this.deps.budgets.find((b) => b.id === budgetId);
        if (!budget) {
            throw new Error(`Budget not found: ${budgetId}`);
        }

        // Get current month's date range
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Calculate spent amount for this budget's category in current month
        const spent = this.deps.transactions
            .filter((t) => {
                const tDate = new Date(t.date);
                return (
                    t.type === 'expense' &&
                    t.paid &&
                    t.category === budget.category &&
                    tDate.getMonth() === currentMonth &&
                    tDate.getFullYear() === currentYear &&
                    !SPECIAL_CATEGORIES.adjustmentCategories.includes(t.category)
                );
            })
            .reduce((sum, t) => sum + t.amount, 0);

        const percentage = budget.monthlyLimit > 0 ? (spent / budget.monthlyLimit) * 100 : 0;

        const utilization: BudgetUtilization = {
            budgetId,
            category: budget.category,
            limit: budget.monthlyLimit,
            spent,
            percentage,
        };

        // Update cache
        this.utilizationCache.set(budgetId, {
            utilization,
            timestamp: Date.now(),
        });

        return utilization;
    }

    /**
     * Check if utilization crosses any thresholds and generate alerts
     */
    private async checkThresholds(utilization: BudgetUtilization): Promise<void> {
        const { thresholds } = this.deps.preferences;
        const { percentage, category, budgetId, spent, limit } = utilization;

        // Check exceeded threshold (100% or custom)
        if (percentage >= thresholds.budgetExceeded) {
            await this.deps.createNotification({
                type: 'budget',
                title: `Presupuesto excedido: ${category}`,
                message: `Has gastado ${this.formatCurrency(spent)} de ${this.formatCurrency(limit)} (${Math.round(percentage)}%)`,
                severity: 'error',
                isRead: false,
                actionUrl: `/budgets`,
                metadata: {
                    budgetId,
                    categoryName: category,
                    percentage: Math.round(percentage),
                    amount: spent,
                    threshold: limit,
                },
            });
            return;
        }

        // Check critical threshold (90% or custom)
        if (percentage >= thresholds.budgetCritical) {
            await this.deps.createNotification({
                type: 'budget',
                title: `Alerta crítica: ${category}`,
                message: `Has gastado ${this.formatCurrency(spent)} de ${this.formatCurrency(limit)} (${Math.round(percentage)}%)`,
                severity: 'warning',
                isRead: false,
                actionUrl: `/budgets`,
                metadata: {
                    budgetId,
                    categoryName: category,
                    percentage: Math.round(percentage),
                    amount: spent,
                    threshold: limit,
                },
            });
            return;
        }

        // Check warning threshold (80% or custom)
        if (percentage >= thresholds.budgetWarning) {
            await this.deps.createNotification({
                type: 'budget',
                title: `Advertencia: ${category}`,
                message: `Has gastado ${this.formatCurrency(spent)} de ${this.formatCurrency(limit)} (${Math.round(percentage)}%)`,
                severity: 'warning',
                isRead: false,
                actionUrl: `/budgets`,
                metadata: {
                    budgetId,
                    categoryName: category,
                    percentage: Math.round(percentage),
                    amount: spent,
                    threshold: limit,
                },
            });
        }
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
     * Clear utilization cache (call when budgets or transactions change significantly)
     */
    clearCache(): void {
        this.utilizationCache.clear();
    }

    /**
     * Clean up old cache entries
     */
    cleanupCache(): void {
        const now = Date.now();
        for (const [key, value] of this.utilizationCache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL_MS * 2) {
                this.utilizationCache.delete(key);
            }
        }
    }
}
