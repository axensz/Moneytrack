'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { X, Send, Bot, User, Loader2, Trash2, Check, XCircle, Info } from 'lucide-react';
import { sendChatMessage, isGeminiConfigured, parseActionFromResponse, type ChatMessage, type ChatAction, type TokenUsage } from '../../lib/gemini';
import { formatCurrency } from '../../utils/formatters';
import { logger } from '../../utils/logger';
import { useTransactionDomain, useAccountDomain, useCategoryDomain } from '../../hooks/useFinanceSelectors';

// Unique ID generator for chat messages
let _msgIdCounter = 0;
const nextMsgId = () => `msg-${++_msgIdCounter}-${Date.now()}`;

// Local message type with unique ID for React keys
type UIChatMessage = ChatMessage & { id: string };

// Máximo de mensajes del historial enviados a la API para evitar exceder tokens
const MAX_HISTORY_MESSAGES = 20;

// Simple markdown renderer - converts markdown to React elements
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const ListTag = listType;
      elements.push(
        <ListTag key={`list-${elements.length}`} className={listType === 'ul' ? 'list-disc pl-4 my-1' : 'list-decimal pl-4 my-1'}>
          {listItems}
        </ListTag>
      );
      listItems = [];
      listType = null;
    }
  };

  const formatInline = (str: string): React.ReactNode => {
    // Bold + italic, bold, italic, inline code
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*\*(.+?)\*\*\*)|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(str.slice(lastIndex, match.index));
      }
      if (match[1]) parts.push(<strong key={key++} className="font-semibold"><em>{match[2]}</em></strong>);
      else if (match[3]) parts.push(<strong key={key++} className="font-semibold">{match[4]}</strong>);
      else if (match[5]) parts.push(<em key={key++}>{match[6]}</em>);
      else if (match[7]) parts.push(<code key={key++} className="bg-black/10 dark:bg-white/10 px-1 rounded text-xs">{match[8]}</code>);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < str.length) parts.push(str.slice(lastIndex));
    return parts.length === 1 ? parts[0] : parts;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Unordered list
    const ulMatch = line.match(/^\s*[-*+]\s+(.+)/);
    // Ordered list
    const olMatch = line.match(/^\s*\d+\.\s+(.+)/);

    if (ulMatch) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(<li key={`li-${i}`}>{formatInline(ulMatch[1])}</li>);
      continue;
    }
    if (olMatch) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(<li key={`li-${i}`}>{formatInline(olMatch[1])}</li>);
      continue;
    }

    flushList();

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const cls = level === 1 ? 'font-bold text-base' : level === 2 ? 'font-bold text-sm' : 'font-semibold text-sm';
      elements.push(<p key={`h-${i}`} className={`${cls} mt-1`}>{formatInline(headerMatch[2])}</p>);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      if (elements.length > 0) {
        elements.push(<span key={`br-${i}`} className="block h-1" />);
      }
      continue;
    }

    // Regular paragraph
    elements.push(<span key={`p-${i}`} className="block">{formatInline(line)}</span>);
  }

  flushList();
  return elements;
}

interface AIChatBotProps {
  isOpen: boolean;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLElement | null>;
}

const WELCOME_MESSAGE: UIChatMessage = {
  id: 'welcome',
  role: 'model',
  content: '¡Hola! 👋 Soy tu asistente financiero. Puedo analizar tus gastos, darte consejos, **agregar transacciones** y **recategorizar** movimientos. ¿En qué te puedo ayudar?',
};

const SUGGESTIONS = [
  '¿Cómo voy este mes?',
  '¿En qué gasto más?',
  'Gasté 35mil en almuerzo',
  'Recategoriza mis transacciones',
];

