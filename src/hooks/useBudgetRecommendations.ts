import { useMemo } from 'react';
import type { Transaction, Budget } from '../types/finance';

export interface BudgetRecommendation {
    category: string;
    lastMonthSpent: number;
    suggestedLimit: number;
    reason: string;
}

export interface SavingsRecommendation {
    totalIncome: number;
    totalExpenses: number;
    currentSavings: number;
    suggestedSavings: number;
    savingsRate: number;
    suggestedRate: number;
}

export type HealthLevel = 'excellent' | 'good' | 'warning' | 'critical';

export interface FinancialTip {
    icon: string;
    title: string;
    description: string;
    type: 'savings' | 'spending' | 'strategy';
}

export interface MethodRecommendation {
    name: string;
    description: string;
    howItApplies: string;
}

export interface BudgetAnalysis {
    recommendations: BudgetRecommendation[];
    savings: SavingsRecommendation;
    totalLastMonth: number;
    totalRecommended: number;
    potentialSavings: number;
    monthLabel: string;
    healthLevel: HealthLevel;
    rule503020: {
        needs: number;
        needsPct: number;
        needsTarget: number;
        wants: number;
        wantsPct: number;
        wantsTarget: number;
        savingsActual: number;
        savingsPct: number;
        savingsTarget: number;
    };
    tips: FinancialTip[];
    method: MethodRecommendation;
}

// Clasificación de categorías
const NEEDS = new Set([
    'servicios', 'vivienda', 'salud', 'educación',
    'alimentación', 'transporte',
    'arriendo', 'seguros', 'internet', 'teléfono',
]);
const FIXED_NEEDS = new Set([
    'servicios', 'vivienda', 'salud', 'educación',
    'arriendo', 'seguros', 'internet', 'teléfono', 'suscripciones',
]);

function classifyCategory(cat: string): 'need' | 'want' {
    return NEEDS.has(cat.toLowerCase()) ? 'need' : 'want';
}

function isFixed(cat: string): boolean {
    return FIXED_NEEDS.has(cat.toLowerCase());
}

function pickMethod(savingsRate: number, needsPct: number): MethodRecommendation {
    if (savingsRate < 5) {
        return {
            name: 'Págate primero',
            description: 'Aparta un monto fijo de ahorro apenas recibas tu ingreso, antes de gastar en cualquier otra cosa.',
            howItApplies: 'Tu ahorro actual es muy bajo. Configura una transferencia automática el día de pago hacia una cuenta de ahorros separada.',
        };
    }
    if (needsPct > 60) {
        return {
            name: 'Método Kakebo (japonés)',
            description: 'Registra cada gasto diario en 4 categorías: necesidades, deseos, cultura y extras. Al final de la semana reflexiona sobre qué puedes eliminar.',
            howItApplies: 'Tus gastos esenciales superan el 50% recomendado. Kakebo te ayuda a identificar gastos "necesarios" que realmente no lo son.',
        };
    }
    if (savingsRate >= 20) {
        return {
            name: 'Regla 50/30/20 (optimizada)',
            description: 'Destina 50% a necesidades, 30% a gustos y 20% a ahorro/inversión. Ya estás en buen camino.',
            howItApplies: 'Tu tasa de ahorro es saludable. Considera destinar parte del excedente a inversiones o fondo de emergencia.',
        };
    }
    return {
        name: 'Regla 50/30/20',
        description: 'Divide tu ingreso: 50% necesidades, 30% gustos, 20% ahorro. Es el método más equilibrado para construir hábito financiero.',
        howItApplies: 'Ajusta tus gastos discrecionales para liberar ese 20% de ahorro. Empieza con metas pequeñas y sube gradualmente.',
    };
}

function generateTips(
    savingsRate: number,
    needsPct: number,
    wantsPct: number,
    topCategories: { category: string; spent: number }[],
    totalIncome: number,
): FinancialTip[] {
    const tips: FinancialTip[] = [];

    // Tip de ahorro según situación
    if (savingsRate < 0) {
        tips.push({
            icon: '🚨',
            title: 'Gastas más de lo que ganas',
            description: 'Prioriza reducir gastos discrecionales inmediatamente. Revisa suscripciones y gastos en "Otros" que puedas eliminar.',
            type: 'savings',
        });
    } else if (savingsRate < 10) {
        tips.push({
            icon: '💰',
            title: 'Fondo de emergencia primero',
            description: 'Intenta ahorrar al menos 3 meses de gastos fijos. Empieza con el 10% de tu ingreso y súbelo gradualmente.',
            type: 'savings',
        });
    } else if (savingsRate < 20) {
        tips.push({
            icon: '📈',
            title: 'Sube tu ahorro al 20%',
            description: 'Ya tienes el hábito. Cada aumento de ingreso, destina el 50% al ahorro antes de ajustar tu estilo de vida.',
            type: 'savings',
        });
    } else {
        tips.push({
            icon: '🏆',
            title: 'Considera invertir el excedente',
            description: 'Con un ahorro sólido, explora CDTs, fondos de inversión o aportes voluntarios a pensión para hacer crecer tu dinero.',
            type: 'savings',
        });
    }

    // Tip sobre la categoría más grande
    if (topCategories.length > 0) {
        const top = topCategories[0];
        const pct = totalIncome > 0 ? Math.round((top.spent / totalIncome) * 100) : 0;
        if (pct > 40) {
            tips.push({
                icon: '🔍',
                title: `"${top.category}" consume el ${pct}% de tus ingresos`,
                description: 'Revisa si puedes desglosar esta categoría en subcategorías más específicas para identificar dónde recortar.',
                type: 'spending',
            });
        }
    }

    // Tip sobre necesidades vs gustos
    if (needsPct > 60) {
        tips.push({
            icon: '⚖️',
            title: 'Necesidades por encima del 50%',
            description: 'Busca alternativas más económicas en servicios, transporte o alimentación. Pequeños cambios suman mucho al mes.',
            type: 'strategy',
        });
    }

    if (wantsPct > 35) {
        tips.push({
            icon: '🎯',
            title: 'Regla de las 24 horas',
            description: 'Antes de compras no esenciales mayores a $50.000, espera 24 horas. Muchas compras impulsivas se evitan así.',
            type: 'strategy',
        });
    }

    // Tip general
    tips.push({
        icon: '📋',
        title: 'Revisa tus presupuestos cada semana',
        description: 'No esperes al fin de mes. Un chequeo semanal te permite corregir a tiempo antes de exceder los límites.',
        type: 'strategy',
    });

    return tips;
}

