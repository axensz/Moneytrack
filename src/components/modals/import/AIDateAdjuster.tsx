'use client';

import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { getGeminiClient } from '../../../lib/geminiClient';
import { isAIAvailable } from '../../../utils/aiCategorizer';
import type { ImportRow } from '../../../hooks/useImportTransactions';

/** Ajuste masivo de fechas de las filas importadas usando IA Gemini. */
export function AIDateAdjuster({ rows, setRows }: { rows: ImportRow[]; setRows: React.Dispatch<React.SetStateAction<ImportRow[]>> }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleAdjust = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setFeedback('');

    if (!isAIAvailable()) { setFeedback('Configura tu API key de Gemini en Ajustes'); setLoading(false); return; }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayName = today.toLocaleDateString('es-CO', { weekday: 'long' });

    // Build transaction list with descriptions for individual date assignment
    const transactionList = rows.map((r, i) => ({
      index: i,
      description: r.description,
      currentDate: r.date.toISOString().split('T')[0],
      amount: r.amount,
      type: r.type,
    }));

    try {
      const ai = await getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Hoy es ${dayName} ${todayStr}. Tengo ${rows.length} transacciones importadas de un extracto bancario. El usuario dice: "${prompt.trim()}".

Necesito que asignes la fecha correcta a CADA transacción individualmente basándote en el contexto del usuario y las descripciones. Si una descripción menciona un día de la semana o una fecha relativa, úsala. Si no hay pista clara, distribuye lógicamente según el contexto.

Transacciones:
${transactionList.map(t => `[${t.index}] "${t.description}" (${t.type}, $${t.amount}, fecha actual: ${t.currentDate})`).join('\n')}

Responde SOLO un JSON array con la fecha asignada a cada transacción por su índice:
[{"index":0,"date":"YYYY-MM-DD"},{"index":1,"date":"YYYY-MM-DD"},...]

Sin explicaciones, solo el JSON array.`,
        config: { temperature: 0 },
      });

      const text = response.text?.trim() || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) { setFeedback('No pude interpretar. Intenta ser más específico.'); setLoading(false); return; }

      const assignments: { index: number; date: string }[] = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(assignments) || assignments.length === 0) {
        setFeedback('Respuesta incompleta de la IA.'); setLoading(false); return;
      }

      // Validar rango/cordura: una fecha de extracto no puede caer fuera de
      // [hoy-10 años, hoy+1 año]. Antes solo se filtraba !isNaN, así que la IA
      // podía asignar un año absurdo (0202, 2099) que corrompía estadísticas.
      const minDate = new Date(today.getFullYear() - 10, 0, 1);
      const maxDate = new Date(today.getFullYear() + 1, 11, 31);
      const toReasonableDate = (value: string): Date | null => {
        const d = new Date(value + 'T12:00:00');
        if (isNaN(d.getTime()) || d < minDate || d > maxDate) return null;
        return d;
      };

      // Apply individual dates
      const dateMap = new Map(assignments.map(a => [a.index, a.date]));
      let applied = 0;
      setRows(prev => prev.map((r, i) => {
        const newDateStr = dateMap.get(i);
        if (newDateStr) {
          const newDate = toReasonableDate(newDateStr);
          if (newDate) {
            applied++;
            return { ...r, date: newDate };
          }
        }
        return r;
      }));

      if (applied === 0) {
        setFeedback('La IA devolvió fechas fuera de rango; no se aplicó ninguna.'); setLoading(false); return;
      }

      // Show range of assigned dates
      const assignedDates = assignments
        .map(a => toReasonableDate(a.date))
        .filter((d): d is Date => d !== null);
      const minAssigned = new Date(Math.min(...assignedDates.map(d => d.getTime())));
      const maxAssigned = new Date(Math.max(...assignedDates.map(d => d.getTime())));

      setFeedback(`✓ ${applied} fechas asignadas individualmente: ${minAssigned.toLocaleDateString('es-CO')} → ${maxAssigned.toLocaleDateString('es-CO')}`);
      setPrompt('');
    } catch {
      setFeedback('Error al consultar la IA.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800/50">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={14} className="text-purple-600 dark:text-purple-400" />
        <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">Ajustar fechas con IA</span>
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdjust()}
          placeholder='Ej: "la primera es de hoy, las demás del lunes y martes"'
          className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary"
          disabled={loading}
        />
        <button
          onClick={handleAdjust}
          disabled={loading || !prompt.trim()}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          Ajustar
        </button>
      </div>
      {feedback && (
        <p className={`text-[11px] mt-1.5 ${feedback.startsWith('✓') ? 'text-green-600 dark:text-green-400' : 'text-rose-500 dark:text-rose-400'}`}>
          {feedback}
        </p>
      )}
    </div>
  );
}
