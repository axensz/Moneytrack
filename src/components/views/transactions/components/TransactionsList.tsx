'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Loader2, AlertTriangle } from 'lucide-react';
import { TransactionItem } from './TransactionItem';
import { AdjustmentGroup } from './AdjustmentGroup';
import { SPECIAL_CATEGORIES } from '../../../../config/constants';
import type { Transaction, Account, Categories } from '../../../../types/finance';

const INITIAL_BATCH = 30;
const BATCH_SIZE = 20;

interface TransactionsListProps {
    transactions: Transaction[];
    editingTransaction: string | null;
    editForm: { description: string; amount: string; date: string; category: string };
    expandedTransaction?: string | null;
    toggleExpand?: (id: string) => void;
    categories: Categories;
    formatCurrency: (amount: number) => string;
    getAccountForTransaction: (accountId: string) => Account | undefined;
    getRecurringPaymentName: (id?: string) => string | null | undefined;
    startEditTransaction: (t: Transaction) => void;
    handleDeleteTransaction: (t: Transaction) => void;
    handleSaveEdit: (id: string) => void;
    handleCancelEdit: () => void;
    setEditForm: (form: { description: string; amount: string; date: string; category: string }) => void;
    hasMoreTransactions?: boolean;
    loadingMoreTransactions?: boolean;
    loadMoreTransactions?: () => Promise<void>;
    hasActiveFilters?: boolean;
    /**
     * Mensaje de error de carga. Si se provee (string no vacío), la lista
     * renderiza un bloque accesible con opción de reintento en lugar de
     * (o además de) las transacciones. Hoy ningún consumidor lo pasa, pero la
     * prop queda preparada para cuando la capa de datos exponga errores de
     * carga/paginación. Sin esta prop la lista se comporta igual que antes.
     */
    error?: string | null;
    /** Callback de reintento asociado al estado de error. */
    onRetry?: () => void;
}

/**
 * Progressive rendering list — renders INITIAL_BATCH items immediately,
 * then loads BATCH_SIZE more when the sentinel enters the viewport.
 * No external dependencies needed.
 */
