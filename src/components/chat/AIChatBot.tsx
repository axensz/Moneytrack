'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { X, Send, Bot, User, Loader2, Sparkles, Trash2, Check, XCircle, Info } from 'lucide-react';
import { sendChatMessage, isGeminiConfigured, parseActionFromResponse, type ChatMessage, type ChatAction, type TokenUsage } from '../../lib/gemini';
import type { Transaction, Account, Categories } from '../../types/finance';
import { formatCurrency } from '../../utils/formatters';
import { logger } from '../../utils/logger';
import { useFinance } from '../../contexts/FinanceContext';

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

interface AIChatBotProps { }

const WELCOME_MESSAGE: ChatMessage = {
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
        className="inline-flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors px-2 py-1 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20"
        aria-label="Ver uso de tokens"
      >
        <Info size={12} />
        <span className="font-medium">{tokenUsage.totalTokens.toLocaleString()} tokens</span>
      </button>
      {expanded && (
        <div className="mt-1.5 p-2.5 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-lg text-[10px] text-gray-700 dark:text-gray-300 space-y-1 shadow-sm border border-gray-300 dark:border-gray-600 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex justify-between gap-4 items-center">
            <span className="flex items-center gap-1">
              <span className="text-blue-500">↗</span>
              <span>Entrada</span>
            </span>
            <span className="font-mono font-semibold">{tokenUsage.promptTokens.toLocaleString()}</span>
          </div>
          <div className="flex justify-between gap-4 items-center">
            <span className="flex items-center gap-1">
              <span className="text-green-500">↙</span>
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
          <div className="flex justify-between gap-4 items-center border-t border-gray-300 dark:border-gray-600 pt-1 mt-1">
            <span className="font-semibold flex items-center gap-1">
              <span className="text-purple-500">Σ</span>
              <span>Total</span>
            </span>
            <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{tokenUsage.totalTokens.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Action confirmation card component
const ActionCard: React.FC<{
  action: ChatAction;
  accounts: Account[];
  isExecuting: boolean;
  onConfirm: () => void;
  onReject: () => void;
}> = ({ action, accounts, isExecuting, onConfirm, onReject }) => {
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
            <div className="text-xs space-y-1 text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-gray-800/50 rounded-lg p-2 border border-purple-100 dark:border-purple-800/50">
              <p className="flex justify-between"><span className="font-medium">Monto:</span> <span className="font-semibold text-purple-700 dark:text-purple-300">{formatCurrency(d.amount)}</span></p>
              <p className="flex justify-between"><span className="font-medium">Categoría:</span> <span className="font-medium">{d.category}</span></p>
              <p className="flex justify-between"><span className="font-medium">Descripción:</span> <span>{d.description}</span></p>
              <p className="flex justify-between"><span className="font-medium">Cuenta:</span> <span>{d.accountName}</span></p>
              <p className="flex justify-between"><span className="font-medium">Estado:</span> <span className={d.paid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{d.paid ? '✓ Pagado' : '⏳ Pendiente'}</span></p>
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
            <div className="text-xs space-y-1 text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-gray-800/50 rounded-lg p-2 border border-purple-100 dark:border-purple-800/50">
              <p><span className="font-medium">Transacción:</span> {d.description}</p>
              <p className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">{d.oldCategory}</span>
                <span>→</span>
                <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded font-medium">{d.newCategory}</span>
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
            <div className="text-xs space-y-1 text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-gray-800/50 rounded-lg p-2 border border-purple-100 dark:border-purple-800/50 max-h-32 overflow-y-auto scrollbar-thin">
              {updates.map((u, i) => (
                <p key={i} className="flex items-center gap-1.5 py-0.5">
                  <span className="text-purple-500">•</span>
                  <span className="flex-1 truncate">{u.description}</span>
                  <span className="text-[10px] text-gray-500">→</span>
                  <span className="text-purple-600 dark:text-purple-400 font-medium">{u.newCategory}</span>
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
            <div className="text-xs text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-gray-800/50 rounded-lg p-2 border border-purple-100 dark:border-purple-800/50">
              <p className="flex justify-between"><span className="font-medium">Nombre:</span> <span className="font-semibold">{d.name}</span></p>
              <p className="flex justify-between"><span className="font-medium">Tipo:</span> <span>{d.categoryType === 'expense' ? '📉 Gasto' : '📈 Ingreso'}</span></p>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/10 border-2 border-purple-300 dark:border-purple-700 rounded-xl p-3 space-y-2.5 shadow-md animate-in fade-in slide-in-from-bottom-2 duration-300">
      {getActionSummary()}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onConfirm}
          disabled={isExecuting}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
        >
          {isExecuting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {isExecuting ? 'Ejecutando...' : 'Confirmar'}
        </button>
        <button
          onClick={onReject}
          disabled={isExecuting}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
        >
          <XCircle size={14} />
          Cancelar
        </button>
      </div>
    </div>
  );
};

export const AIChatBot: React.FC<AIChatBotProps> = memo(() => {
  const {
    transactions,
    accounts,
    categories,
    addTransaction: onAddTransaction,
    updateTransaction: onUpdateTransaction,
    addCategory: onAddCategory,
  } = useFinance();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executingAction, setExecutingAction] = useState<number | null>(null); // index of message with action being executed
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const configured = isGeminiConfigured();

  // Auto scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input al abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
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

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
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

      const { text: rawText, tokenUsage } = await sendChatMessage(trimmed, history, financialData);

      // Parsear acciones del response
      const { text, action } = parseActionFromResponse(rawText);
      setMessages(prev => [...prev, { role: 'model', content: text, action, tokenUsage }]);
    } catch (err) {
      logger.error('[AIChatBot] Error sending message', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('API_KEY') || errorMsg.includes('configurada')) {
        setError('API key de Gemini no configurada. Agrega NEXT_PUBLIC_GEMINI_API_KEY en .env.local');
      } else if (errorMsg.includes('429') || errorMsg.includes('RATE_LIMIT') || errorMsg.includes('quota')) {
        setError('Cuota agotada temporalmente. El asistente reintentará automáticamente. Si persiste, espera 2 minutos e intenta de nuevo.');
      } else if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('400')) {
        setError('API key inválida. Verifica tu NEXT_PUBLIC_GEMINI_API_KEY en .env.local');
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
            updated.push({ role: 'model', content: `✅ ¡Listo! Se agregó el ${d.txType === 'income' ? 'ingreso' : 'gasto'} de **${formatCurrency(d.amount)}** en **${d.category}** (${d.accountName}).` });
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
            updated.push({ role: 'model', content: `✅ ¡Listo! "${d.description}" se movió de **${d.oldCategory}** a **${d.newCategory}**.` });
            return updated;
          });
          break;
        }
        case 'bulk_update_category': {
          const updates = action.data.updates;
          // Recoger categorías nuevas que no existen y crearlas primero
          const newCatsToCreate = new Set<string>();
          for (const u of updates) {
            const tx = transactions.find(t => t.id === u.transactionId);
            const cType = tx?.type === 'income' ? 'income' : 'expense';
            const existing = cType === 'income' ? categories.income : categories.expense;
            if (!existing.includes(u.newCategory) && !newCatsToCreate.has(`${cType}:${u.newCategory}`)) {
              newCatsToCreate.add(`${cType}:${u.newCategory}`);
              await onAddCategory(cType, u.newCategory);
            }
          }
          for (const u of updates) {
            await onUpdateTransaction(u.transactionId, { category: u.newCategory });
          }
          setMessages(prev => {
            const updated = [...prev];
            updated[msgIndex] = { ...updated[msgIndex], actionExecuted: true };
            updated.push({ role: 'model', content: `✅ ¡Listo! Se recategorizaron **${updates.length} transacciones** correctamente.` });
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
            updated.push({ role: 'model', content: `✅ ¡Listo! Se creó la categoría **"${d.name}"** en ${d.categoryType === 'expense' ? 'gastos' : 'ingresos'}.` });
            return updated;
          });
          break;
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev => [...prev, { role: 'model', content: `❌ Error al ejecutar la acción: ${errorMsg}` }]);
    } finally {
      setExecutingAction(null);
    }
  }, [messages, onAddTransaction, onUpdateTransaction, onAddCategory]);

  const handleRejectAction = useCallback((msgIndex: number) => {
    setMessages(prev => {
      const updated = [...prev];
      updated[msgIndex] = { ...updated[msgIndex], action: undefined };
      updated.push({ role: 'model', content: 'Entendido, no se realizó ningún cambio. 👍' });
      return updated;
    });
  }, []);

  // No mostrar el chatbot si la API key no está configurada
  if (!configured) return null;

  // Botón flotante
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-[88px] sm:bottom-6 right-4 sm:right-6 z-40 p-4 rounded-full bg-gradient-to-br from-purple-600 via-violet-600 to-purple-700 text-white shadow-lg hover:shadow-2xl hover:scale-110 transition-all duration-300 group animate-in fade-in zoom-in"
        title="Asistente financiero IA"
        aria-label="Abrir asistente de IA"
      >
        <Sparkles size={24} className="group-hover:rotate-12 transition-transform duration-300" />
        {/* Badge de IA con animación */}
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-amber-400 to-amber-500 rounded-full flex items-center justify-center shadow-md animate-pulse">
          <span className="text-[9px] font-bold text-amber-900">AI</span>
        </span>
        {/* Efecto de brillo */}
        <span className="absolute inset-0 rounded-full bg-white opacity-0 group-hover:opacity-20 transition-opacity duration-300"></span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-[88px] sm:bottom-6 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[420px] sm:max-w-[420px] h-[calc(100vh-180px)] sm:h-[600px] max-h-[calc(100vh-180px)] sm:max-h-[85vh] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-purple-200 dark:border-purple-800 overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-br from-purple-600 via-violet-600 to-purple-700 text-white shrink-0 relative overflow-hidden">
        {/* Efecto de brillo animado en el header */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer"></div>
        <div className="flex items-center gap-2 relative z-10">
          <div className="p-1.5 bg-white/20 backdrop-blur-sm rounded-lg shadow-inner">
            <Bot size={18} className="drop-shadow-sm" />
          </div>
          <div>
            <h3 className="text-sm font-semibold drop-shadow-sm">Asistente MoneyTrack</h3>
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
            onClick={handleClearChat}
            className="p-2 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all hover:scale-110 active:scale-95"
            title="Limpiar chat"
            aria-label="Limpiar conversación"
          >
            <Trash2 size={16} className="drop-shadow-sm" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all hover:scale-110 active:scale-95"
            aria-label="Cerrar chat"
          >
            <X size={18} className="drop-shadow-sm" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 min-h-0 bg-gradient-to-b from-gray-50/50 to-transparent dark:from-gray-800/30 dark:to-transparent scrollbar-thin">
        {messages.map((msg, i) => (
          <React.Fragment key={i}>
            <div
              className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
            >
              {msg.role === 'model' && (
                <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/40 dark:to-purple-800/40 flex items-center justify-center mt-1 shadow-sm border border-purple-200 dark:border-purple-700">
                  <Bot size={14} className="text-purple-600 dark:text-purple-400" />
                </div>
              )}
              <div
                className={`max-w-[calc(100%-3rem)] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words overflow-wrap-anywhere shadow-sm ${msg.role === 'user'
                  ? 'bg-gradient-to-br from-purple-600 to-purple-700 text-white rounded-br-md whitespace-pre-wrap'
                  : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md border border-gray-200 dark:border-gray-700'
                  }`}
                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
              >
                {msg.role === 'user' ? msg.content : renderMarkdown(msg.content)}
                {msg.role === 'model' && msg.tokenUsage && (
                  <TokenBadge tokenUsage={msg.tokenUsage} />
                )}
              </div>
              {msg.role === 'user' && (
                <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center mt-1 shadow-sm">
                  <User size={14} className="text-white" />
                </div>
              )}
            </div>

            {/* Action confirmation card */}
            {msg.action && !msg.actionExecuted && (
              <div className="ml-9 max-w-[calc(100%-3rem)]">
                <ActionCard
                  action={msg.action}
                  accounts={accounts}
                  isExecuting={executingAction === i}
                  onConfirm={() => handleConfirmAction(i)}
                  onReject={() => handleRejectAction(i)}
                />
              </div>
            )}
            {msg.actionExecuted && (
              <div className="ml-9">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 italic">Acción ejecutada ✓</span>
              </div>
            )}
          </React.Fragment>
        ))}

        {isLoading && (
          <div className="flex gap-2 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/40 dark:to-purple-800/40 flex items-center justify-center mt-1 shadow-sm border border-purple-200 dark:border-purple-700">
              <Bot size={14} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div className="bg-white dark:bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-purple-500" />
                <span className="text-xs text-gray-500 dark:text-gray-400">Pensando...</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center px-3 py-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
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
        <div className="px-3 sm:px-4 pb-2 flex flex-wrap gap-1.5 shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSuggestion(s)}
              className="text-xs px-3 py-1.5 rounded-full bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/30 text-purple-700 dark:text-purple-300 hover:from-purple-100 hover:to-purple-200 dark:hover:from-purple-900/40 dark:hover:to-purple-900/50 transition-all hover:scale-105 active:scale-95 border border-purple-200 dark:border-purple-800 shadow-sm"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3 shrink-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
        {!configured ? (
          <p className="text-xs text-center text-gray-500 dark:text-gray-400 py-2">
            Configura <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">NEXT_PUBLIC_GEMINI_API_KEY</code> en <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">.env.local</code> para activar el asistente.
            <br />
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 underline mt-1 inline-block transition-colors">
              Obtener API key gratis →
            </a>
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pregunta sobre tus finanzas..."
              disabled={isLoading}
              className="flex-1 px-3 py-2.5 text-sm rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50 transition-all shadow-sm"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-2.5 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
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
