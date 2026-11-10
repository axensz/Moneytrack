'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { X, Send, Bot, User, Loader2, Trash2, Check, XCircle, Info, RefreshCw, Edit2 } from 'lucide-react';
import { sendChatMessageStream, isGeminiConfigured, parseActionFromResponse, type ChatMessage, type ChatAction, type TokenUsage } from '../../lib/gemini';
import { formatCurrency, formatNumberForInput, unformatNumber, parseCurrency } from '../../utils/formatters';
import { TRANSFER_CATEGORY } from '../../config/constants';
import { logger } from '../../utils/logger';
import * as financeSelectors from '../../hooks/useFinanceSelectors';
import type { Account, Categories } from '../../types/finance';

export const AI_CHAT_STORAGE_KEY = 'moneytrack_ai_chat_history_v1';

// Unique ID generator for chat messages
let _msgIdCounter = 0;
const nextMsgId = () => `msg-${++_msgIdCounter}-${Date.now()}`;

// Local message type with unique ID for React keys. proposedAt fija la fecha
// implícita de una acción para que un reintento conserve exactamente el payload.
type UIChatMessage = ChatMessage & {
  id: string;
  proposedAt?: number;
  financialCommitted?: boolean;
};

interface PendingChatRequest {
  text: string;
  history: ChatMessage[];
}

function getChatErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return 'No se pudo conectar con Gemini';
  }
  if (message.includes('429') || message.includes('RATE_LIMIT') || message.includes('quota')) {
    return 'Cuota agotada temporalmente. El asistente reintentará automáticamente. Si persiste, espera 2 minutos e intenta de nuevo.';
  }
  // 503/500/UNAVAILABLE/overloaded = el MODELO está saturado (no es la key).
  // Debe ir ANTES del chequeo de API key: un 503 de Gemini NO significa key
  // inválida, y mostrar ese mensaje confunde al usuario (lo hacía antes).
  if (/\b50[0-9]\b/.test(message) || /unavailable|overloaded|high demand|try again later/i.test(message)) {
    return 'El modelo de IA está saturado en este momento. Intenta de nuevo en unos segundos o cambia de modelo en Ajustes → Asistente IA (p. ej. Flash-Lite suele estar más libre).';
  }
  // API key realmente inválida: exigir la señal específica de Gemini, NO un "400"
  // genérico (muchos errores transitorios traen 400 sin ser problema de la key).
  if (message.includes('API_KEY_INVALID') || /api key not valid|invalid api key/i.test(message)) {
    return 'API key inválida. Revísala en Ajustes → Asistente IA.';
  }
  if (message.includes('PERMISSION_DENIED') || message.includes('403')) {
    return 'API key sin permisos. Habilita la API de Gemini en Google AI Studio.';
  }
  if (message.includes('API_KEY') || message.includes('configurada')) {
    return 'No hay API key de Gemini. Agrégala en Ajustes → Asistente IA.';
  }
  return `Error: ${message.slice(0, 150)}`;
}

