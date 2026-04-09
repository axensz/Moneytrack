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
        <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1 scrollbar-thin">
            {visible.map((transaction) => (
                <TransactionItem
                    key={transaction.id}
                    transaction={transaction}
                    account={getAccountForTransaction(transaction.accountId)}
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
            ))}
            {hasMore && (
                <div ref={sentinelRef} className="flex justify-center py-3">
                    <span className="text-xs text-gray-400">Cargando más...</span>
                </div>
            )}
            {!hasMore && hasMoreTransactions && (
                <div className="flex justify-center py-4">
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
                                Cargar transacciones más antiguas
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
