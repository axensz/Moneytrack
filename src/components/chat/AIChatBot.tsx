'use client';

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { X, Send, Bot, User, Loader2, Sparkles, Trash2, Check, XCircle, Info } from 'lucide-react';
import { sendChatMessage, isGeminiConfigured, parseActionFromResponse, type ChatMessage, type ChatAction, type TokenUsage } from '../../lib/gemini';
import type { Transaction, Account, Categories } from '../../types/finance';
import { formatCurrency } from '../../utils/formatters';

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
  transactions: Transaction[];
  accounts: Account[];
  categories: Categories;
  onAddTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
  onAddCategory: (type: 'expense' | 'income', name: string) => Promise<void>;
}

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
    <div className="mt-1.5 select-none">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400 transition-colors"
        aria-label="Ver uso de tokens"
      >
        <Info size={11} />
        <span>{tokenUsage.totalTokens.toLocaleString()} tokens</span>
      </button>
      {expanded && (
        <div className="mt-1 p-2 bg-gray-200/60 dark:bg-gray-700/60 rounded-lg text-[10px] text-gray-600 dark:text-gray-300 space-y-0.5">
          <div className="flex justify-between gap-4">
            <span>↗ Entrada</span>
            <span className="font-mono">{tokenUsage.promptTokens.toLocaleString()}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>↙ Respuesta</span>
            <span className="font-mono">{tokenUsage.responseTokens.toLocaleString()}</span>
          </div>
          {(tokenUsage.thinkingTokens ?? 0) > 0 && (
            <div className="flex justify-between gap-4">
              <span>🧠 Razonamiento</span>
              <span className="font-mono">{tokenUsage.thinkingTokens!.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between gap-4 border-t border-gray-300 dark:border-gray-600 pt-0.5 font-semibold">
            <span>Σ Total</span>
            <span className="font-mono">{tokenUsage.totalTokens.toLocaleString()}</span>
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
          <div className="space-y-1">
            <p className="font-medium text-sm">{icon} {d.txType === 'income' ? 'Agregar ingreso' : 'Agregar gasto'}</p>
            <div className="text-xs space-y-0.5 text-gray-600 dark:text-gray-300">
              <p><strong>Monto:</strong> {formatCurrency(d.amount)}</p>
              <p><strong>Categoría:</strong> {d.category}</p>
              <p><strong>Descripción:</strong> {d.description}</p>
              <p><strong>Cuenta:</strong> {d.accountName}</p>
              <p><strong>Estado:</strong> {d.paid ? 'Pagado' : 'Pendiente'}</p>
            </div>
          </div>
        );
      }
      case 'update_category': {
        const d = action.data;
        return (
          <div className="space-y-1">
            <p className="font-medium text-sm">🏷️ Recategorizar transacción</p>
            <div className="text-xs space-y-0.5 text-gray-600 dark:text-gray-300">
              <p><strong>Transacción:</strong> {d.description}</p>
              <p><strong>De:</strong> {d.oldCategory} → <strong>A:</strong> {d.newCategory}</p>
            </div>
          </div>
        );
      }
      case 'bulk_update_category': {
        const updates = action.data.updates;
        return (
          <div className="space-y-1">
            <p className="font-medium text-sm">🏷️ Recategorizar {updates.length} transacciones</p>
            <div className="text-xs space-y-0.5 text-gray-600 dark:text-gray-300 max-h-24 overflow-y-auto">
              {updates.map((u, i) => (
                <p key={i}>• {u.description}: {u.oldCategory} → {u.newCategory}</p>
              ))}
            </div>
          </div>
        );
      }
      case 'add_category': {
        const d = action.data;
        return (
          <div className="space-y-1">
            <p className="font-medium text-sm">➕ Crear categoría</p>
            <div className="text-xs text-gray-600 dark:text-gray-300">
              <p><strong>Nombre:</strong> {d.name}</p>
              <p><strong>Tipo:</strong> {d.categoryType === 'expense' ? 'Gasto' : 'Ingreso'}</p>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-3 space-y-2">
      {getActionSummary()}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onConfirm}
          disabled={isExecuting}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {isExecuting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {isExecuting ? 'Ejecutando...' : 'Confirmar'}
        </button>
        <button
          onClick={onReject}
          disabled={isExecuting}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          <XCircle size={12} />
          Cancelar
        </button>
      </div>
    </div>
  );
};

export const AIChatBot: React.FC<AIChatBotProps> = memo(({
  transactions,
  accounts,
  categories,
  onAddTransaction,
  onUpdateTransaction,
  onAddCategory,
}) => {
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

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      // Historial sin el mensaje de bienvenida
      const history = messages.filter((_, i) => i > 0).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { text: rawText, tokenUsage } = await sendChatMessage(trimmed, history, {
        transactions,
        accounts,
        categories,
      });

      // Parsear acciones del response
      const { text, action } = parseActionFromResponse(rawText);
      setMessages(prev => [...prev, { role: 'model', content: text, action, tokenUsage }]);
    } catch (err) {
      console.error('[AIChatBot] Error:', err);
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
  }, [isLoading, messages, transactions, accounts, categories]);

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
            description: d.description,
            date: d.date ? new Date(d.date) : new Date(),
            paid: d.paid,
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
          // Auto-crear categoría si no existe
          const txForCat = transactions.find(t => t.id === d.transactionId);
          const catType = txForCat?.type === 'income' ? 'income' : 'expense';
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

  // Botón flotante
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 p-4 rounded-full bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all group"
        title="Asistente financiero IA"
      >
        <Sparkles size={24} className="group-hover:animate-pulse" />
        {/* Badge de IA */}
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center">
          <span className="text-[9px] font-bold text-amber-900">AI</span>
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[420px] max-h-[70vh] sm:max-h-[600px] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-violet-600 text-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-white/20 rounded-lg">
            <Bot size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Asistente MoneyTrack</h3>
            <p className="text-[10px] text-white/70 font-mono">
              {(() => {
                const total = messages.reduce((sum, m) => sum + (m.tokenUsage?.totalTokens ?? 0), 0);
                return total > 0 ? `${total.toLocaleString()} tokens usados` : 'gemini-2.5-flash';
              })()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClearChat}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            title="Limpiar chat"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.map((msg, i) => (
          <React.Fragment key={i}>
            <div
              className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'model' && (
                <div className="shrink-0 w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center mt-1">
                  <Bot size={14} className="text-purple-600 dark:text-purple-400" />
                </div>
              )}
              <div
                className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-purple-600 text-white rounded-br-md whitespace-pre-wrap'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md'
                }`}
              >
                {msg.role === 'user' ? msg.content : renderMarkdown(msg.content)}
                {msg.role === 'model' && msg.tokenUsage && (
                  <TokenBadge tokenUsage={msg.tokenUsage} />
                )}
              </div>
              {msg.role === 'user' && (
                <div className="shrink-0 w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center mt-1">
                  <User size={14} className="text-white" />
                </div>
              )}
            </div>

            {/* Action confirmation card */}
            {msg.action && !msg.actionExecuted && (
              <div className="ml-9 max-w-[80%]">
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
          <div className="flex gap-2 justify-start">
            <div className="shrink-0 w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center mt-1">
              <Bot size={14} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-md">
              <Loader2 size={16} className="animate-spin text-purple-500" />
            </div>
          </div>
        )}

        {error && (
          <div className="text-center px-3 py-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded-lg">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sugerencias (solo al inicio) */}
      {messages.length <= 1 && !isLoading && configured && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSuggestion(s)}
              className="text-xs px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors border border-purple-200 dark:border-purple-800"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3 shrink-0">
        {!configured ? (
          <p className="text-xs text-center text-gray-500 dark:text-gray-400 py-2">
            Configura <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">NEXT_PUBLIC_GEMINI_API_KEY</code> en <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">.env.local</code> para activar el asistente.
            <br />
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-purple-600 dark:text-purple-400 underline mt-1 inline-block">
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
              className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-2.5 rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