export function TransactionsList({
    transactions,
    editingTransaction,
    editForm,
    expandedTransaction = null,
    toggleExpand,
    categories,
    formatCurrency,
    getAccountForTransaction,
    getRecurringPaymentName,
    startEditTransaction,
    handleDeleteTransaction,
    handleSaveEdit,
    handleCancelEdit,
    setEditForm,
    hasMoreTransactions = false,
    loadingMoreTransactions = false,
    loadMoreTransactions,
    hasActiveFilters = false,
    error = null,
    onRetry,
}: TransactionsListProps) {
    const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Reset visible count when transactions change (filter applied)
    useEffect(() => {
        setVisibleCount(INITIAL_BATCH);
    }, [transactions]);

    // IntersectionObserver to load more when sentinel is visible
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount(prev => Math.min(prev + BATCH_SIZE, transactions.length));
                }
            },
            { rootMargin: '200px' }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [transactions.length]);

    const hasMore = visibleCount < transactions.length;

    // Group adjustment transactions by day
    type ListItem = { type: 'transaction'; transaction: Transaction } | { type: 'adjustmentGroup'; transactions: Transaction[]; dateKey: string };
    // Item enriquecido con metadatos de cabecera de fecha YA calculados, para que
    // el render (.map) no aloque `new Date()`/`toLocaleDateString` por fila en
    // cada render (R-date-perrow). Depende de [transactions, visibleCount] en vez
    // de `visible` (un slice de identidad nueva cada render → invalidaba el memo).
    type RenderItem = ListItem & { key: string; showDateHeader: boolean; headerLabel: string };

    const groupedItems = useMemo<RenderItem[]>(() => {
        const visible = transactions.slice(0, visibleCount);
        const items: ListItem[] = [];
        let i = 0;
        while (i < visible.length) {
            const t = visible[i];
            const dateKey = new Date(t.date).toDateString();
            if (SPECIAL_CATEGORIES.groupedAdjustmentCategories.includes(t.category)) {
                // Collect all consecutive adjustments of the same day
                const group: Transaction[] = [t];
                let j = i + 1;
                while (j < visible.length) {
                    const next = visible[j];
                    if (new Date(next.date).toDateString() === dateKey && SPECIAL_CATEGORIES.groupedAdjustmentCategories.includes(next.category)) {
                        group.push(next);
                        j++;
                    } else {
                        break;
                    }
                }
                if (group.length > 1) {
                    items.push({ type: 'adjustmentGroup', transactions: group, dateKey });
                } else {
                    items.push({ type: 'transaction', transaction: t });
                }
                i = j;
            } else {
                items.push({ type: 'transaction', transaction: t });
                i++;
            }
        }

        // Cabeceras de fecha + key, calculadas una sola vez por (transactions, count).
        let prevDateKey: string | null = null;
        return items.map((item) => {
            const currentDate = item.type === 'transaction'
                ? new Date(item.transaction.date).toDateString()
                : item.dateKey;
            const showDateHeader = currentDate !== prevDateKey;
            prevDateKey = currentDate;
            const headerLabel = showDateHeader
                ? new Date(currentDate).toLocaleDateString('es-CO', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                })
                : '';
            const key = item.type === 'transaction' ? item.transaction.id! : `adj-${item.dateKey}`;
            return { ...item, key, showDateHeader, headerLabel };
        });
    }, [transactions, visibleCount]);

    return (
        <div className="space-y-2">
            {error && (
                <div
                    role="alert"
                    aria-live="assertive"
                    className="flex flex-col items-center gap-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-4 text-center"
                >
                    <AlertTriangle size={24} className="text-rose-600 dark:text-rose-400" aria-hidden="true" />
                    <p className="text-sm font-medium text-rose-800 dark:text-rose-200">
                        {error}
                    </p>
                    {onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/40 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                        >
                            Reintentar
                        </button>
                    )}
                </div>
            )}
            {groupedItems.map((item) => {
                return (
                    <React.Fragment key={item.key}>
                        {item.showDateHeader && (
                            <div className="pt-4 pb-1.5 first:pt-0">
                                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">
                                    {item.headerLabel}
                                </span>
                            </div>
                        )}
                        {item.type === 'transaction' ? (
                            <TransactionItem
                                transaction={item.transaction}
                                account={getAccountForTransaction(item.transaction.accountId)}
                                destinationAccount={item.transaction.toAccountId ? getAccountForTransaction(item.transaction.toAccountId) : undefined}
                                isEditing={editingTransaction === item.transaction.id}
                                editForm={editForm}
                                categories={categories}
                                recurringPaymentName={getRecurringPaymentName(item.transaction.recurringPaymentId)}
                                formatCurrency={formatCurrency}
                                isExpanded={expandedTransaction === item.transaction.id}
                                onToggleExpand={toggleExpand}
                                onEdit={startEditTransaction}
                                onDelete={handleDeleteTransaction}
                                onSave={handleSaveEdit}
                                onCancel={handleCancelEdit}
                                onEditFormChange={setEditForm}
                            />
                        ) : (
                            <AdjustmentGroup
                                transactions={item.transactions}
                                formatCurrency={formatCurrency}
                                categories={categories}
                                getAccountForTransaction={getAccountForTransaction}
                                getRecurringPaymentName={getRecurringPaymentName}
                                editingTransaction={editingTransaction}
                                editForm={editForm}
                                expandedTransaction={expandedTransaction}
                                toggleExpand={toggleExpand}
                                startEditTransaction={startEditTransaction}
                                handleDeleteTransaction={handleDeleteTransaction}
                                handleSaveEdit={handleSaveEdit}
                                handleCancelEdit={handleCancelEdit}
                                setEditForm={setEditForm}
                            />
                        )}
                    </React.Fragment>
                );
            })}
            {hasMore && (
                <div ref={sentinelRef} className="flex justify-center py-3">
                    <span className="text-xs text-gray-400">Cargando mas...</span>
                </div>
            )}
            {!hasMore && hasMoreTransactions && (
                <div className="flex flex-col items-center gap-2 py-4">
                    {hasActiveFilters && (
                        <p className="max-w-sm text-center text-xs text-gray-500 dark:text-gray-400">
                            La busqueda y los filtros aplican sobre las transacciones cargadas. Carga mas antiguas si esperas resultados anteriores.
                        </p>
                    )}
                    <button
                        onClick={loadMoreTransactions}
                        disabled={loadingMoreTransactions}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors disabled:opacity-50"
                    >
                        {loadingMoreTransactions ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Cargando transacciones antiguas...
                            </>
                        ) : (
                            <>
                                <ChevronDown size={16} />
                                Cargar transacciones mas antiguas
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
