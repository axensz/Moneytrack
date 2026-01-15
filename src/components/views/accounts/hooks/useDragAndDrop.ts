import { useState, useCallback } from 'react';
import type { Account } from '../../../../types/finance';

interface UseDragAndDropProps {
  accounts: Account[];
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
}

interface UseDragAndDropReturn {
  draggedAccountId: string | null;
  dragOverAccountId: string | null;
  touchStartY: number | null;
  touchCurrentY: number | null;
  handleDragStart: (e: React.DragEvent, accountId: string) => void;
  handleDragOver: (e: React.DragEvent, accountId: string) => void;
  handleDragLeave: () => void;
  handleDrop: (e: React.DragEvent, targetAccountId: string) => Promise<void>;
  handleDragEnd: () => void;
  handleTouchStart: (e: React.TouchEvent, accountId: string) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: () => Promise<void>;
}

/**
 * Hook para manejar drag & drop de cuentas
 * Soporta tanto mouse (desktop) como touch (mobile)
 */
export function useDragAndDrop({
  accounts,
  updateAccount,
}: UseDragAndDropProps): UseDragAndDropReturn {
  const [draggedAccountId, setDraggedAccountId] = useState<string | null>(null);
  const [dragOverAccountId, setDragOverAccountId] = useState<string | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchCurrentY, setTouchCurrentY] = useState<number | null>(null);

  // Helpers
  const isMainAccount = (acc: Account) => acc.type !== 'credit' || !acc.bankAccountId;

  const areSiblings = (acc1: Account, acc2: Account) => {
    if (isMainAccount(acc1) && isMainAccount(acc2)) return true;
    if (acc1.bankAccountId && acc2.bankAccountId && acc1.bankAccountId === acc2.bankAccountId) return true;
    return false;
  };

  const reorderAccounts = async (draggedId: string, targetId: string) => {
    const draggedAccount = accounts.find(acc => acc.id === draggedId);
    const targetAccount = accounts.find(acc => acc.id === targetId);

    if (!draggedAccount || !targetAccount) return;
    if (!areSiblings(draggedAccount, targetAccount)) return;

    // Obtener lista relevante
    let relevantAccounts: Account[];
    if (isMainAccount(draggedAccount)) {
      relevantAccounts = accounts.filter(acc => isMainAccount(acc));
    } else {
      relevantAccounts = accounts.filter(acc => acc.bankAccountId === draggedAccount.bankAccountId);
    }

    const sortedAccounts = [...relevantAccounts].sort((a, b) => (a.order || 0) - (b.order || 0));
    const draggedIndex = sortedAccounts.findIndex(acc => acc.id === draggedId);
    const targetIndex = sortedAccounts.findIndex(acc => acc.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Crear nuevo orden
    const newOrder = [...sortedAccounts];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    // Actualizar en Firestore
    await Promise.all(
      newOrder.map((account, index) => updateAccount(account.id!, { order: index }))
    );
  };

  // Desktop handlers
  const handleDragStart = useCallback((e: React.DragEvent, accountId: string) => {
    setDraggedAccountId(accountId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, accountId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedAccountId !== accountId) {
      setDragOverAccountId(accountId);
    }
  }, [draggedAccountId]);

  const handleDragLeave = useCallback(() => {
    setDragOverAccountId(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetAccountId: string) => {
    e.preventDefault();

    if (!draggedAccountId || draggedAccountId === targetAccountId) {
      setDraggedAccountId(null);
      setDragOverAccountId(null);
      return;
    }

    await reorderAccounts(draggedAccountId, targetAccountId);

    setDraggedAccountId(null);
    setDragOverAccountId(null);
  }, [draggedAccountId, accounts, updateAccount]);

  const handleDragEnd = useCallback(() => {
    setDraggedAccountId(null);
    setDragOverAccountId(null);
  }, []);

  // Touch handlers (mobile)
  const handleTouchStart = useCallback((e: React.TouchEvent, accountId: string) => {
    const touch = e.touches[0];
    setTouchStartY(touch.clientY);
    setTouchCurrentY(touch.clientY);
    setDraggedAccountId(accountId);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!draggedAccountId || !touchStartY) return;

    const touch = e.touches[0];
    setTouchCurrentY(touch.clientY);

    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const accountCard = element?.closest('[data-account-id]');

    if (accountCard) {
      const targetId = accountCard.getAttribute('data-account-id');
      if (targetId && targetId !== draggedAccountId) {
        setDragOverAccountId(targetId);
      }
    }
  }, [draggedAccountId, touchStartY]);

  const handleTouchEnd = useCallback(async () => {
    if (!draggedAccountId || !dragOverAccountId) {
      setDraggedAccountId(null);
      setDragOverAccountId(null);
      setTouchStartY(null);
      setTouchCurrentY(null);
      return;
    }

    await reorderAccounts(draggedAccountId, dragOverAccountId);

    setDraggedAccountId(null);
    setDragOverAccountId(null);
    setTouchStartY(null);
    setTouchCurrentY(null);
  }, [draggedAccountId, dragOverAccountId, accounts, updateAccount]);

  return {
    draggedAccountId,
    dragOverAccountId,
    touchStartY,
    touchCurrentY,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
