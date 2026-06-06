'use client';

import React, { useState, useCallback } from 'react';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import type { FinancialPlan, PlanConfig } from '../../../../hooks/useFinancialPlan';
import { getFinancialAdvice } from '../../../../lib/geminiPlan';
import { useGeminiKey } from '../../../../contexts/GeminiKeyContext';

interface Props {
  plan: FinancialPlan;
  config: PlanConfig;
}

export const FinancialPlanAI: React.FC<Props> = ({ plan, config }) => {
  const { isConfigured, hasConsent } = useGeminiKey();
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // S4: sin key configurada o sin consentimiento, no ofrecer la función de IA.
  const aiEnabled = isConfigured && hasConsent;

  const fetchAdvice = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getFinancialAdvice(plan, config);
      setAdvice(result);
    } catch {
      setAdvice('No pude generar consejos en este momento. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [plan, config]);

  if (!aiEnabled) return null;

  if (!advice && !loading) {
    return (
      <div className="card">
        <button onClick={fetchAdvice} className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-xl transition-colors">
          <Sparkles size={16} />
          Obtener consejos personalizados con IA
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-purple-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Consejos IA</h3>
        </div>
        <button onClick={fetchAdvice} disabled={loading} className="p-1.5 text-gray-400 hover:text-purple-600 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-4 justify-center text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" /> Analizando tus finanzas...
        </div>
      ) : (
        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">
          {advice}
        </div>
      )}
    </div>
  );
};