const createAiLedgerOperationId = (
  messageId: string,
  action: ChatAction,
  scope: string = action.type,
): string => {
  const input = `${messageId}\u001f${scope}\u001f${JSON.stringify(action)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 0x01000193);
  }
  const safeMessageId = messageId.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 64);
  const safeScope = scope.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 48);
  return `ledger-mutation:ai:${safeMessageId}:${safeScope}:${(hash >>> 0).toString(36)}`;
};

// Máximo de mensajes del historial enviados a la API para evitar exceder tokens
const MAX_HISTORY_MESSAGES = 20;

// Umbral tras el cual la espera pasa de "Pensando..." a "Razonando…": suficiente
// para no dispararse en respuestas rápidas de Flash, pero corto para tranquilizar
// en modelos thinking que emiten thoughts antes del texto.
const REASONING_THRESHOLD_MS = 8_000;

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

    // Markdown table support (| col1 | col2 |)
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushList();
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      i--; // compensate outer loop increment

      const rows = tableLines
        .filter(row => !/^\|[\s:-]+(\|[\s:-]+)*\|$/.test(row))
        .map(row => row.slice(1, -1).split('|').map(cell => cell.trim()));

      if (rows.length > 0) {
        const [header, ...body] = rows;
        elements.push(
          <div key={`tbl-${i}`} className="my-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted text-muted-foreground border-b border-border">
                <tr>
                  {header.map((cell, idx) => (
                    <th key={idx} className="px-2 py-1.5 font-semibold">{formatInline(cell)}</th>
                  ))}
                </tr>
              </thead>
              {body.length > 0 && (
                <tbody className="divide-y divide-border">
                  {body.map((row, rIdx) => (
                    <tr key={rIdx} className="bg-card">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-2 py-1.5">{formatInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        );
      }
      continue;
    }

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

// Action confirmation card component (supports inline editing before confirming)
const ActionCard: React.FC<{
  action: ChatAction;
  accounts: Account[];
  categories: Categories;
  isExecuting: boolean;
  onActionChange?: (updated: ChatAction) => void;
  onConfirm: () => void;
  onReject: () => void;
}> = ({ action, accounts, categories, isExecuting, onActionChange, onConfirm, onReject }) => {
  const [isEditing, setIsEditing] = useState(false);
  const selectableAccounts = useMemo(() => accounts.filter(a => !a.archived), [accounts]);
  const canInlineEdit =
    action.type === 'add_transaction' ||
    action.type === 'add_transfer' ||
    action.type === 'upsert_budget' ||
    action.type === 'add_recurring_payment';

  const getActionSummary = () => {
    switch (action.type) {
      case 'add_transaction': {
        const d = action.data;
        const icon = d.txType === 'income' ? '📈' : '📉';
        const catOptions = d.txType === 'income' ? categories.income : categories.expense;
        const allCategories = catOptions.includes(d.category) ? catOptions : [d.category, ...catOptions];
        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-sm flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                {d.txType === 'income' ? 'Agregar ingreso' : 'Agregar gasto'}
              </p>
              {canInlineEdit && onActionChange && (
                <button
                  type="button"
                  onClick={() => setIsEditing(prev => !prev)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-primary hover:bg-surface-primary rounded-md transition-colors"
                >
                  <Edit2 size={11} />
                  {isEditing ? 'Listo' : 'Editar'}
                </button>
              )}
            </div>
            {isEditing && onActionChange ? (
              <div className="text-xs space-y-2 text-foreground bg-card rounded-lg p-2.5 border border-border">
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Monto</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label="Editar monto de la acción"
                    value={formatNumberForInput(d.amount)}
                    onChange={(e) => {
                      const nextAmount = parseCurrency(unformatNumber(e.target.value));
                      onActionChange({
                        ...action,
                        data: { ...d, amount: Number.isFinite(nextAmount) && nextAmount > 0 ? nextAmount : d.amount },
                      });
                    }}
                    className="w-full px-2 py-1 rounded border border-border bg-input text-foreground text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Categoría</label>
                    <select
                      aria-label="Editar categoría de la acción"
                      value={d.category}
                      onChange={(e) =>
                        onActionChange({
                          ...action,
                          data: { ...d, category: e.target.value },
                        })
                      }
                      className="w-full px-2 py-1 rounded border border-border bg-input text-foreground text-xs"
                    >
                      {allCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Cuenta</label>
                    <select
                      aria-label="Editar cuenta de la acción"
                      value={d.accountId}
                      onChange={(e) => {
                        const acc = selectableAccounts.find(a => a.id === e.target.value);
                        if (!acc?.id) return;
                        onActionChange({
                          ...action,
                          data: { ...d, accountId: acc.id, accountName: acc.name },
                        });
                      }}
                      className="w-full px-2 py-1 rounded border border-border bg-input text-foreground text-xs"
                    >
                      {selectableAccounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Descripción</label>
                  <input
                    type="text"
                    aria-label="Editar descripción de la acción"
                    value={d.description}
                    onChange={(e) =>
                      onActionChange({
                        ...action,
                        data: { ...d, description: e.target.value },
                      })
                    }
                    className="w-full px-2 py-1 rounded border border-border bg-input text-foreground text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="text-xs space-y-1 text-foreground bg-card rounded-lg p-2 border border-border">
                <p className="flex justify-between"><span className="font-medium">Monto:</span> <span className="font-semibold text-primary">{formatCurrency(d.amount)}</span></p>
                <p className="flex justify-between"><span className="font-medium">Categoría:</span> <span className="font-medium">{d.category}</span></p>
                <p className="flex justify-between"><span className="font-medium">Descripción:</span> <span>{d.description}</span></p>
                <p className="flex justify-between"><span className="font-medium">Cuenta:</span> <span>{d.accountName}</span></p>
                <p className="flex justify-between"><span className="font-medium">Estado:</span> <span className={d.paid ? 'text-success' : 'text-warning'}>{d.paid ? '✓ Pagado' : '⏳ Pendiente'}</span></p>
              </div>
            )}
          </div>
        );
      }
      case 'add_transfer': {
        const d = action.data;
        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-sm flex items-center gap-2">
                <span className="text-lg">🔄</span>
                Transferir entre cuentas
              </p>
              {canInlineEdit && onActionChange && (
                <button
                  type="button"
                  onClick={() => setIsEditing(prev => !prev)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-primary hover:bg-surface-primary rounded-md transition-colors"
                >
                  <Edit2 size={11} />
                  {isEditing ? 'Listo' : 'Editar'}
                </button>
              )}
            </div>
            {isEditing && onActionChange ? (
              <div className="text-xs space-y-2 text-foreground bg-card rounded-lg p-2.5 border border-border">
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Monto</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label="Editar monto de transferencia"
                    value={formatNumberForInput(d.amount)}
                    onChange={(e) => {
                      const nextAmount = parseCurrency(unformatNumber(e.target.value));
                      onActionChange({
                        ...action,
                        data: { ...d, amount: Number.isFinite(nextAmount) && nextAmount > 0 ? nextAmount : d.amount },
                      });
                    }}
                    className="w-full px-2 py-1 rounded border border-border bg-input text-foreground text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Origen</label>
                    <select
                      value={d.fromAccountId}
                      onChange={(e) => {
                        const acc = selectableAccounts.find(a => a.id === e.target.value);
                        if (!acc?.id) return;
                        onActionChange({
                          ...action,
                          data: { ...d, fromAccountId: acc.id, fromAccountName: acc.name },
                        });
                      }}
                      className="w-full px-2 py-1 rounded border border-border bg-input text-foreground text-xs"
                    >
                      {selectableAccounts.filter(a => a.type !== 'credit').map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Destino</label>
                    <select
                      value={d.toAccountId}
                      onChange={(e) => {
                        const acc = selectableAccounts.find(a => a.id === e.target.value);
                        if (!acc?.id) return;
                        onActionChange({
                          ...action,
                          data: { ...d, toAccountId: acc.id, toAccountName: acc.name },
                        });
                      }}
                      className="w-full px-2 py-1 rounded border border-border bg-input text-foreground text-xs"
                    >
                      {selectableAccounts.filter(a => a.id !== d.fromAccountId).map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs space-y-1 text-foreground bg-card rounded-lg p-2 border border-border">
                <p className="flex justify-between"><span className="font-medium">Monto:</span> <span className="font-semibold text-primary">{formatCurrency(d.amount)}</span></p>
                <p className="flex justify-between"><span className="font-medium">Desde:</span> <span>{d.fromAccountName}</span></p>
                <p className="flex justify-between"><span className="font-medium">Hacia:</span> <span>{d.toAccountName}</span></p>
                <p className="flex justify-between"><span className="font-medium">Descripción:</span> <span>{d.description}</span></p>
              </div>
            )}
          </div>
        );
      }
      case 'upsert_budget': {
        const d = action.data;
        const allCategories = categories.expense.includes(d.category)
          ? categories.expense
          : [d.category, ...categories.expense];
        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-sm flex items-center gap-2">
                <span className="text-lg">🎯</span>
                Configurar presupuesto mensual
              </p>
              {canInlineEdit && onActionChange && (
                <button
                  type="button"
                  onClick={() => setIsEditing(prev => !prev)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-primary hover:bg-surface-primary rounded-md transition-colors"
                >
                  <Edit2 size={11} />
                  {isEditing ? 'Listo' : 'Editar'}
                </button>
              )}
            </div>
            {isEditing && onActionChange ? (
              <div className="text-xs space-y-2 text-foreground bg-card rounded-lg p-2.5 border border-border">
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Categoría</label>
                  <select
                    value={d.category}
                    onChange={(e) => onActionChange({ ...action, data: { ...d, category: e.target.value } })}
                    className="w-full px-2 py-1 rounded border border-border bg-input text-foreground text-xs"
                  >
                    {allCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Tope mensual</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formatNumberForInput(d.amount)}
                    onChange={(e) => {
                      const nextAmount = parseCurrency(unformatNumber(e.target.value));
                      onActionChange({
                        ...action,
                        data: { ...d, amount: Number.isFinite(nextAmount) && nextAmount > 0 ? nextAmount : d.amount },
                      });
                    }}
                    className="w-full px-2 py-1 rounded border border-border bg-input text-foreground text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="text-xs space-y-1 text-foreground bg-card rounded-lg p-2 border border-border">
                <p className="flex justify-between"><span className="font-medium">Categoría:</span> <span className="font-semibold">{d.category}</span></p>
                <p className="flex justify-between"><span className="font-medium">Límite mensual:</span> <span className="font-semibold text-primary">{formatCurrency(d.amount)}</span></p>
              </div>
            )}
          </div>
        );
      }
      case 'add_recurring_payment': {
        const d = action.data;
        return (
          <div className="space-y-1.5">
            <p className="font-semibold text-sm flex items-center gap-2">
              <span className="text-lg">🔁</span>
              Crear pago periódico
            </p>
            <div className="text-xs space-y-1 text-foreground bg-card rounded-lg p-2 border border-border">
              <p className="flex justify-between"><span className="font-medium">Nombre:</span> <span className="font-semibold">{d.name}</span></p>
              <p className="flex justify-between"><span className="font-medium">Monto:</span> <span className="font-semibold text-primary">{formatCurrency(d.amount)}</span></p>
              <p className="flex justify-between"><span className="font-medium">Categoría:</span> <span>{d.category}</span></p>
              <p className="flex justify-between"><span className="font-medium">Día de pago:</span> <span>Día {d.dueDay} ({d.frequency === 'yearly' ? 'Anual' : 'Mensual'})</span></p>
              {d.accountName && (
                <p className="flex justify-between"><span className="font-medium">Cuenta:</span> <span>{d.accountName}</span></p>
              )}
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
    balanceTransactions,
    balancesReady,
    addTransaction: onAddTransaction,
    updateTransaction: onUpdateTransaction,
  } = financeSelectors.useTransactionDomain();
  const { accounts } = financeSelectors.useAccountDomain();
  const { categories, addCategory: onAddCategory } = financeSelectors.useCategoryDomain();
  const budgetsDomain = 'useBudgetsDomain' in financeSelectors
    ? financeSelectors.useBudgetsDomain()
    : undefined;
  const recurringDomain = 'useRecurringDomain' in financeSelectors
    ? financeSelectors.useRecurringDomain()
    : undefined;
  const debtsDomain = 'useDebtsDomain' in financeSelectors
    ? financeSelectors.useDebtsDomain()
    : undefined;
  const goalsDomain = 'useGoalsDomain' in financeSelectors
    ? financeSelectors.useGoalsDomain()
    : undefined;

  const budgets = budgetsDomain?.budgets;
  const onAddBudget = budgetsDomain?.addBudget;
  const onUpdateBudget = budgetsDomain?.updateBudget;
  const recurringPayments = recurringDomain?.recurringPayments;
  const onAddRecurringPayment = recurringDomain?.addRecurringPayment;
  const debts = debtsDomain?.debts;
  const savingsGoals = goalsDomain?.savingsGoals;

  const [messages, setMessages] = useState<UIChatMessage[]>(() => {
    if (typeof window === 'undefined') return [WELCOME_MESSAGE];
    try {
      const saved = window.localStorage.getItem(AI_CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as UIChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.role === 'model') {
          return parsed;
        }
      }
    } catch {
      // Fallback to default welcome message
    }
    return [WELCOME_MESSAGE];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Fase de espera: 'thinking' muestra "Pensando..." (respuestas rápidas);
  // 'reasoning' refuerza el mensaje tras REASONING_THRESHOLD_MS para que los
  // modelos de razonamiento no parezcan colgados. Es state-driven, sin animación.
  const [waitPhase, setWaitPhase] = useState<'thinking' | 'reasoning'>('thinking');
  // Indica que el mensaje placeholder en streaming ya tiene texto; mientras sea
  // falso se muestra el loader, y al llegar el primer delta se oculta (el texto
  // en vivo pasa a ser el feedback). Garantiza un único .animate-spin a la vez.
  const [streamingHasContent, setStreamingHasContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedRequest, setFailedRequest] = useState<PendingChatRequest | null>(null);
  const [executingAction, setExecutingAction] = useState<number | null>(null); // index of message with action being executed
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const executingActionRef = useRef<string | null>(null);
  const reasoningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const configured = isGeminiConfigured();

  // Persistir historial reciente en localStorage cuando no está en streaming activo
  useEffect(() => {
    if (typeof window === 'undefined' || isLoading) return;
    try {
      if (messages.length <= 1) {
        window.localStorage.removeItem(AI_CHAT_STORAGE_KEY);
      } else {
        const serializable = messages.slice(-24);
        window.localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(serializable));
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [messages, isLoading]);

  // Auto scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Limpiar el temporizador de "Razonando…" al desmontar.
  useEffect(() => () => {
    if (reasoningTimerRef.current !== null) clearTimeout(reasoningTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const composer = inputRef.current;
    const fallback = panelRef.current?.querySelector<HTMLButtonElement>(
      '[data-assistant-focus-fallback]:not([disabled])',
    );
    (composer && !composer.disabled ? composer : fallback)?.focus();
  }, [isOpen]);

  // Memoizar el contexto financiero 360° para evitar recalcular en cada render
  const financialData = useMemo(() => ({
    transactions: balanceTransactions,
    accounts,
    categories,
    budgets,
    recurringPayments,
    debts,
    savingsGoals,
  }), [balanceTransactions, accounts, categories, budgets, recurringPayments, debts, savingsGoals]);

  // Sugerencias dinámicas adaptadas al estado financiero actual
  const dynamicSuggestions = useMemo(() => {
    const items: string[] = [];
    const uncategorizedCount = balanceTransactions.filter(t => t.category === 'Otros').length;
    if (uncategorizedCount > 0) {
      items.push('Categoriza mis gastos en "Otros"');
    }
    const activeBudgets = budgets?.filter(b => b.isActive) ?? [];
    if (activeBudgets.length > 0) {
      items.push('¿Cómo van mis presupuestos este mes?');
    }
    const activeDebts = debts?.filter(d => !d.isSettled && d.remainingAmount > 0) ?? [];
    if (activeDebts.length > 0) {
      items.push('¿Cuánto me deben y qué préstamos tengo pendientes?');
    }
    for (const fallback of SUGGESTIONS) {
      if (items.length >= 4) break;
      if (!items.includes(fallback)) {
        items.push(fallback);
      }
    }
    return items.slice(0, 4);
  }, [balanceTransactions, budgets, debts]);

  const clearReasoningTimer = useCallback(() => {
    if (reasoningTimerRef.current !== null) {
      clearTimeout(reasoningTimerRef.current);
      reasoningTimerRef.current = null;
    }
  }, []);

  const performRequest = useCallback(async (request: PendingChatRequest) => {
    setIsLoading(true);
    setError(null);
    setFailedRequest(null);
    setWaitPhase('thinking');
    setStreamingHasContent(false);

    // Tras el umbral, refuerza el mensaje de espera (B): modelos de razonamiento
    // tardan en emitir texto y "Pensando..." se sentía colgados.
    clearReasoningTimer();
    reasoningTimerRef.current = setTimeout(() => setWaitPhase('reasoning'), REASONING_THRESHOLD_MS);

    // Placeholder de modelo que se rellena token a token (C). Se finaliza con la
    // acción + tokenUsage al resolver, o se elimina si falla.
    const streamingId = nextMsgId();
    const proposedAt = Date.now();
    let sawDelta = false;
    setMessages(prev => [...prev, { id: streamingId, role: 'model', content: '', proposedAt }]);

    try {
      const { text: rawText, action: toolAction, tokenUsage } = await sendChatMessageStream(
        request.text,
        request.history,
        financialData,
        (fullText) => {
          if (!fullText) return;
          if (!sawDelta) {
            sawDelta = true;
            // Primer texto en vivo: ocultar el loader y dejar de reforzar la espera.
            clearReasoningTimer();
            setStreamingHasContent(true);
          }
          setMessages(prev => prev.map(m => (m.id === streamingId ? { ...m, content: fullText } : m)));
        },
      );

      clearReasoningTimer();
      // Preferir function calling; mantener el parser de bloques como fallback.
      const { text, action: textAction } = parseActionFromResponse(rawText);
      const action = toolAction ?? textAction;
      setMessages(prev => prev.map(m => (m.id === streamingId
        ? { ...m, content: text, action, tokenUsage, proposedAt }
        : m)));
    } catch (err) {
      logger.error('[AIChatBot] Error sending message', err);
      clearReasoningTimer();
      // Quitar el placeholder para que un reintento conserve "mismos args, un
      // solo mensaje de usuario" y no deje un globo vacío.
      setMessages(prev => prev.filter(m => m.id !== streamingId));
      setError(getChatErrorMessage(err));
      setFailedRequest(request);
    } finally {
      setStreamingHasContent(false);
      setIsLoading(false);
    }
  }, [financialData, clearReasoningTimer]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    if (!balancesReady) {
      setError('Espera un momento: aún estamos cargando el historial financiero completo.');
      return;
    }

    const request: PendingChatRequest = {
      text: trimmed,
      // Historial sin el mensaje de bienvenida, limitado a los últimos N mensajes.
      history: messages
        .filter((_, index) => index > 0)
        .slice(-MAX_HISTORY_MESSAGES)
        .map((message) => ({ role: message.role, content: message.content })),
    };
    const userMessage: UIChatMessage = { id: nextMsgId(), role: 'user', content: trimmed };
    setMessages((previous) => [...previous, userMessage]);
    setInput('');
    await performRequest(request);
  }, [balancesReady, isLoading, messages, performRequest]);

  const retryFailedRequest = useCallback(() => {
    if (!failedRequest || isLoading) return;
    void performRequest(failedRequest);
  }, [failedRequest, isLoading, performRequest]);

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
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(AI_CHAT_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
    }
    setMessages([WELCOME_MESSAGE]);
    setError(null);
    setFailedRequest(null);
  }, []);

  const handleUpdateAction = useCallback((msgIndex: number, updatedAction: ChatAction) => {
    setMessages(prev => prev.map((m, idx) => (idx === msgIndex ? { ...m, action: updatedAction } : m)));
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
    if (
      !msg?.action
      || msg.actionExecuted
      || executingActionRef.current !== null
    ) return;

    executingActionRef.current = msg.id;
    setExecutingAction(msgIndex);
    try {
      const action = msg.action;
      const operationIdFor = (scope?: string) =>
        createAiLedgerOperationId(msg.id, action, scope);
      const markActionExecuted = (content: string) => {
        setMessages(prev => {
          const updated = prev.map(message => message.id === msg.id
            ? { ...message, actionExecuted: true, financialCommitted: true }
            : message
          );
          return [...updated, { id: nextMsgId(), role: 'model', content }];
        });
      };
      const createCategoryAfterCommit = async (
        categoryType: 'income' | 'expense',
        name: string,
      ): Promise<boolean> => {
        try {
          await onAddCategory(categoryType, name);
          return true;
        } catch (categoryError) {
          const categoryErrorMessage = categoryError instanceof Error
            ? categoryError.message
            : String(categoryError);
          setMessages(prev => [
            ...prev.map(message => message.id === msg.id
              ? { ...message, financialCommitted: true }
              : message
            ),
            {
              id: nextMsgId(),
              role: 'model',
              content: `⚠️ El movimiento financiero sí quedó registrado, pero no pude guardar la categoría **"${name}"**: ${categoryErrorMessage}. Reintenta confirmar para completar la categoría; el movimiento no se duplicará.`,
            },
          ]);
          return false;
        }
      };

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
          const proposedDate = d.date
            ? new Date(d.date)
            : new Date(msg.proposedAt ?? Date.now());
          if (!Number.isFinite(proposedDate.getTime())) {
            throw new Error('Fecha de transacción inválida');
          }

          const txCatType = d.txType === 'income' ? 'income' : 'expense';
          const txExistingCats = txCatType === 'income' ? categories.income : categories.expense;
          await onAddTransaction({
            type: d.txType,
            amount: d.amount,
            category: d.category,
            description: safeDescription,
            date: proposedDate,
            paid: d.paid ?? true,
            accountId: d.accountId,
            operationId: operationIdFor(),
            mutationSource: 'ai',
          });
          if (
            !txExistingCats.includes(d.category)
            && !await createCategoryAfterCommit(txCatType, d.category)
          ) return;
          markActionExecuted(`✅ ¡Listo! Se agregó el ${d.txType === 'income' ? 'ingreso' : 'gasto'} de **${formatCurrency(d.amount)}** en **${d.category}** (${d.accountName}).`);
          break;
        }
        case 'add_transfer': {
          const d = action.data;
          if (typeof d.amount !== 'number' || isNaN(d.amount) || d.amount <= 0 || d.amount > 999999999999) {
            throw new Error(`Monto inválido: ${d.amount}`);
          }
          if (!d.fromAccountId || !accounts.find(a => a.id === d.fromAccountId)) {
            throw new Error('Cuenta origen no encontrada.');
          }
          if (!d.toAccountId || !accounts.find(a => a.id === d.toAccountId)) {
            throw new Error('Cuenta destino no encontrada.');
          }
          if (d.fromAccountId === d.toAccountId) {
            throw new Error('La cuenta origen y destino deben ser distintas.');
          }
          const safeDesc = (d.description || `Transferencia a ${d.toAccountName}`).toString().slice(0, 500).trim();
          const transferDate = d.date
            ? new Date(d.date)
            : new Date(msg.proposedAt ?? Date.now());
          if (!Number.isFinite(transferDate.getTime())) {
            throw new Error('Fecha de transferencia inválida');
          }

          await onAddTransaction({
            type: 'transfer',
            amount: d.amount,
            category: TRANSFER_CATEGORY,
            description: safeDesc,
            date: transferDate,
            paid: true,
            accountId: d.fromAccountId,
            toAccountId: d.toAccountId,
            operationId: operationIdFor('transfer'),
            mutationSource: 'ai',
          });
          markActionExecuted(`✅ ¡Listo! Se registró la transferencia de **${formatCurrency(d.amount)}** desde **${d.fromAccountName}** hacia **${d.toAccountName}**.`);
          break;
        }
        case 'upsert_budget': {
          const d = action.data;
          if (typeof d.amount !== 'number' || isNaN(d.amount) || d.amount <= 0 || d.amount > 999999999999) {
            throw new Error(`Monto de presupuesto inválido: ${d.amount}`);
          }
          if (!d.category || typeof d.category !== 'string' || d.category.length > 100) {
            throw new Error('Categoría de presupuesto inválida');
          }
          if (!onAddBudget && !onUpdateBudget) {
            throw new Error('El módulo de presupuestos no está disponible en este momento.');
          }
          const existingBudget = budgets?.find(b => b.category.toLowerCase() === d.category.toLowerCase());
          if (existingBudget?.id && onUpdateBudget) {
            await onUpdateBudget(existingBudget.id, { monthlyLimit: d.amount, isActive: true });
            markActionExecuted(`✅ ¡Listo! Se actualizó el presupuesto mensual de **${existingBudget.category}** a **${formatCurrency(d.amount)}**.`);
          } else if (onAddBudget) {
            await onAddBudget({ category: d.category, monthlyLimit: d.amount, isActive: true });
            markActionExecuted(`✅ ¡Listo! Se creó el presupuesto mensual de **${formatCurrency(d.amount)}** para **${d.category}**.`);
          }
          break;
        }
        case 'add_recurring_payment': {
          const d = action.data;
          if (typeof d.amount !== 'number' || isNaN(d.amount) || d.amount <= 0 || d.amount > 999999999999) {
            throw new Error(`Monto inválido: ${d.amount}`);
          }
          if (!d.name || typeof d.name !== 'string') {
            throw new Error('Nombre de pago periódico inválido');
          }
          if (!onAddRecurringPayment) {
            throw new Error('El módulo de pagos periódicos no está disponible en este momento.');
          }
          const dueDay = Math.min(31, Math.max(1, Math.round(d.dueDay || 1)));
          const validAccount = d.accountId && accounts.some(a => a.id === d.accountId) ? d.accountId : undefined;
          await onAddRecurringPayment({
            name: d.name.trim(),
            amount: d.amount,
            category: d.category || 'Suscripciones',
            dueDay,
            frequency: d.frequency === 'yearly' ? 'yearly' : 'monthly',
            isActive: true,
            ...(validAccount ? { accountId: validAccount } : {}),
          });
          markActionExecuted(`✅ ¡Listo! Se creó el pago periódico **${d.name}** por **${formatCurrency(d.amount)}** (día ${dueDay} de cada ${d.frequency === 'yearly' ? 'año' : 'mes'}).`);
          break;
        }
        case 'update_category': {
          const d = action.data;
          // AUDIT-FIX: Validar que la transacción exista antes de actualizar
          const txForCat = balanceTransactions.find(t => t.id === d.transactionId);
          if (!txForCat) {
            throw new Error(`Transacción no encontrada (ID: ${d.transactionId})`);
          }
          if (!d.newCategory || typeof d.newCategory !== 'string' || d.newCategory.length > 100) {
            throw new Error('Categoría nueva inválida');
          }
          const catType = txForCat.type === 'income' ? 'income' : 'expense';
          const existingCats = catType === 'income' ? categories.income : categories.expense;
          await onUpdateTransaction(d.transactionId, {
            category: d.newCategory,
            operationId: operationIdFor(`edit:${d.transactionId}`),
            mutationSource: 'ai',
          });
          if (
            !existingCats.includes(d.newCategory)
            && !await createCategoryAfterCommit(catType, d.newCategory)
          ) return;
          markActionExecuted(`✅ ¡Listo! "${d.description}" se movió de **${d.oldCategory}** a **${d.newCategory}**.`);
          break;
        }
        case 'bulk_update_category': {
          const updates = action.data.updates;
          const validUpdates = [...new Map(
            updates
              .filter((update: { transactionId: string }) =>
                balanceTransactions.some(transaction => transaction.id === update.transactionId)
              )
              .map(update => [update.transactionId, update] as const)
          ).values()];
          const newCategories = new Map<string, {
            categoryType: 'income' | 'expense';
            name: string;
          }>();
          for (const u of validUpdates) {
            const tx = balanceTransactions.find(t => t.id === u.transactionId)!;
            const cType = tx.type === 'income' ? 'income' : 'expense';
            const existing = cType === 'income' ? categories.income : categories.expense;
            if (!existing.includes(u.newCategory)) {
              newCategories.set(`${cType}:${u.newCategory}`, {
                categoryType: cType,
                name: u.newCategory,
              });
            }
          }
          for (const u of validUpdates) {
            await onUpdateTransaction(u.transactionId, {
              category: u.newCategory,
              operationId: operationIdFor(`edit:${u.transactionId}`),
              mutationSource: 'ai',
            });
          }
          for (const category of newCategories.values()) {
            if (!await createCategoryAfterCommit(category.categoryType, category.name)) return;
          }
          const skipped = updates.length - validUpdates.length;
          const skipNote = skipped > 0 ? ` (${skipped} no encontradas)` : '';
          markActionExecuted(`✅ ¡Listo! Se recategorizaron **${validUpdates.length} transacciones** correctamente${skipNote}.`);
          break;
        }
        case 'add_category': {
          const d = action.data;
          await onAddCategory(d.categoryType, d.name);
          markActionExecuted(`✅ ¡Listo! Se creó la categoría **"${d.name}"** en ${d.categoryType === 'expense' ? 'gastos' : 'ingresos'}.`);
          break;
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev => [...prev, { id: nextMsgId(), role: 'model', content: `❌ Error al ejecutar la acción: ${errorMsg}` }]);
    } finally {
      if (executingActionRef.current === msg.id) {
        executingActionRef.current = null;
      }
      setExecutingAction(null);
    }
  }, [
    accounts,
    budgets,
    categories.expense,
    categories.income,
    messages,
    onAddBudget,
    onAddCategory,
    onAddRecurringPayment,
    onAddTransaction,
    onUpdateBudget,
    onUpdateTransaction,
    balanceTransactions,
  ]);

  const handleRejectAction = useCallback((msgIndex: number) => {
    setMessages(prev => {
      const updated = [...prev];
      const target = updated[msgIndex];
      updated[msgIndex] = { ...target, action: undefined };
      updated.push({
        id: nextMsgId(),
        role: 'model',
        content: target?.financialCommitted
          ? 'Entendido. No se reintentó crear la categoría; el movimiento financiero permanece registrado.'
          : 'Entendido, no se realizó ningún cambio. 👍',
      });
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
          // No renderizar el placeholder de streaming aún vacío: el loader ya
          // da feedback y así no aparece un globo vacío junto al spinner.
          msg.role === 'model' && msg.content === '' && !msg.action ? null : (
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
                  accounts={accounts}
                  categories={categories}
                  onActionChange={(updated) => handleUpdateAction(i, updated)}
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
          )
        ))}

        {isLoading && !streamingHasContent && (
          <div className="flex gap-2 justify-start animate-in fade-in duration-200">
            <div className="shrink-0 w-7 h-7 rounded-full bg-surface-primary text-primary-text flex items-center justify-center mt-1 border border-border-accent">
              <Bot size={14} />
            </div>
            <div className="bg-card text-card-foreground px-4 py-3 rounded-2xl rounded-bl-md shadow-sm border border-border">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">
                  {waitPhase === 'reasoning' ? 'Razonando…' : 'Pensando...'}
                </span>
              </div>
              {waitPhase === 'reasoning' && (
                <p className="mt-1 text-[11px] text-muted-foreground">Esto puede tardar un poco</p>
              )}
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="text-center px-3 py-2 text-xs text-destructive bg-destructive-muted rounded-lg border border-destructive animate-in fade-in duration-200">
            <div className="flex items-center justify-center gap-2">
              <XCircle size={14} />
              <span>{error}</span>
            </div>
            {failedRequest && (
              <button
                type="button"
                onClick={retryFailedRequest}
                disabled={isLoading}
                className="control-target-44 mx-auto mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <RefreshCw size={13} aria-hidden="true" />
                Reintentar
              </button>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sugerencias dinámicas (solo al inicio) */}
      {messages.length <= 1 && !isLoading && configured && (
        <div className="px-3 sm:px-4 pb-2 flex flex-wrap gap-1.5 shrink-0 animate-in fade-in duration-200">
          {dynamicSuggestions.map((s) => (
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
