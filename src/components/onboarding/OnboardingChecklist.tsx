'use client';

import React, { useState } from 'react';
import { CheckCircle2, Circle, X, Wallet, Plus, Sparkles } from 'lucide-react';

interface OnboardingChecklistProps {
  hasAccounts: boolean;
  hasTransactions: boolean;
  aiReady: boolean;
  onGoToAccounts: () => void;
  onAddTransaction: () => void;
  onOpenAISettings: () => void;
}

const DISMISSED_KEY = 'moneytrack_onboarding_dismissed';

/**
 * P-onboarding — Checklist pasivo de primeros pasos.
 *
 * Reemplaza la dependencia del manual estático como onboarding: una tarjeta
 * dismissable con 3 pasos que se marcan SOLOS al completarse (derivados del
 * estado real: hay cuentas, hay movimientos, IA lista). Se oculta al completar
 * todo o si el usuario la cierra (persistido en localStorage). No intrusivo:
 * no bloquea la UI ni usa overlays.
 */
export function OnboardingChecklist({
  hasAccounts,
  hasTransactions,
  aiReady,
  onGoToAccounts,
  onAddTransaction,
  onOpenAISettings,
}: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(DISMISSED_KEY) === 'true'
  );

  const steps = [
    { key: 'account', label: 'Crea tu primera cuenta', done: hasAccounts, icon: Wallet, cta: 'Ir a Cuentas', onAction: onGoToAccounts },
    { key: 'transaction', label: 'Registra tu primer movimiento', done: hasTransactions, icon: Plus, cta: 'Registrar', onAction: onAddTransaction },
    { key: 'ai', label: 'Activa el asistente IA (opcional)', done: aiReady, icon: Sparkles, cta: 'Configurar', onAction: onOpenAISettings },
  ];

  const completed = steps.filter(s => s.done).length;
  const allDone = completed === steps.length;

  if (dismissed || allDone) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, 'true'); } catch { /* noop */ }
  };

  return (
    <section
      aria-label="Primeros pasos"
      className="mb-4 rounded-2xl border border-purple-200 dark:border-purple-800/60 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Primeros pasos</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {completed} de {steps.length} completados
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Ocultar primeros pasos"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-700/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          <X size={16} />
        </button>
      </div>

      <ul className="space-y-2">
        {steps.map(step => (
          <li
            key={step.key}
            className="flex items-center gap-3 rounded-xl bg-white/70 dark:bg-gray-800/50 px-3 py-2"
          >
            {step.done
              ? <CheckCircle2 size={18} className="shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
              : <Circle size={18} className="shrink-0 text-gray-300 dark:text-gray-600" aria-hidden="true" />}
            <span className={`flex-1 text-sm ${step.done ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-700 dark:text-gray-200'}`}>
              {step.label}
            </span>
            {!step.done && (
              <button
                onClick={step.onAction}
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                <step.icon size={12} aria-hidden="true" />
                {step.cta}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