export function useBudgetRecommendations(
    transactions: Transaction[],
    existingBudgets: Budget[],
): BudgetAnalysis | null {
    return useMemo(() => {
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        // Transacciones del mes anterior (sin transferencias)
        const lastMonthTx = transactions.filter(t => {
            const d = t.date instanceof Date ? t.date : new Date(t.date);
            return d >= lastMonth && d <= lastMonthEnd && t.type !== 'transfer';
        });

        const lastMonthExpenses = lastMonthTx.filter(t => t.type === 'expense');
        const lastMonthIncome = lastMonthTx.filter(t => t.type === 'income');

        if (lastMonthExpenses.length === 0) return null;

        const totalIncome = lastMonthIncome.reduce((s, t) => s + t.amount, 0);
        const totalExpenses = lastMonthExpenses.reduce((s, t) => s + t.amount, 0);
        const currentSavings = totalIncome - totalExpenses;

        // Agrupar gastos por categoría
        const byCategory = new Map<string, number>();
        lastMonthExpenses.forEach(t => {
            byCategory.set(t.category, (byCategory.get(t.category) || 0) + t.amount);
        });

        // Categorías existentes
        const existingCategories = new Set(existingBudgets.map(b => b.category));

        // Regla 50/30/20
        let needsTotal = 0;
        let wantsTotal = 0;
        byCategory.forEach((spent, cat) => {
            if (classifyCategory(cat) === 'need') needsTotal += spent;
            else wantsTotal += spent;
        });

        const base = totalIncome > 0 ? totalIncome : totalExpenses;
        const needsPct = Math.round((needsTotal / base) * 100);
        const wantsPct = Math.round((wantsTotal / base) * 100);
        const savingsPct = totalIncome > 0 ? Math.round((currentSavings / totalIncome) * 100) : 0;

        const rule503020 = {
            needs: needsTotal,
            needsPct,
            needsTarget: Math.round(base * 0.5),
            wants: wantsTotal,
            wantsPct,
            wantsTarget: Math.round(base * 0.3),
            savingsActual: currentSavings,
            savingsPct,
            savingsTarget: Math.round(base * 0.2),
        };

        // Recomendaciones por categoría
        const recommendations: BudgetRecommendation[] = [];
        byCategory.forEach((spent, category) => {
            if (existingCategories.has(category)) return;

            let suggestedLimit: number;
            let reason: string;

            if (isFixed(category)) {
                suggestedLimit = Math.ceil(spent * 1.05 / 1000) * 1000;
                reason = 'Gasto fijo — margen del 5%';
            } else if (classifyCategory(category) === 'need') {
                suggestedLimit = Math.ceil(spent * 0.90 / 1000) * 1000;
                reason = 'Esencial — meta de ahorro 10%';
            } else {
                suggestedLimit = Math.ceil(spent * 0.80 / 1000) * 1000;
                reason = 'Discrecional — meta de ahorro 20%';
            }

            suggestedLimit = Math.max(suggestedLimit, 1000);
            recommendations.push({ category, lastMonthSpent: spent, suggestedLimit, reason });
        });

        recommendations.sort((a, b) => b.lastMonthSpent - a.lastMonthSpent);

        const totalRecommended = recommendations.reduce((a, r) => a + r.suggestedLimit, 0);
        const potentialSavings = totalExpenses - totalRecommended;

        // Meta de ahorro
        let suggestedRate: number;
        if (savingsPct >= 20) suggestedRate = savingsPct;
        else if (savingsPct >= 10) suggestedRate = 20;
        else if (totalIncome > 0) suggestedRate = 10;
        else suggestedRate = 0;

        const suggestedSavings = totalIncome > 0
            ? Math.round(totalIncome * suggestedRate / 100 / 1000) * 1000
            : 0;

        const savings: SavingsRecommendation = {
            totalIncome, totalExpenses, currentSavings,
            suggestedSavings, savingsRate: savingsPct, suggestedRate,
        };

        // Salud financiera
        let healthLevel: HealthLevel;
        if (savingsPct >= 20 && needsPct <= 55) healthLevel = 'excellent';
        else if (savingsPct >= 10 && needsPct <= 60) healthLevel = 'good';
        else if (savingsPct >= 0) healthLevel = 'warning';
        else healthLevel = 'critical';

        // Top categorías para tips
        const topCategories = Array.from(byCategory.entries())
            .map(([category, spent]) => ({ category, spent }))
            .sort((a, b) => b.spent - a.spent);

        const tips = generateTips(savingsPct, needsPct, wantsPct, topCategories, totalIncome);
        const method = pickMethod(savingsPct, needsPct);

        return {
            recommendations, savings,
            totalLastMonth: totalExpenses, totalRecommended,
            potentialSavings: Math.max(0, potentialSavings),
            monthLabel: lastMonth.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }),
            healthLevel, rule503020, tips, method,
        };
    }, [transactions, existingBudgets]);
}
