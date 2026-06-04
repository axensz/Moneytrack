'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { TransactionItem } from './TransactionItem';
import type { Transaction, Account, Categories } from '../../../../types/finance';

const INITIAL_BATCH = 30;
const BATCH_SIZE = 20;

interface TransactionsListProps {
    transactions: Transaction[];
    editingTransaction: string | null;
    editForm: { description: string; amount: string; date: string; category: string };
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

    const visible = transactions.slice(0, visibleCount);
    const hasMore = visibleCount < transactions.length;

    return (
        <div className="space-y-2">
            {visible.map((transaction, index) => {
                const currentDate = new Date(transaction.date).toDateString();
                const previousDate = index > 0 ? new Date(visible[index - 1].date).toDateString() : null;
                const showDateHeader = currentDate !== previousDate;

                return (
                    <React.Fragment key={transaction.id}>
                        {showDateHeader && (
                            <div className="sticky top-0 z-10 -mx-1 px-1 pt-3 pb-1.5 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        {new Date(transaction.date).toLocaleDateString('es-CO', {
                                            weekday: 'short',
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric',
                                        })}
                                    </span>
                                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                                </div>
                            </div>
                        )}
                        <TransactionItem
                            transaction={transaction}
                            account={getAccountForTransaction(transaction.accountId)}
                            destinationAccount={transaction.toAccountId ? getAccountForTransaction(transaction.toAccountId) : undefined}
                            isEditing={editingTransaction === transaction.id}
                            editForm={editForm}
                            categories={categories}
                            recurringPaymentName={getRecurringPaymentName(transaction.recurringPaymentId)}
                            formatCurrency={formatCurrency}
                            onEdit={() => startEditTransaction(transaction)}
                            onDelete={() => handleDeleteTransaction(transaction)}
                            onSave={() => handleSaveEdit(transaction.id!)}
                            onCancel={handleCancelEdit}
                            onEditFormChange={setEditForm}
                        />
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
