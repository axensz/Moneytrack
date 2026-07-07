'use client';

import React from 'react';
import { CheckCircle2, Circle, Wallet, Plus, Sparkles } from 'lucide-react';

interface OnboardingChecklistProps {
  hasAccounts: boolean;
  hasTransactions: boolean;
  aiReady: boolean;
  onGoToAccounts: () => void;
  onAddTransaction: () => void;
  onOpenAISettings: () => void;
}

/**
 * P-onboarding: checklist pasivo de primeros pasos.
 *
 * Se marca solo con el estado real de la app y se mantiene visible mientras
 * falte algun paso. Desaparece unicamente cuando todo queda completo.
 */
export function OnboardingChecklist({
  hasAccounts,
  hasTransactions,
  aiReady,
  onGoToAccounts,
  onAddTransaction,
  onOpenAISettings,
}: OnboardingChecklistProps) {
  const steps = [
    { key: 'account', label: 'Crea tu primera cuenta', done: hasAccounts, icon: Wallet, cta: 'Ir a Cuentas', onAction: onGoToAccounts },
    { key: 'transaction', label: 'Registra tu primer movimiento', done: hasTransactions, icon: Plus, cta: 'Registrar', onAction: onAddTransaction },
    { key: 'ai', label: 'Activa el asistente IA (opcional)', done: aiReady, icon: Sparkles, cta: 'Configurar', onAction: onOpenAISettings },
  ];

  const completed = steps.filter(s => s.done).length;
  const allDone = completed === steps.length;

  if (allDone) return null;

  return (
    <section
      aria-label="Primeros pasos"
      className="fixed bottom-[156px] left-4 right-4 z-40 rounded-2xl border border-border-accent bg-card/95 p-4 shadow-2xl backdrop-blur-sm sm:bottom-6 sm:left-6 sm:right-auto sm:w-[360px] sm:p-5"
    >
      <div className="mb-3">
        <h2 className="text-sm font-bold text-foreground">Primeros pasos</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {completed} de {steps.length} completados
        </p>
      </div>

      <ul className="space-y-2">
        {steps.map(step => (
          <li
            key={step.key}
            className="flex items-center gap-3 rounded-xl bg-card px-3 py-2"
          >
            {step.done
              ? <CheckCircle2 size={18} className="shrink-0 text-success" aria-hidden="true" />
              : <Circle size={18} className="shrink-0 text-muted-foreground/50" aria-hidden="true" />}
            <span className={`flex-1 text-sm ${step.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
              {step.label}
            </span>
            {!step.done && (
              <button
                onClick={step.onAction}
                className="flex items-center gap-1 rounded-lg bg-primary-solid px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