// Token usage badge with expandable details
const TokenBadge: React.FC<{ tokenUsage: TokenUsage }> = ({ tokenUsage }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 select-none">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-md hover:bg-surface-primary"
        aria-label="Ver uso de tokens"
      >
        <Info size={12} />
        <span className="font-medium">{tokenUsage.totalTokens.toLocaleString()} tokens</span>
      </button>
      {expanded && (
        <div className="mt-1.5 p-2.5 bg-muted rounded-lg text-[10px] text-foreground space-y-1 border border-border animate-in fade-in duration-200">
          <div className="flex justify-between gap-4 items-center">
            <span className="flex items-center gap-1">
              <span className="text-primary">↗</span>
              <span>Entrada</span>
            </span>
            <span className="font-mono font-semibold">{tokenUsage.promptTokens.toLocaleString()}</span>
          </div>
          <div className="flex justify-between gap-4 items-center">
            <span className="flex items-center gap-1">
              <span className="text-primary">↙</span>
              <span>Respuesta</span>
            </span>
            <span className="font-mono font-semibold">{tokenUsage.responseTokens.toLocaleString()}</span>
          </div>
          {(tokenUsage.thinkingTokens ?? 0) > 0 && (
            <div className="flex justify-between gap-4 items-center">
              <span className="flex items-center gap-1">
                <span>🧠</span>
                <span>Razonamiento</span>
              </span>
              <span className="font-mono font-semibold">{tokenUsage.thinkingTokens!.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between gap-4 items-center border-t border-border pt-1 mt-1">
            <span className="font-semibold flex items-center gap-1">
              <span className="text-primary">Σ</span>
              <span>Total</span>
            </span>
            <span className="font-mono font-bold text-primary">{tokenUsage.totalTokens.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Action confirmation card component
const ActionCard: React.FC<{
  action: ChatAction;
  isExecuting: boolean;
  onConfirm: () => void;
  onReject: () => void;
}> = ({ action, isExecuting, onConfirm, onReject }) => {
  const getActionSummary = () => {
    switch (action.type) {
      case 'add_transaction': {
        const d = action.data;
        const icon = d.txType === 'income' ? '📈' : '📉';
        return (
          <div className="space-y-1.5">
            <p className="font-semibold text-sm flex items-center gap-2">
              <span className="text-lg">{icon}</span>
              {d.txType === 'income' ? 'Agregar ingreso' : 'Agregar gasto'}
            </p>
            <div className="text-xs space-y-1 text-foreground bg-card rounded-lg p-2 border border-border">
              <p className="flex justify-between"><span className="font-medium">Monto:</span> <span className="font-semibold text-primary">{formatCurrency(d.amount)}</span></p>
              <p className="flex justify-between"><span className="font-medium">Categoría:</span> <span className="font-medium">{d.category}</span></p>
              <p className="flex justify-between"><span className="font-medium">Descripción:</span> <span>{d.description}</span></p>
              <p className="flex justify-between"><span className="font-medium">Cuenta:</span> <span>{d.accountName}</span></p>
              <p className="flex justify-between"><span className="font-medium">Estado:</span> <span className={d.paid ? 'text-success' : 'text-warning'}>{d.paid ? '✓ Pagado' : '⏳ Pendiente'}</span></p>
            </div>
          </div>
        );
      }
      case 'update_category': {
        const d = action.data;
        return (
          <div className="space-y-1.5">
            <p className="font-semibold text-sm flex items-center gap-2">
              <span className="text-lg">🏷️</span>
              Recategorizar transacción
            </p>
            <div className="text-xs space-y-1 text-foreground bg-card rounded-lg p-2 border border-border">
              <p><span className="font-medium">Transacción:</span> {d.description}</p>
              <p className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-muted rounded">{d.oldCategory}</span>
                <span>→</span>
                <span className="px-2 py-0.5 bg-surface-primary text-primary-text rounded font-medium">{d.newCategory}</span>
              </p>
            </div>
          </div>
        );
      }
      case 'bulk_update_category': {
        const updates = action.data.updates;
        return (
          <div className="space-y-1.5">
            <p className="font-semibold text-sm flex items-center gap-2">
              <span className="text-lg">🏷️</span>
              Recategorizar {updates.length} transacciones
            </p>
            <div className="text-xs space-y-1 text-foreground bg-card rounded-lg p-2 border border-border max-h-32 overflow-y-auto scrollbar-thin">
              {updates.map((u) => (
                <p key={u.transactionId} className="flex items-center gap-1.5 py-0.5">
                  <span className="text-primary">•</span>
                  <span className="flex-1 truncate">{u.description}</span>
                  <span className="text-[10px] text-muted-foreground">→</span>
                  <span className="text-primary font-medium">{u.newCategory}</span>
                </p>
              ))}
            </div>
          </div>
        );
      }
      case 'add_category': {
        const d = action.data;
        return (
          <div className="space-y-1.5">
            <p className="font-semibold text-sm flex items-center gap-2">
              <span className="text-lg">➕</span>
              Crear categoría
            </p>
            <div className="text-xs text-foreground bg-card rounded-lg p-2 border border-border">
              <p className="flex justify-between"><span className="font-medium">Nombre:</span> <span className="font-semibold">{d.name}</span></p>
              <p className="flex justify-between"><span className="font-medium">Tipo:</span> <span>{d.categoryType === 'expense' ? '📉 Gasto' : '📈 Ingreso'}</span></p>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="bg-muted border border-border rounded-xl p-3 space-y-2.5 shadow-sm animate-in fade-in duration-200">
      {getActionSummary()}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onConfirm}
          disabled={isExecuting}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-primary-solid text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isExecuting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {isExecuting ? 'Ejecutando...' : 'Confirmar'}
        </button>
        <button
          onClick={onReject}
          disabled={isExecuting}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-card text-foreground border border-border hover:bg-muted disabled:opacity-50 transition-colors"
        >
          <XCircle size={14} />
          Cancelar
        </button>
      </div>
    </div>
  );
};

export const AIChatBot: React.FC<AIChatBotProps> = memo(({
  isOpen,
  onClose,
  returnFocusRef,
}) => {
  const {
    transactions,
    addTransaction: onAddTransaction,
    updateTransaction: onUpdateTransaction,
  } = useTransactionDomain();
  const { accounts } = useAccountDomain();
  const { categories, addCategory: onAddCategory } = useCategoryDomain();
  const [messages, setMessages] = useState<UIChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executingAction, setExecutingAction] = useState<number | null>(null); // index of message with action being executed
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const configured = isGeminiConfigured();

  // Auto scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isOpen) return;
    const composer = inputRef.current;
    const fallback = panelRef.current?.querySelector<HTMLButtonElement>(
      '[data-assistant-focus-fallback]:not([disabled])',
    );
    (composer && !composer.disabled ? composer : fallback)?.focus();
  }, [isOpen]);

  // Memoizar el contexto financiero para evitar recalcular en cada render
  const financialData = useMemo(() => ({
    transactions,
    accounts,
    categories,
  }), [transactions, accounts, categories]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMessage: UIChatMessage = { id: nextMsgId(), role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      // Historial sin el mensaje de bienvenida, limitado a los últimos N mensajes
      const history = messages
        .filter((_, i) => i > 0)
        .slice(-MAX_HISTORY_MESSAGES)
        .map(m => ({
          role: m.role,
          content: m.content,
        }));

      const { text: rawText, action: toolAction, tokenUsage } = await sendChatMessage(trimmed, history, financialData);

      // Preferir function calling; mantener el parser de bloques como fallback.
      const { text, action: textAction } = parseActionFromResponse(rawText);
      const action = toolAction ?? textAction;
      setMessages(prev => [...prev, { id: nextMsgId(), role: 'model', content: text, action, tokenUsage }]);
    } catch (err) {
      logger.error('[AIChatBot] Error sending message', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('API_KEY') || errorMsg.includes('configurada')) {
        setError('No hay API key de Gemini. Agrégala en Ajustes → Asistente IA.');
      } else if (errorMsg.includes('429') || errorMsg.includes('RATE_LIMIT') || errorMsg.includes('quota')) {
        setError('Cuota agotada temporalmente. El asistente reintentará automáticamente. Si persiste, espera 2 minutos e intenta de nuevo.');
      } else if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('400')) {
        setError('API key inválida. Revísala en Ajustes → Asistente IA.');
      } else if (errorMsg.includes('PERMISSION_DENIED') || errorMsg.includes('403')) {
        setError('API key sin permisos. Habilita la API de Gemini en Google Cloud Console.');
      } else {
        setError(`Error: ${errorMsg.slice(0, 150)}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, financialData]);

  const handleSend = useCallback(() => {
    sendMessage(input);
  }, [input, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleSuggestion = useCallback((text: string) => {
    sendMessage(text);
  }, [sendMessage]);

  const handleClearChat = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    setError(null);
  }, []);

  const requestClose = useCallback(() => {
    onClose();
    queueMicrotask(() => {
      const trigger = returnFocusRef.current;
      if (trigger?.isConnected) trigger.focus();
    });
  }, [onClose, returnFocusRef]);

  const handlePanelKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      requestClose();
    },
    [requestClose],
  );

  // Ejecutar una acción confirmada por el usuario
  const handleConfirmAction = useCallback(async (msgIndex: number) => {
    const msg = messages[msgIndex];
    if (!msg?.action || msg.actionExecuted) return;

    setExecutingAction(msgIndex);
    try {
      const action = msg.action;

      switch (action.type) {
        case 'add_transaction': {
          const d = action.data;

          // AUDIT-FIX: Validar datos del LLM antes de ejecutar
          if (typeof d.amount !== 'number' || isNaN(d.amount) || d.amount <= 0 || d.amount > 999999999999) {
            throw new Error(`Monto inválido: ${d.amount}`);
          }
          if (!d.category || typeof d.category !== 'string' || d.category.length > 100) {
            throw new Error('Categoría inválida');
          }
          if (!d.accountId || !accounts.find(a => a.id === d.accountId)) {
            throw new Error('Cuenta no encontrada. Verifica que la cuenta exista.');
          }
          if (!['income', 'expense'].includes(d.txType)) {
            throw new Error('Tipo de transacción inválido');
          }
          // Sanitizar description para prevenir inyección
          const safeDescription = (d.description || '').toString().slice(0, 500).trim();

          // Auto-crear categoría si no existe
          const txCatType = d.txType === 'income' ? 'income' : 'expense';
          const txExistingCats = txCatType === 'income' ? categories.income : categories.expense;
          if (!txExistingCats.includes(d.category)) {
            await onAddCategory(txCatType, d.category);
          }
          await onAddTransaction({
            type: d.txType,
            amount: d.amount,
            category: d.category,
            description: safeDescription,
            date: d.date ? new Date(d.date) : new Date(),
            paid: d.paid ?? true,
            accountId: d.accountId,
          });
          // Mark as executed and add confirmation
          setMessages(prev => {
            const updated = [...prev];
            updated[msgIndex] = { ...updated[msgIndex], actionExecuted: true };
            updated.push({ id: nextMsgId(), role: 'model', content: `✅ ¡Listo! Se agregó el ${d.txType === 'income' ? 'ingreso' : 'gasto'} de **${formatCurrency(d.amount)}** en **${d.category}** (${d.accountName}).` });
            return updated;
          });
          break;
        }
        case 'update_category': {
          const d = action.data;
          // AUDIT-FIX: Validar que la transacción exista antes de actualizar
          const txForCat = transactions.find(t => t.id === d.transactionId);
          if (!txForCat) {
            throw new Error(`Transacción no encontrada (ID: ${d.transactionId})`);
          }
          if (!d.newCategory || typeof d.newCategory !== 'string' || d.newCategory.length > 100) {
            throw new Error('Categoría nueva inválida');
          }
          // Auto-crear categoría si no existe
          const catType = txForCat.type === 'income' ? 'income' : 'expense';
          const existingCats = catType === 'income' ? categories.income : categories.expense;
          if (!existingCats.includes(d.newCategory)) {
            await onAddCategory(catType, d.newCategory);
          }
          await onUpdateTransaction(d.transactionId, { category: d.newCategory });
          setMessages(prev => {
            const updated = [...prev];
            updated[msgIndex] = { ...updated[msgIndex], actionExecuted: true };
            updated.push({ id: nextMsgId(), role: 'model', content: `✅ ¡Listo! "${d.description}" se movió de **${d.oldCategory}** a **${d.newCategory}**.` });
            return updated;
          });
          break;
        }
        case 'bulk_update_category': {
          const updates = action.data.updates;
          // Filtrar solo las que existen en el estado actual
          const validUpdates = updates.filter((u: { transactionId: string }) =>
            transactions.some(t => t.id === u.transactionId)
          );
          // Recoger categorías nuevas que no existen y crearlas primero
          const newCatsToCreate = new Set<string>();
          for (const u of validUpdates) {
            const tx = transactions.find(t => t.id === u.transactionId)!;
            const cType = tx.type === 'income' ? 'income' : 'expense';
            const existing = cType === 'income' ? categories.income : categories.expense;
            if (!existing.includes(u.newCategory) && !newCatsToCreate.has(`${cType}:${u.newCategory}`)) {
              newCatsToCreate.add(`${cType}:${u.newCategory}`);
              await onAddCategory(cType, u.newCategory);
            }
          }
          for (const u of validUpdates) {
            await onUpdateTransaction(u.transactionId, { category: u.newCategory });
          }
          const skipped = updates.length - validUpdates.length;
          const skipNote = skipped > 0 ? ` (${skipped} no encontradas)` : '';
          setMessages(prev => {
            const updated = [...prev];
            updated[msgIndex] = { ...updated[msgIndex], actionExecuted: true };
            updated.push({ id: nextMsgId(), role: 'model', content: `✅ ¡Listo! Se recategorizaron **${validUpdates.length} transacciones** correctamente${skipNote}.` });
            return updated;
          });
          break;
        }
        case 'add_category': {
          const d = action.data;
          await onAddCategory(d.categoryType, d.name);
          setMessages(prev => {
            const updated = [...prev];
            updated[msgIndex] = { ...updated[msgIndex], actionExecuted: true };
            updated.push({ id: nextMsgId(), role: 'model', content: `✅ ¡Listo! Se creó la categoría **"${d.name}"** en ${d.categoryType === 'expense' ? 'gastos' : 'ingresos'}.` });
            return updated;
          });
          break;
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev => [...prev, { id: nextMsgId(), role: 'model', content: `❌ Error al ejecutar la acción: ${errorMsg}` }]);
    } finally {
      setExecutingAction(null);
    }
  }, [
    accounts,
    categories.expense,
    categories.income,
    messages,
    onAddCategory,
    onAddTransaction,
    onUpdateTransaction,
    transactions,
  ]);

  const handleRejectAction = useCallback((msgIndex: number) => {
    setMessages(prev => {
      const updated = [...prev];
      updated[msgIndex] = { ...updated[msgIndex], action: undefined };
      updated.push({ id: nextMsgId(), role: 'model', content: 'Entendido, no se realizó ningún cambio. 👍' });
      return updated;
    });
  }, []);

  // El shell controla la visibilidad; mantener este componente montado conserva
  // el borrador y la conversación entre cierres.
  if (!configured || !isOpen) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="assistant-title"
      onKeyDown={handlePanelKeyDown}
      className="absolute inset-x-3 top-3 bottom-[calc(var(--shell-nav-h,72px)+env(safe-area-inset-bottom))] sm:left-auto sm:right-4 sm:bottom-4 sm:w-[420px] z-[80] flex flex-col min-w-0 max-w-[calc(100%-1.5rem)] bg-card text-card-foreground rounded-2xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-200"
    >
      {/* Header */}
      <div data-assistant-titlebar className="flex items-center justify-between px-4 py-3 bg-primary-solid text-primary-foreground shrink-0">
        <div className="flex items-center gap-2 relative z-10">
          <div className="p-1.5 bg-white/15 rounded-lg">
            <Bot size={18} className="drop-shadow-sm" />
          </div>
          <div>
            <h2 id="assistant-title" className="text-sm font-semibold drop-shadow-sm">Asistente MoneyTrack</h2>
            {(() => {
              const total = messages.reduce((sum, m) => sum + (m.tokenUsage?.totalTokens ?? 0), 0);
              return total > 0 ? (
                <p className="text-[10px] text-white/80 font-mono drop-shadow-sm">{total.toLocaleString()} tokens usados</p>
              ) : null;
            })()}
          </div>
        </div>
        <div className="flex items-center gap-1 relative z-10">
          <button
            data-assistant-focus-fallback
            onClick={handleClearChat}
            className="p-2 rounded-lg hover:bg-white/15 transition-colors"
            title="Limpiar chat"
            aria-label="Limpiar conversación"
          >
            <Trash2 size={16} className="drop-shadow-sm" />
          </button>
          <button
            onClick={requestClose}
            className="p-2 rounded-lg hover:bg-white/15 transition-colors"
            aria-label="Cerrar chat"
          >
            <X size={18} className="drop-shadow-sm" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div data-assistant-messages className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 scrollbar-thin">
        {messages.map((msg, i) => (
          <React.Fragment key={msg.id}>
            <div
              className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}
            >
              {msg.role === 'model' && (
                <div className="shrink-0 w-7 h-7 rounded-full bg-surface-primary text-primary-text flex items-center justify-center mt-1 border border-border-accent">
                  <Bot size={14} />
                </div>
              )}
              <div
                className={`max-w-[calc(100%-3rem)] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words overflow-wrap-anywhere shadow-sm ${msg.role === 'user'
                  ? 'bg-primary-solid text-primary-foreground rounded-br-md whitespace-pre-wrap'
                  : 'bg-card text-card-foreground rounded-bl-md border border-border'
                  }`}
                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
              >
                {msg.role === 'user' ? msg.content : renderMarkdown(msg.content)}
                {msg.role === 'model' && msg.tokenUsage && (
                  <TokenBadge tokenUsage={msg.tokenUsage} />
                )}
              </div>
              {msg.role === 'user' && (
                <div className="shrink-0 w-7 h-7 rounded-full bg-primary-solid text-primary-foreground flex items-center justify-center mt-1 border border-border-accent">
                  <User size={14} />
                </div>
              )}
            </div>

            {/* Action confirmation card */}
            {msg.action && !msg.actionExecuted && (
              <div className="ml-9 max-w-[calc(100%-3rem)]">
                <ActionCard
                  action={msg.action}
                  isExecuting={executingAction === i}
                  onConfirm={() => handleConfirmAction(i)}
                  onReject={() => handleRejectAction(i)}
                />
              </div>
            )}
            {msg.actionExecuted && (
              <div className="ml-9">
                <span className="text-xs text-success italic">Acción ejecutada ✓</span>
              </div>
            )}
          </React.Fragment>
        ))}

        {isLoading && (
          <div className="flex gap-2 justify-start animate-in fade-in duration-200">
            <div className="shrink-0 w-7 h-7 rounded-full bg-surface-primary text-primary-text flex items-center justify-center mt-1 border border-border-accent">
              <Bot size={14} />
            </div>
            <div className="bg-card text-card-foreground px-4 py-3 rounded-2xl rounded-bl-md shadow-sm border border-border">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Pensando...</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center px-3 py-2 text-xs text-destructive bg-destructive-muted rounded-lg border border-destructive animate-in fade-in duration-200">
            <div className="flex items-center justify-center gap-2">
              <XCircle size={14} />
              <span>{error}</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sugerencias (solo al inicio) */}
      {messages.length <= 1 && !isLoading && configured && (
        <div className="px-3 sm:px-4 pb-2 flex flex-wrap gap-1.5 shrink-0 animate-in fade-in duration-200">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="text-xs px-3 py-1.5 rounded-full bg-muted text-primary hover:bg-surface-primary transition-colors border border-border-accent"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div data-assistant-composer className="border-t border-border p-3 shrink-0 bg-card">
        {!configured ? (
          <p className="text-xs text-center text-gray-500 dark:text-gray-400 py-2">
            Agrega tu API key de Gemini en <strong>Ajustes → Asistente IA</strong> para activar el asistente.
            <br />
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 underline mt-1 inline-block transition-colors">
              Obtener API key gratis →
            </a>
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              aria-label="Mensaje para el asistente"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pregunta sobre tus finanzas..."
              disabled={isLoading}
              className="flex-1 px-3 py-2.5 text-sm rounded-xl border border-border bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 transition-[border-color,box-shadow]"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-2.5 rounded-xl bg-primary-solid text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Enviar mensaje"
            >
              <Send size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

AIChatBot.displayName = 'AIChatBot';
